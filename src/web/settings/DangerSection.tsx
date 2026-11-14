import { Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { deleteMe } from "@/api.client";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/error.message";
import type { SessionUser } from "../../shared/api.types";
import { SETTINGS_TEXT } from "./settings.labels";

const TEXT = SETTINGS_TEXT.danger;

/** Hapus akun sendiri: konfirmasi dengan mengetik email; super_admin tidak bisa (tombol nonaktif + alasan). */
export function DangerSection({ user }: { user: SessionUser }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const locked = user.role === "super_admin";
  const matches = typed.trim().toLowerCase() === user.email.toLowerCase();

  function onOpenChange(next: boolean) {
    if (busy) return;
    setOpen(next);
    setTyped("");
  }

  async function onDelete() {
    setBusy(true);
    try {
      await deleteMe();
      toast.success(TEXT.deleted);
      // Reload penuh: sesi sudah dihapus server, state SPA (user di konteks) ikut bersih tanpa race redirect.
      window.location.assign("/");
    } catch (err) {
      console.error("settings: DELETE /api/me gagal", err);
      toast.error(TEXT.failed(errorMessage(err)));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-3">
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogTrigger asChild>
          <Button type="button" variant="destructive" disabled={locked} data-testid="delete-account" aria-describedby={locked ? "delete-locked" : undefined}>
            <Trash2 aria-hidden="true" />
            {TEXT.delete}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{TEXT.confirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>{TEXT.confirmBody(user.email)}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="delete-confirm">{TEXT.confirmLabel}</Label>
            <Input
              id="delete-confirm"
              data-testid="delete-confirm"
              value={typed}
              autoComplete="off"
              placeholder={user.email}
              onChange={(e) => setTyped(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{TEXT.cancel}</AlertDialogCancel>
            {/* Button biasa, bukan AlertDialogAction: dialog tetap terbuka selama request berjalan. */}
            <Button type="button" variant="destructive" disabled={!matches || busy} onClick={() => void onDelete()} data-testid="delete-confirm-submit">
              {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
              {busy ? TEXT.deleting : TEXT.confirm}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {locked && (
        <p id="delete-locked" className="text-sm text-muted-foreground">
          {TEXT.superAdminReason}
        </p>
      )}
    </div>
  );
}
