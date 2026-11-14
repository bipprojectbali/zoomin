/** Tombol "Undang" + dialog link undangan per peran, tanpa keluar dari room (UX-13). Hanya untuk host room. */
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { InviteLinks } from "@/lobby/InviteLinks";
import { ControlTooltip } from "./ControlTooltip";
import { ROOM_LABELS } from "./room.labels";

export function InviteDialog({ roomId, open, onOpenChange, showTrigger = true }: {
  roomId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** false: dialog dibuka dari menu "Lainnya" (mobile), tanpa tombol sendiri. */
  showTrigger?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {showTrigger && (
        <ControlTooltip label={ROOM_LABELS.invite}>
          <DialogTrigger asChild>
            <Button type="button" variant="secondary" size="icon-lg" className="rounded-full" aria-label={ROOM_LABELS.invite} data-testid="open-invite">
              <UserPlus />
            </Button>
          </DialogTrigger>
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
