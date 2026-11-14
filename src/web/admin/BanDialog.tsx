import { Ban, Loader2 } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { AdminUser, BanUserBody } from "../../shared/api.types";
import { ADMIN_TEXT as TEXT } from "./admin.labels";
import { BAN_DURATIONS, BAN_REASON_MAX, banExpiresInHours, banReasonError, type BanDurationId } from "./admin.format";

const DEFAULT_DURATION: BanDurationId = "1d";

type Props = {
  user: AdminUser;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Body siap kirim; dialog menutup sendiri setelah resolve, tetap terbuka bila reject. */
  onSubmit: (body: BanUserBody) => Promise<void>;
};

/** Dialog blokir: alasan wajib 3–200 + pilihan durasi. */
export function BanDialog({ user, open, onOpenChange, onSubmit }: Props) {
  const [reason, setReason] = useState("");
  const [duration, setDuration] = useState<BanDurationId>(DEFAULT_DURATION);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const id = useId();
  const error = banReasonError(reason);
  const showError = touched && error !== null;

  function change(next: boolean) {
    if (busy) return;
    if (!next) {
      setReason("");
      setDuration(DEFAULT_DURATION);
      setTouched(false);
    }
    onOpenChange(next);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (error) return;
    setBusy(true);
    const hours = banExpiresInHours(duration);
    const ok = await onSubmit(hours === undefined ? { reason: reason.trim() } : { reason: reason.trim(), expiresInHours: hours }).then(
      () => true,
      () => false, // error sudah ditampilkan pemanggil (toast); dialog tetap terbuka untuk dicoba lagi
    );
    setBusy(false);
    if (ok) {
      setReason("");
      setDuration(DEFAULT_DURATION);
      setTouched(false);
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent data-testid="ban-dialog" className="sm:max-w-md">
        <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
          <DialogHeader>
            <DialogTitle>{TEXT.banTitle(user.name)}</DialogTitle>
            <DialogDescription>{TEXT.banDescription}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-reason`}>{TEXT.banReason}</Label>
            <Textarea
              id={`${id}-reason`}
              data-testid="ban-reason"
              value={reason}
              placeholder={TEXT.banReasonPlaceholder}
              aria-invalid={showError}
              aria-describedby={`${id}-hint`}
              onChange={(e) => setReason(e.target.value)}
              onBlur={() => setTouched(true)}
              autoFocus
            />
            <p id={`${id}-hint`} className={cn("flex justify-between gap-3 text-xs text-muted-foreground", showError && "text-destructive")}>
              <span>{showError ? error : " "}</span>
              <span className="tabular-nums">{TEXT.banReasonHint(reason.trim().length, BAN_REASON_MAX)}</span>
            </p>
          </div>
          <fieldset className="flex flex-col">
            <legend className="mb-2 text-sm font-medium">{TEXT.banDuration}</legend>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {BAN_DURATIONS.map((d) => (
                <label
                  key={d.id}
                  className={cn(
                    "flex h-9 cursor-pointer items-center justify-center rounded-md border text-sm transition-colors hover:bg-accent has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
                    duration === d.id && "border-foreground/60 bg-accent font-medium",
                  )}
                >
                  <input
                    type="radio"
                    name={`${id}-duration`}
                    value={d.id}
                    checked={duration === d.id}
                    onChange={() => setDuration(d.id)}
                    className="sr-only"
                  />
                  {d.label}
                </label>
              ))}
            </div>
          </fieldset>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => change(false)}>
              {TEXT.cancel}
            </Button>
            <Button type="submit" variant="destructive" disabled={busy} data-testid="ban-submit">
              {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Ban aria-hidden="true" />}
              {TEXT.banSubmit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
