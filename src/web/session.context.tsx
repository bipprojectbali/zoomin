import { Loader2, RotateCw } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { Button } from "@/components/ui/button";
import type { SessionUser } from "../shared/api.types";
import { ApiRequestError, getMe, logout as apiLogout } from "./api.client";
import { errorMessage } from "./error.message";

const HTTP_UNAUTHORIZED = 401;

const TEXT = {
  loading: "Memuat sesi…",
  errorTitle: "Gagal memuat sesi",
  retry: "Coba lagi",
  outsideProvider: "useSession dipakai di luar <SessionProvider>",
};

/** Nilai konteks sesi: user null = belum login (401) atau belum dicek. */
export type SessionValue = {
  user: SessionUser | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

/** `location.state` yang dikirim RequireSession ke /login. */
export type LoginRedirectState = { from: string; reason: "session" | "logout" };

const SessionContext = createContext<SessionValue | null>(null);

/**
 * Provider sesi global (dipasang sekali di main.tsx). Tidak fetch saat mount: RequireSession yang memanggil
 * GET /api/me bila user belum diketahui, jadi berpindah halaman saat sudah login tidak memicu fetch ulang.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getMe();
      setUser(res.user);
      setError(null);
    } catch (err) {
      setUser(null);
      // 401 = belum login, kondisi normal; selain itu tampilkan.
      if (err instanceof ApiRequestError && err.status === HTTP_UNAUTHORIZED) {
        setError(null);
      } else {
        console.error("session: GET /api/me gagal", err);
        setError(errorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Error logout dilempar ke pemanggil supaya bisa ditampilkan di UI-nya.
  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, error, refresh, logout }), [user, loading, error, refresh, logout]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** Akses sesi; wajib di dalam SessionProvider. */
export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error(TEXT.outsideProvider);
  return ctx;
}

/**
 * Render children hanya bila login. User belum diketahui (load pertama, habis login/terima undangan) → cek /api/me
 * sekali; 401 → /login dengan alasan, supaya tamu tahu harus lewat link undangan.
 */
export function RequireSession({ children }: { children: ReactNode }) {
  const { user, error, refresh } = useSession();
  const location = useLocation();
  const [checked, setChecked] = useState(user !== null);

  useEffect(() => {
    if (checked) return;
    let alive = true;
    void refresh().then(() => {
      if (alive) setChecked(true);
    });
    return () => {
      alive = false;
    };
  }, [checked, refresh]);

  if (user) return <>{children}</>;
  if (!checked) {
    return (
      <div className="flex min-h-svh items-center justify-center gap-2 text-muted-foreground" role="status">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        {TEXT.loading}
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-3 p-6 text-center" role="alert">
        <p className="font-semibold">{TEXT.errorTitle}</p>
        <p className="max-w-sm text-sm text-muted-foreground">{error}</p>
        <Button type="button" variant="outline" onClick={() => setChecked(false)}>
          <RotateCw />
          {TEXT.retry}
        </Button>
      </div>
    );
  }
  const state: LoginRedirectState = { from: location.pathname + location.search, reason: "session" };
  return <Navigate to="/login" replace state={state} />;
}

/** Halaman terlindung (provider sudah global di main.tsx); alias RequireSession agar halaman lama tetap jalan. */
export function ProtectedPage({ children }: { children: ReactNode }) {
  return <RequireSession>{children}</RequireSession>;
}
