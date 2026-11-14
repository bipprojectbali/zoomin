import { Info, Loader2, LogIn } from "lucide-react";
import { useState, type SubmitEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { AppBrand } from "@/app.brand";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { adminLogin } from "@/api.client";
import { errorMessage } from "@/error.message";
import { useSession, type LoginRedirectState } from "@/session.context";

const TEXT = {
  title: "Masuk sebagai admin",
  description: "Khusus admin untuk membuat room dan link undangan.",
  password: "Password admin",
  submit: "Masuk",
  submitting: "Memproses…",
  guestHelp: "Peserta masuk lewat link undangan dari admin room, tanpa password.",
  sessionNeeded:
    "Halaman yang Anda buka butuh sesi aktif. Peserta atau penonton: buka lagi link undangan dari admin room. Admin: masuk di bawah.",
};

/** Halaman masuk admin: password → sesi cookie → halaman asal / lobby. */
export function LoginPage() {
  const navigate = useNavigate();
  const { user } = useSession();
  const state = useLocation().state as LoginRedirectState | null;
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const target = state?.from && state.from !== "/login" ? state.from : "/";

  async function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await adminLogin({ password });
      navigate(target, { replace: true });
    } catch (err) {
      console.error("login: admin-login gagal", err);
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  if (user && !busy) return <Navigate to="/" replace />;

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted/40 p-4">
      <AppBrand tagline />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            <h1 className="text-xl">{TEXT.title}</h1>
          </CardTitle>
          <CardDescription>{TEXT.description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {state?.reason === "session" && (
            <p className="flex gap-2 rounded-md border bg-muted p-3 text-sm" role="status">
              <Info className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
              {TEXT.sessionNeeded}
            </p>
          )}
          <form className="flex flex-col gap-4" onSubmit={onSubmit}>
            <div className="flex flex-col gap-2">
              <Label htmlFor="admin-password">{TEXT.password}</Label>
              <Input
                id="admin-password"
                type="password"
                autoComplete="current-password"
                autoFocus
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "login-error" : undefined}
              />
            </div>
            {error && (
              <p id="login-error" className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" disabled={busy || !password}>
              {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <LogIn aria-hidden="true" />}
              {busy ? TEXT.submitting : TEXT.submit}
            </Button>
          </form>
        </CardContent>
      </Card>
      <p className="max-w-sm text-center text-sm text-muted-foreground">{TEXT.guestHelp}</p>
    </main>
  );
}
