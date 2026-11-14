import { Loader2, Trash2 } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ADMIN_TEXT as TEXT } from "./admin.labels";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  submitLabel: string;
  /** Bila diisi, tombol hapus baru aktif setelah teks ini diketik persis (tanpa beda huruf besar/kecil). */
  confirmText?: string;
  /** Aksi alternatif di kiri footer (mis. "Blokir saja"). */
  secondary?: ReactNode;
  /** Dialog menutup setelah resolve, tetap terbuka bila reject (error ditampilkan pemanggil). */
  onConfirm: () => Promise<void>;
};

/** AlertDialog destruktif untuk hapus akun / hapus room. */
export function ConfirmDeleteDialog({ open, onOpenChange, title, description, submitLabel, confirmText, secondary, onConfirm }: Props) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const id = useId();
  const ready = !confirmText || typed.trim().toLowerCase() === confirmText.toLowerCase();

  function change(next: boolean) {
    if (busy) return;
    if (!next) setTyped("");
    onOpenChange(next);
  }

  async function confirm() {
    if (!ready || busy) return;
    setBusy(true);
    const ok = await onConfirm().then(
      () => true,
      () => false,
    );
    setBusy(false);
    if (ok) {
      setTyped("");
      onOpenChange(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={change}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {confirmText && (
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-confirm`} className="block font-normal leading-relaxed">
              {TEXT.deleteConfirmLabel(confirmText)}
            </Label>
            <Input
              id={`${id}-confirm`}
              data-testid="delete-confirm-input"
              value={typed}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void confirm()}
            />
          </div>
        )}
        <AlertDialogFooter className="sm:justify-between">
          <div>{secondary}</div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <AlertDialogCancel disabled={busy}>{TEXT.cancel}</AlertDialogCancel>
            {/* Button biasa (bukan AlertDialogAction) agar dialog tetap terbuka sampai request selesai. */}
            <Button type="button" variant="destructive" disabled={!ready || busy} onClick={() => void confirm()} data-testid="delete-confirm">
              {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
              {submitLabel}
            </Button>
          </div>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
