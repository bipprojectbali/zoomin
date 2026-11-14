/** Control bar bawah tinggi tetap (UX-02): Mic · Kamera | Layar | Peserta · Undang | Keluar; mobile: overflow "Lainnya" (UX-20). */
import type { Room } from "livekit-client";
import { Ellipsis, PhoneOff, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ControlTooltip } from "./ControlTooltip";
import { InviteDialog } from "./InviteDialog";
import { MediaControls } from "./MediaControls";
import { ROOM_LABELS } from "./room.labels";
import { ScreenControls } from "./ScreenControls";

export type ControlBarProps = {
  room: Room;
  roomId: string;
  /** false saat reconnect/putus: semua kontrol kecuali Keluar dinonaktifkan (BUG-03). */
  enabled: boolean;
  /** false untuk viewer: tanpa mic/kamera/layar. */
  canPublish: boolean;
  /** Admin room: tampilkan Undang. */
  canInvite: boolean;
  participantCount: number;
  onOpenParticipants: () => void;
  onLeave: () => void;
};

export function ControlBar(p: ControlBarProps) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const disabled = !p.enabled;
  const participantsLabel = ROOM_LABELS.participants(p.participantCount);

  return (
    <footer className="flex h-20 shrink-0 items-center justify-center gap-2 border-t px-2 sm:gap-3" role="toolbar" aria-label={ROOM_LABELS.controls}>
      {p.canPublish && (
        <>
          <MediaControls room={p.room} disabled={disabled} />
          <ScreenControls room={p.room} disabled={disabled} />
        </>
      )}

      <div className="hidden items-center gap-2 sm:flex sm:gap-3">
        <ControlTooltip label={participantsLabel}>
          <Button
            type="button"
            variant="secondary"
            className="h-10 rounded-full px-4"
            aria-label={participantsLabel}
            onClick={p.onOpenParticipants}
            data-testid="open-participants"
          >
            <Users />
            <span className="tabular-nums">{p.participantCount}</span>
          </Button>
        </ControlTooltip>
        {/* Dialog di-portal: tetap tampil di mobile meski pemicunya tersembunyi. */}
        {p.canInvite && <InviteDialog roomId={p.roomId} open={inviteOpen} onOpenChange={setInviteOpen} />}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="secondary" size="icon-lg" className="rounded-full sm:hidden" aria-label={ROOM_LABELS.more} data-testid="open-more">
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="end">
          <DropdownMenuItem onSelect={p.onOpenParticipants}>
            <Users />
            {participantsLabel}
          </DropdownMenuItem>
          {p.canInvite && (
            <DropdownMenuItem onSelect={() => setInviteOpen(true)}>
              <UserPlus />
              {ROOM_LABELS.invite}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <LeaveButton onLeave={p.onLeave} />
    </footer>
  );
}

/** Keluar merah + konfirmasi ringan. Admin pun hanya "Keluar"; tidak ada "akhiri untuk semua". */
function LeaveButton({ onLeave }: { onLeave: () => void }) {
  return (
    <AlertDialog>
      <ControlTooltip label={ROOM_LABELS.leave}>
        <AlertDialogTrigger asChild>
          <Button type="button" variant="destructive" className="h-10 rounded-full px-3 sm:px-5" aria-label={ROOM_LABELS.leave} data-testid="leave-room">
            <PhoneOff />
            <span className="hidden sm:inline">{ROOM_LABELS.leave}</span>
          </Button>
        </AlertDialogTrigger>
      </ControlTooltip>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{ROOM_LABELS.leaveTitle}</AlertDialogTitle>
          <AlertDialogDescription>{ROOM_LABELS.leaveDescription}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{ROOM_LABELS.cancel}</AlertDialogCancel>
          <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={onLeave} data-testid="leave-confirm">
            {ROOM_LABELS.leaveConfirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
