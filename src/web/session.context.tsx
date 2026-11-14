import { Loader2, RotateCw, ShieldX } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, Navigate, useLocation } from "react-router";
import { AppBrand } from "@/app.brand";
import { Button } from "@/components/ui/button";
import type { GlobalRole, SessionUser } from "../shared/api.types";
import { ApiRequestError, getMe } from "./api.client";
import { signOut as authSignOut } from "./auth.client";
import { errorMessage } from "./error.message";
import { loginPath } from "./login.redirect";
import { hasRole } from "./role.global.label";

const HTTP_UNAUTHORIZED = 401;

const TEXT = {
  loading: "Memuat sesi…",
  errorTitle: "Gagal memuat sesi",
  retry: "Coba lagi",
  forbiddenTitle: "Tidak punya akses",
  forbiddenBody: "Halaman ini hanya untuk peran tertentu. Minta admin memberi akses bila Anda membutuhkannya.",
  backToApp: "Kembali ke Room",
  outsideProvider: "useSession dipakai di luar <SessionProvider>",
};

/** Nilai konteks sesi: user null = belum login (401). `loading` true sampai GET /api/me pertama selesai. */
export type SessionValue = {
  user: SessionUser | null;
  loading: boolean;
  /** Pesan error non-401 (mis. server mati, 403 banned); null bila normal. */
  error: string | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

export { hasRole };

/** Provider sesi global (sekali di main.tsx): GET /api/me saat mount, lalu hanya lewat refresh(). */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getMe();
      setUser(res.user);
      setError(null);
    } catch (err) {
      setUser(null);
      // 401 = belum login, kondisi normal; selain itu (termasuk 403 banned) tampilkan.
      if (err instanceof ApiRequestError && err.status === HTTP_UNAUTHORIZED) setError(null);
      else {
        console.error("session: GET /api/me gagal", err);
        setError(errorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Error dilempar ke pemanggil supaya bisa ditampilkan di UI-nya (toast).
  const signOut = useCallback(async () => {
    await authSignOut();
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, error, refresh, signOut }), [user, loading, error, refresh, signOut]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** Akses sesi; wajib di dalam SessionProvider. */
export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error(TEXT.outsideProvider);
  return ctx;
}

/** Spinner layar penuh selama sesi dicek. */
export function SessionLoading() {
  return (
    <div className="flex min-h-svh items-center justify-center gap-2 text-muted-foreground" role="status">
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      {TEXT.loading}
    </div>
  );
}

/** Render children hanya bila login; belum login → `/login?next=<path saat ini>`. */
export function RequireSession({ children }: { children: ReactNode }) {
  const { user, loading, error, refresh } = useSession();
  const location = useLocation();

  if (user) return <>{children}</>;
  if (loading) return <SessionLoading />;
  if (error) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-3 p-6 text-center" role="alert">
        <p className="font-semibold">{TEXT.errorTitle}</p>
        <p className="max-w-sm text-sm text-muted-foreground">{error}</p>
        <Button type="button" variant="outline" onClick={() => void refresh()}>
          <RotateCw />
          {TEXT.retry}
        </Button>
      </div>
    );
  }
  return <Navigate to={loginPath(location.pathname + location.search)} replace />;
}

/** Seperti RequireSession, plus peran global minimal `min`; kurang → halaman "Tidak punya akses". */
export function RequireRole({ min, children }: { min: GlobalRole; children: ReactNode }) {
  return (
    <RequireSession>
      <RoleGate min={min}>{children}</RoleGate>
    </RequireSession>
  );
}

function RoleGate({ min, children }: { min: GlobalRole; children: ReactNode }) {
  const { user } = useSession();
  if (hasRole(user, min)) return <>{children}</>;
  return <ForbiddenPage />;
}

/** Halaman 403 rapi dengan jalan pulang ke /app. */
export function ForbiddenPage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-8 p-6 text-center" data-testid="forbidden">
      <AppBrand />
      <div className="flex max-w-md flex-col items-center gap-3">
        <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <ShieldX className="size-7" aria-hidden="true" />
        </span>
        <h1 className="text-2xl font-semibold">{TEXT.forbiddenTitle}</h1>
        <p className="text-muted-foreground">{TEXT.forbiddenBody}</p>
      </div>
      <Button asChild>
        <Link to="/app">{TEXT.backToApp}</Link>
      </Button>
    </main>
  );
}
