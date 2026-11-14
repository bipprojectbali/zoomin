import { Loader2, UserPlus } from "lucide-react";
import { useCallback, useRef, useState, type SubmitEvent } from "react";
import { toast } from "sonner";
import { addRoomMember, listRoomMembers } from "@/api.client";
import { useCursorList } from "@/admin/useCursorList";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/error.message";
import { InvitePicker, type InvitePickerHandle } from "@/invite-picker/InvitePicker";
import { validInvites, type InviteEntry } from "@/invite-picker/invite.parse";
import { INVITE_PICKER_TEXT as PICKER_TEXT } from "@/invite-picker/invite-picker.labels";
import type { RoomMemberItem } from "../../shared/api.types";
import { MemberRow } from "./MemberRow";
import { ROOM_SETTINGS_TEXT as TEXT } from "./room-settings.labels";

/** Tab Anggota: tambah per email (R2), daftar member + pending, ubah peran, keluarkan/batalkan (R9). */
export function MembersTab({ roomId }: { roomId: string }) {
  const fetchPage = useCallback((cursor?: string) => listRoomMembers(roomId, { cursor }), [roomId]);
  const list = useCursorList<RoomMemberItem>(fetchPage, roomId);
  const [invites, setInvites] = useState<InviteEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const picker = useRef<InvitePickerHandle>(null);

  /** P6: POST /members berurutan; chip yang gagal tetap di picker agar bisa diperbaiki/dicoba lagi. */
  async function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const bodies = validInvites(picker.current?.flush() ?? invites);
    if (!bodies.length) return;
    setBusy(true);
    const failed: { email: string; reason: string }[] = [];
    for (const body of bodies) {
      try {
        await addRoomMember(roomId, body);
      } catch (err) {
        console.error(`room-settings: tambah anggota room ${roomId} gagal`, err);
        failed.push({ email: body.email, reason: errorMessage(err) });
      }
    }
    const failedEmails = new Set(failed.map((f) => f.email));
    setInvites((prev) => prev.filter((v) => failedEmails.has(v.email)));
    const summary = PICKER_TEXT.summary(bodies.length - failed.length, failed.length);
    if (failed.length) toast.error(summary, { description: failed.map((f) => PICKER_TEXT.failedItem(f.email, f.reason)).join("; ") });
    else toast.success(bodies.length === 1 ? TEXT.memberAdded(bodies[0]!.email) : summary);
    if (failed.length < bodies.length) list.reload(); // urutan server: member (nama) lalu pending (email)
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <form className="flex flex-col gap-2" onSubmit={onSubmit}>
        <Label htmlFor="member-email">{PICKER_TEXT.label}</Label>
        <InvitePicker
          ref={picker}
          value={invites}
          onChange={setInvites}
          inputId="member-email"
          describedBy="member-email-hint"
          disabled={busy}
          legacyInputTestId="member-email-input"
          action={
            // testid ganda: `members-add-submit` (spec 07) di pembungkus, `member-add` (e2e lama) di tombol.
            <div data-testid="members-add-submit" className="self-end sm:self-auto">
              {/* Tidak di-disable saat chip kosong: submit juga meng-commit email yang masih diketik (flush). */}
              <Button type="submit" disabled={busy} data-testid="member-add">
                {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <UserPlus aria-hidden="true" />}
                {PICKER_TEXT.submit}
              </Button>
            </div>
          }
        />
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
