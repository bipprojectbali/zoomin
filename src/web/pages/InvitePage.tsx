import { LinkIcon, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { acceptInvite, ApiRequestError, logout, previewInvite } from "@/api.client";
import { errorMessage } from "@/error.message";
import { saveMediaPreferences, stashFirstJoinChoices } from "@/prejoin/media.preferences";
import { PreJoin } from "@/prejoin/PreJoin";
import { inviteSubtitle, roleKeptNote } from "@/prejoin/prejoin.labels";
import type { PreJoinChoices } from "@/prejoin/prejoin.types";
import { canPublishFor } from "@/room/room.connection";
import type { InvitePreview } from "../../shared/api.types";

const TEXT = {
  loading: "Memeriksa undangan…",
  invalidTitle: "Undangan tidak dapat dipakai",
  invalidHelp: "Link mungkin salah salin, sudah kedaluwarsa, atau room-nya sudah dihapus. Minta link undangan baru ke admin room.",
  loadFailedTitle: "Gagal memuat undangan",
  retry: "Coba lagi",
  home: "Ke halaman utama",
  notYou: "Bukan Anda?",
  logout: "Keluar",
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
  const [state, setState] = useState<State>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function onJoin(choices: PreJoinChoices, name?: string) {
    setBusy(true);
    setError(null);
    try {
      const { roomId } = await acceptInvite(name === undefined ? { invite } : { invite, name });
      saveMediaPreferences(choices);
      stashFirstJoinChoices(roomId, choices);
      navigate(`/rooms/${encodeURIComponent(roomId)}`, { replace: true });
    } catch (err) {
      console.error("invite: accept gagal", err);
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  async function onLogout() {
    try {
      await logout();
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
                <Link to="/">{TEXT.home}</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    );
  }

  const { preview } = state;
  const note = preview.currentUser ? roleKeptNote(preview) : null;
  return (
    <PreJoin
      title={preview.roomTitle}
      subtitle={inviteSubtitle(preview)}
      canPublish={canPublishFor(preview.effectiveRole)}
      askName={!preview.currentUser}
      busy={busy}
      error={error}
      onJoin={(choices, name) => void onJoin(choices, name)}
      footer={
        preview.currentUser && (
          <div className="flex flex-col gap-1 text-sm text-muted-foreground">
            {note && <p>{note}</p>}
            <p>
              {TEXT.notYou}{" "}
              <Button type="button" variant="link" className="h-auto p-0" disabled={busy} onClick={() => void onLogout()}>
                {TEXT.logout}
              </Button>
            </p>
          </div>
        )
      }
    />
  );
}
