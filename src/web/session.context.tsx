import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Navigate } from "react-router";
import type { SessionUser } from "../shared/api.types";
import { ApiRequestError, getMe, logout as apiLogout } from "./api.client";
import { errorMessage } from "./error.message";

const HTTP_UNAUTHORIZED = 401;

const TEXT = {
  loading: "Memuat sesi…",
  errorTitle: "Gagal memuat sesi",
  outsideProvider: "useSession dipakai di luar <SessionProvider>",
};

/** Nilai konteks sesi: user null = belum login (401). */
export type SessionValue = {
  user: SessionUser | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

/** Provider sesi: memanggil GET /api/me saat mount. */
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

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(() => ({ user, loading, error, refresh, logout }), [user, loading, error, refresh, logout]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** Akses sesi; wajib di dalam SessionProvider. */
export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error(TEXT.outsideProvider);
  return ctx;
}

/** Render children hanya bila login; 401 → redirect ke /login. */
export function RequireSession({ children }: { children: ReactNode }) {
  const { user, loading, error } = useSession();
  if (loading && !user) {
    return (
      <p className="p-6 text-muted-foreground" role="status">
        {TEXT.loading}
      </p>
    );
  }
  if (error) {
    return (
      <div className="p-6" role="alert">
        <p className="font-semibold">{TEXT.errorTitle}</p>
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/** Halaman terlindung: provider + guard sekaligus (main.tsx tidak membungkus provider global). */
export function ProtectedPage({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <RequireSession>{children}</RequireSession>
    </SessionProvider>
  );
}
