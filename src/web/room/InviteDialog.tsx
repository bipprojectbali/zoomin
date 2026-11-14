/**
 * Tombol "Undang" tanpa keluar dari room (UX-13). Hanya untuk host room.
 * Room public: dialog link undangan per peran. Room private: link ditolak server (403 `room_private`),
 * jadi Undang membuka Pengaturan room di tab Anggota (RND/plan/06).
 */
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { InviteLinks } from "@/lobby/InviteLinks";
import { RoomSettingsDialog } from "@/room-settings/RoomSettingsDialog";
import type { RoomSummary } from "../../shared/api.types";
import { ControlTooltip } from "./ControlTooltip";
import { ROOM_LABELS } from "./room.labels";

export function InviteDialog({ roomId, summary, open, onOpenChange, onSummaryChanged, onRoomDeleted, showTrigger = true }: {
  roomId: string;
  /** Info room dari server; null (belum/gagal dimuat) = perlakukan sebagai public. */
  summary: RoomSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSummaryChanged: (room: RoomSummary) => void;
  onRoomDeleted: () => void;
  /** false: dialog dibuka dari menu "Lainnya" (mobile), tanpa tombol sendiri. */
  showTrigger?: boolean;
}) {
  const trigger = (onClick?: () => void) => (
    <Button type="button" variant="secondary" size="icon-lg" className="rounded-full" aria-label={ROOM_LABELS.invite} onClick={onClick} data-testid="open-invite">
      <UserPlus />
    </Button>
  );

  if (summary?.visibility === "private") {
    return (
      <>
        {showTrigger && (
          <ControlTooltip label={ROOM_LABELS.invite}>{trigger(() => onOpenChange(true))}</ControlTooltip>
        )}
        {open && (
          <RoomSettingsDialog
            room={summary}
            open
            initialTab="members"
            onOpenChange={onOpenChange}
            onChanged={onSummaryChanged}
            onDeleted={onRoomDeleted}
          />
        )}
      </>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {showTrigger && (
        <ControlTooltip label={ROOM_LABELS.invite}>
          <DialogTrigger asChild>{trigger()}</DialogTrigger>
        </ControlTooltip>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{ROOM_LABELS.inviteTitle}</DialogTitle>
          <DialogDescription>{ROOM_LABELS.inviteDescription}</DialogDescription>
        </DialogHeader>
        <InviteLinks roomId={roomId} />
      </DialogContent>
    </Dialog>
  );
}
