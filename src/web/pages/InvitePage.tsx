import { useState, type SubmitEvent } from "react";
import { useNavigate, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { acceptInvite } from "@/api.client";
import { errorMessage } from "@/error.message";

const TEXT = {
  title: "Terima undangan",
  name: "Nama tampilan",
  submit: "Gabung",
  submitting: "Memproses…",
};

/** Batas panjang nama di input; validasi final tetap di server. */
const NAME_MAX_LENGTH = 64;

/** Halaman /invite/:invite: isi nama → terima undangan → masuk room. */
export function InvitePage() {
  const { invite = "" } = useParams();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { roomId } = await acceptInvite({ invite, name: name.trim() });
      navigate(`/rooms/${encodeURIComponent(roomId)}`, { replace: true });
    } catch (err) {
      console.error("invite: accept gagal", err);
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            <h1 className="text-xl">{TEXT.title}</h1>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={onSubmit}>
            <div className="flex flex-col gap-2">
              <Label htmlFor="invite-name">{TEXT.name}</Label>
              <Input
                id="invite-name"
                autoComplete="name"
                autoFocus
                required
                maxLength={NAME_MAX_LENGTH}
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "invite-error" : undefined}
              />
            </div>
            {error && (
              <p id="invite-error" className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? TEXT.submitting : TEXT.submit}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
