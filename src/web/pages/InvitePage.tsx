import { Clock, LinkIcon, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { AppBrand } from "@/app.brand";
import { startGoogleLogin } from "@/app/google.login";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { acceptInvite, ApiRequestError, previewInvite } from "@/api.client";
import { errorMessage } from "@/error.message";
import { saveMediaPreferences, stashFirstJoinChoices } from "@/prejoin/media.preferences";
import { PreJoin } from "@/prejoin/PreJoin";
import { PasswordGate } from "@/room-password/PasswordGate";
import { inviteSubtitle, roleKeptNote } from "@/prejoin/prejoin.labels";
import type { PreJoinChoices } from "@/prejoin/prejoin.types";
import { GoogleMark } from "@/landing/GoogleMark";
import { ROLE_LABEL } from "@/role.label";
import { canPublishFor } from "@/room/room.connection";
import { useSession } from "@/session.context";
import type { InvitePreview } from "../../shared/api.types";

const TEXT = {
  loading: "Memeriksa undangan…",
  invalidTitle: "Undangan tidak dapat dipakai",
  invalidHelp: "Link mungkin salah salin, sudah kedaluwarsa, atau room-nya sudah dihapus. Minta link undangan baru ke admin room.",
  loadFailedTitle: "Gagal memuat undangan",
  retry: "Coba lagi",
  home: "Ke lobby",
  notYou: "Bukan Anda?",
  logout: "Ganti akun",
  invitedTo: "Anda diundang ke room",
  asRole: "Peran",
  expires: (at: number) => `Berlaku sampai ${new Date(at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}`,
  signInHelp: "Masuk dengan akun Google Anda untuk bergabung. Setelah masuk, Anda kembali ke halaman ini.",
  signIn: "Masuk dengan Google untuk bergabung",
  redirecting: "Mengalihkan ke Google…",
  signedInAs: (name: string, email: string) => `Masuk sebagai ${name} (${email})`,
};

/** Kode error yang berarti undangan memang tidak bisa dipakai (bukan gangguan sementara). */
const INVALID_CODES = new Set(["invite_invalid", "room_not_found", "not_found", "invalid_input"]);

type State =
  | { kind: "loading" }
  | { kind: "ready"; preview: InvitePreview }
  | { kind: "failed"; invalid: boolean; message: string };

/** Halaman /invite/:invite: preview undangan → pre-join → terima → masuk room. */
export function InvitePage() {
  const { invite = "" } = useParams();
  const navigate = useNavigate();
  const { signOut } = useSession();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Room password (W6): password yang sudah diterima server di gate; dikirim lagi saat accept final.
  const [password, setPassword] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const preview = await previewInvite(invite);
      if (preview.expiresAt <= Date.now()) {
        setState({ kind: "failed", invalid: true, message: TEXT.invalidHelp });
      } else setState({ kind: "ready", preview });
    } catch (err) {
      console.error("invite: preview gagal", err);
      const invalid = err instanceof ApiRequestError && INVALID_CODES.has(err.code ?? "");
      setState({ kind: "failed", invalid, message: errorMessage(err) });
    }
  }, [invite]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onJoin(choices: PreJoinChoices) {
    setBusy(true);
    setError(null);
    try {
      const { roomId } = await acceptInvite({ invite, ...(password !== null ? { password } : {}) });
      saveMediaPreferences(choices);
      stashFirstJoinChoices(roomId, choices);
      navigate(`/rooms/${encodeURIComponent(roomId)}`, { replace: true });
    } catch (err) {
      console.error("invite: accept gagal", err);
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  async function onSignIn() {
    setBusy(true);
    setError(null);
    try {
      await startGoogleLogin(`/invite/${encodeURIComponent(invite)}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  async function onLogout() {
    try {
      await signOut();
      await load();
    } catch (err) {
      console.error("invite: logout gagal", err);
      setError(errorMessage(err));
    }
  }

  if (state.kind === "loading") {
    return (
      <main className="flex min-h-svh items-center justify-center gap-2 p-4 text-muted-foreground" role="status">
        <Loader2 aria-hidden className="size-4 animate-spin" />
        {TEXT.loading}
      </main>
    );
  }

  if (state.kind === "failed") {
    return (
      <main className="flex min-h-svh items-center justify-center p-4">
        <Card className="w-full max-w-md" data-testid="invite-error" role="alert">
          <CardHeader>
            <LinkIcon aria-hidden className="mb-2 size-8 text-muted-foreground" />
            <CardTitle>
              <h1 className="text-xl">{state.invalid ? TEXT.invalidTitle : TEXT.loadFailedTitle}</h1>
            </CardTitle>
            <CardDescription>{state.message}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {state.invalid && state.message !== TEXT.invalidHelp && (
              <p className="text-sm text-muted-foreground">{TEXT.invalidHelp}</p>
            )}
            <div className="flex flex-wrap gap-2">
              {!state.invalid && (
                <Button type="button" onClick={() => void load()}>
                  {TEXT.retry}
                </Button>
              )}
              <Button asChild variant="outline">
                <Link to="/app">{TEXT.home}</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    );
  }

  const { preview } = state;
  const me = preview.currentUser;
  if (!me) {
    return (
      <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted/40 p-4">
        <AppBrand />
        <section className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-sm sm:p-8" data-testid="invite-signin">
          <p className="text-sm text-muted-foreground">{TEXT.invitedTo}</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight break-words">{preview.roomTitle}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">{TEXT.asRole}</span>
            <Badge variant="secondary" data-testid="invite-role">
              {ROLE_LABEL[preview.effectiveRole]}
            </Badge>
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="size-3.5" aria-hidden="true" />
            {TEXT.expires(preview.expiresAt)}
          </p>
          <p className="mt-5 text-sm text-muted-foreground">{TEXT.signInHelp}</p>
          {error && (
            <p className="mt-3 text-sm text-destructive" role="alert" data-testid="invite-signin-error">
              {error}
            </p>
          )}
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="mt-4 h-11 w-full gap-3"
            disabled={busy}
            onClick={() => void onSignIn()}
            data-testid="invite-google"
          >
            {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <GoogleMark />}
            {busy ? TEXT.redirecting : TEXT.signIn}
          </Button>
        </section>
      </main>
    );
  }

  if (preview.passwordRequired && password === null) {
    return (
      <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted/40 p-4">
        <AppBrand />
        <PasswordGate
          roomTitle={preview.roomTitle}
          onLobby={() => navigate("/app")}
          // Accept dengan password = validasi + jadi anggota (W3); error (password_invalid/rate_limited) tampil di gate.
          onSubmit={async (pw) => {
            await acceptInvite({ invite, password: pw });
            setPassword(pw);
          }}
        />
      </main>
    );
  }

  const note = roleKeptNote(preview);
  return (
    <PreJoin
      title={preview.roomTitle}
      subtitle={inviteSubtitle(preview)}
      canPublish={canPublishFor(preview.effectiveRole)}
      backTo="/app"
      busy={busy}
      error={error}
      onJoin={(choices) => void onJoin(choices)}
      footer={
        <div className="flex flex-col gap-1 text-sm text-muted-foreground">
          {note && <p>{note}</p>}
          <p data-testid="invite-signed-in-as">{TEXT.signedInAs(me.name, me.email)}</p>
          <p>
            {TEXT.notYou}{" "}
            <Button type="button" variant="link" className="h-auto p-0" disabled={busy} onClick={() => void onLogout()}>
              {TEXT.logout}
            </Button>
          </p>
        </div>
      }
    />
  );
}
