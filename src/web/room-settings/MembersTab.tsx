import { Loader2, UserPlus } from "lucide-react";
import { useCallback, useState, type SubmitEvent } from "react";
import { toast } from "sonner";
import { addRoomMember, listRoomMembers } from "@/api.client";
import { useCursorList } from "@/admin/useCursorList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/error.message";
import type { RoomMemberItem, RoomRole } from "../../shared/api.types";
import { MemberRow } from "./MemberRow";
import { RoleSelect } from "./RoleSelect";
import { ROOM_SETTINGS_TEXT as TEXT } from "./room-settings.labels";

/** Tab Anggota: tambah per email (R2), daftar member + pending, ubah peran, keluarkan/batalkan (R9). */
export function MembersTab({ roomId }: { roomId: string }) {
  const fetchPage = useCallback((cursor?: string) => listRoomMembers(roomId, { cursor }), [roomId]);
  const list = useCursorList<RoomMemberItem>(fetchPage, roomId);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<RoomRole>("participant");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      const added = await addRoomMember(roomId, { email: email.trim(), role });
      toast.success(TEXT.memberAdded(added.email));
      setEmail("");
      list.reload(); // urutan server: member (nama) lalu pending (email)
    } catch (err) {
      console.error(`room-settings: tambah anggota room ${roomId} gagal`, err);
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form className="flex flex-col gap-2" onSubmit={onSubmit}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor="member-email">{TEXT.memberEmail}</Label>
            <Input
              id="member-email"
              data-testid="member-email-input"
              type="email"
              required
              autoComplete="off"
              placeholder={TEXT.memberEmailPlaceholder}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-describedby="member-email-hint"
            />
          </div>
          <RoleSelect value={role} onChange={setRole} label={TEXT.memberRole} testId="member-role-select" />
          <Button type="submit" disabled={busy || !email.trim()} data-testid="member-add">
            {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <UserPlus aria-hidden="true" />}
            {TEXT.memberAdd}
          </Button>
        </div>
        <p id="member-email-hint" className="text-xs text-muted-foreground">
          {TEXT.memberAddHint}
        </p>
      </form>

      <div aria-busy={list.loading}>
        {list.loading && list.items.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            {TEXT.membersLoading}
          </p>
        ) : list.error && list.items.length === 0 ? (
          <p className="text-sm text-destructive" role="alert">
            {list.error}
          </p>
        ) : list.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{TEXT.membersEmpty}</p>
        ) : (
          <ul className="flex flex-col divide-y rounded-lg border" data-testid="member-list">
            {list.items.map((item) => (
              <MemberRow
                key={item.kind === "member" ? `m:${item.userId}` : `p:${item.email}`}
                roomId={roomId}
                item={item}
                onUpdated={(next) => list.setItems((prev) => prev.map((x) => (x === item ? next : x)))}
                onRemoved={() => list.setItems((prev) => prev.filter((x) => x !== item))}
              />
            ))}
          </ul>
        )}
      </div>
      {list.hasMore && list.items.length > 0 && (
        <Button type="button" variant="outline" size="sm" className="self-center" disabled={list.loading} onClick={list.loadMore} data-testid="members-load-more">
          {list.loading && <Loader2 className="animate-spin" aria-hidden="true" />}
          {TEXT.loadMore}
        </Button>
      )}
    </div>
  );
}
