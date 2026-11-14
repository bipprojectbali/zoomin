import { AlertCircle, Loader2 } from "lucide-react";
import { useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router";
import { AppBrand } from "@/app.brand";
import { startGoogleLogin } from "@/app/google.login";
import { Button } from "@/components/ui/button";
import { authErrorMessage, errorMessage } from "@/error.message";
import { GoogleMark } from "@/landing/GoogleMark";
import { DEFAULT_AFTER_LOGIN, safeNextPath } from "@/login.redirect";
import { SessionLoading, useSession } from "@/session.context";

const TEXT = {
  title: "Sign in to zoomin",
  description: "Use your Google account to open rooms and join by invite.",
  google: "Continue with Google",
  redirecting: "Redirecting to Google…",
  nextHint: "Sign in to continue to the page you opened.",
  policy:
    "By signing in, you agree that your Google name, email, and profile photo are used as your identity in rooms. We don't request any other access to your Google account.",
  backHome: "Back to home",
};

/** /login: satu tombol Google (ala Google/Linear). `?next=` hanya path internal; `?error=` → pesan Indonesia. */
export function LoginPage() {
  const { user, loading } = useSession();
  const [params] = useSearchParams();
  const next = safeNextPath(params.get("next"));
  const queryError = params.get("error");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(queryError ? authErrorMessage(queryError) : null);

  async function onGoogle() {
    setBusy(true);
    setError(null);
    try {
      await startGoogleLogin(next);
      // Sukses = browser sedang pindah ke Google; biarkan busy.
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  if (loading && !user) return <SessionLoading />;
  if (user) return <Navigate to={next} replace />;

  return (
    <main className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden bg-muted/40 p-4">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(60%_100%_at_50%_0%,color-mix(in_oklch,var(--brand)_14%,transparent),transparent)]"
      />
      <div className="relative flex w-full max-w-sm flex-col items-center gap-6">
        <Link to="/" aria-label={TEXT.backHome} className="rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
          <AppBrand />
        </Link>
        <section
          aria-labelledby="login-title"
          className="w-full rounded-2xl border bg-card p-6 text-card-foreground shadow-sm sm:p-8"
          data-testid="login-card"
        >
          <h1 id="login-title" className="text-xl font-semibold tracking-tight">
            {TEXT.title}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{TEXT.description}</p>
          {next !== DEFAULT_AFTER_LOGIN && !error && (
            <p className="mt-4 rounded-lg border bg-muted/60 px-3 py-2 text-sm" role="status">
              {TEXT.nextHint}
            </p>
          )}
          {error && (
            <p
              id="login-error"
              className="mt-4 flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              role="alert"
              data-testid="login-error"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="mt-6 h-11 w-full gap-3 text-[15px]"
            disabled={busy}
            aria-describedby={error ? "login-error" : undefined}
            onClick={() => void onGoogle()}
            data-testid="login-google"
          >
            {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <GoogleMark />}
            {busy ? TEXT.redirecting : TEXT.google}
          </Button>
        </section>
        <p className="px-2 text-center text-xs leading-relaxed text-muted-foreground">{TEXT.policy}</p>
      </div>
    </main>
  );
}
