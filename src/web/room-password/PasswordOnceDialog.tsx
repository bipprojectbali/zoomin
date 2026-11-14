import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { copyPassword } from "./PasswordField";
import { ROOM_PASSWORD_TEXT as TEXT } from "./room-password.labels";

/** Tampilkan password baru sekali (W2: server hanya menyimpan hash, jadi tidak bisa dilihat lagi). null = tertutup. */
export function PasswordOnceDialog({ password, onClose }: { password: string | null; onClose: () => void }) {
  return (
    <Dialog open={password !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent data-testid="password-once-dialog">
        <DialogHeader>
          <DialogTitle>{TEXT.onceTitle}</DialogTitle>
          <DialogDescription>{TEXT.onceBody}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <code data-testid="password-once-value" className="flex-1 rounded-md bg-muted px-3 py-2 font-mono text-base break-all select-all">
            {password}
          </code>
          <Button type="button" variant="outline" data-testid="password-once-copy" onClick={() => password && void copyPassword(password)}>
            <Copy aria-hidden="true" />
            {TEXT.copy}
          </Button>
        </div>
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            {TEXT.onceClose}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
