import { Loader2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { addRoomMember, cancelRoomInvitation, removeRoomMember, updateRoomMember } from "@/api.client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/error.message";
import type { RoomMemberItem, RoomRole } from "../../shared/api.types";
import { RoleSelect } from "./RoleSelect";
import { ROOM_SETTINGS_TEXT as TEXT } from "./room-settings.labels";

type Props = { roomId: string; item: RoomMemberItem; onUpdated: (item: RoomMemberItem) => void; onRemoved: () => void };

/** Satu anggota/undangan pending: ubah peran (pending: POST ulang = upsert) dan keluarkan/batalkan. */
export function MemberRow({ roomId, item, onUpdated, onRemoved }: Props) {
  const [busy, setBusy] = useState(false);
  const who = item.kind === "member" ? item.name || item.email : item.email;

  async function run(op: () => Promise<void>, what: string) {
    setBusy(true);
    try {
      await op();
    } catch (err) {
      // last_host (409) dan member_not_found (404) diterjemahkan error.message.ts.
      console.error(`room-settings: ${what} room ${roomId} gagal`, err);
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const changeRole = (role: RoomRole) =>
    run(async () => {
      const next = item.kind === "member" ? await updateRoomMember(roomId, item.userId, { role }) : await addRoomMember(roomId, { email: item.email, role });
      onUpdated(next);
      toast.success(TEXT.roleUpdated);
    }, "ubah peran");

  const remove = () =>
    run(async () => {
      if (item.kind === "member") await removeRoomMember(roomId, item.userId);
      else await cancelRoomInvitation(roomId, item.email);
      onRemoved();
      toast.success(item.kind === "member" ? TEXT.memberRemoved(who) : TEXT.inviteCanceled(item.email));
    }, "hapus anggota");

  return (
    <li className="flex items-center gap-3 p-2.5" data-testid="member-row" data-kind={item.kind} data-email={item.email}>
      <Avatar className="size-8">
        {item.kind === "member" && item.image && <AvatarImage src={item.image} alt="" />}
        <AvatarFallback className="text-xs">{who.slice(0, 1).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-2 truncate text-sm font-medium">
          <span className="truncate">{who}</span>
          {item.kind === "pending" && <Badge variant="secondary">{TEXT.pending}</Badge>}
        </span>
        {item.kind === "member" && <span className="truncate text-xs text-muted-foreground">{item.email}</span>}
      </div>
      <div className="w-28 shrink-0 sm:w-32">
        <RoleSelect value={item.role} onChange={(r) => void changeRole(r)} label={TEXT.memberRoleFor(who)} testId="member-row-role" disabled={busy} />
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={busy}
        data-testid="member-remove"
        aria-label={item.kind === "member" ? TEXT.memberRemove(who) : TEXT.inviteCancel(item.email)}
        onClick={() => void remove()}
      >
        {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <X aria-hidden="true" />}
      </Button>
    </li>
  );
}
