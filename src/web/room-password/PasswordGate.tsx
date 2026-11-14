import { ArrowLeft, Loader2, LockKeyhole } from "lucide-react";
import { useEffect, useState, type SubmitEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiRequestError } from "@/api.client";
import { errorMessage } from "@/error.message";
import { ROOM_PASSWORD_MAX } from "../../shared/api.types";
import { ROOM_PASSWORD_TEXT as TEXT } from "./room-password.labels";

const MS_PER_SECOND = 1000;

type Props = {
  roomTitle?: string;
  /** Kirim password ke server; lempar error (password_invalid / rate_limited / …) bila ditolak. */
  onSubmit: (password: string) => Promise<void>;
  onLobby: () => void;
};

/** Form "Room ini dilindungi password" (W8) untuk RoomPage & InvitePage; 429 → tombol dikunci sampai Retry-After. */
export function PasswordGate({ roomTitle, onSubmit, onLobby }: Props) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState(0);

  useEffect(() => {
    if (!lockedUntil) return;
    const timer = setTimeout(() => setLockedUntil(0), Math.max(0, lockedUntil - Date.now()));
    return () => clearTimeout(timer);
  }, [lockedUntil]);

  async function submit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit(password);
    } catch (err) {
      // Password salah / dibatasi = alur normal → warn tanpa isi password.
      console.warn("room-password: masuk dengan password ditolak", err instanceof ApiRequestError ? err.code : err);
      setError(errorMessage(err));
      if (err instanceof ApiRequestError && err.code === "rate_limited" && err.retryAfterSeconds !== null) {
        setLockedUntil(Date.now() + err.retryAfterSeconds * MS_PER_SECOND);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section data-testid="password-gate" className="m-auto flex w-full max-w-sm flex-col gap-4 rounded-2xl border bg-card p-6 shadow-sm">
      <LockKeyhole className="size-8 text-muted-foreground" aria-hidden="true" />
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">{TEXT.gateTitle}</h1>
        {roomTitle && <p className="text-sm font-medium break-words">{roomTitle}</p>}
        <p className="text-sm text-muted-foreground">{TEXT.gateBody}</p>
      </div>
      <form className="flex flex-col gap-3" onSubmit={(e) => void submit(e)}>
        <Label htmlFor="password-gate-input">{TEXT.label}</Label>
        <Input
          id="password-gate-input"
          data-testid="password-gate-input"
          type="password"
          autoComplete="off"
          autoFocus
          required
          maxLength={ROOM_PASSWORD_MAX}
          value={password}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "password-gate-error" : undefined}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && (
          <p id="password-gate-error" data-testid="password-gate-error" className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" data-testid="password-gate-submit" disabled={busy || !password || lockedUntil > 0}>
          {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
          {busy ? TEXT.gateSubmitting : TEXT.gateSubmit}
        </Button>
        <Button type="button" variant="ghost" onClick={onLobby}>
          <ArrowLeft aria-hidden="true" />
          {TEXT.gateBack}
        </Button>
      </form>
    </section>
  );
}
