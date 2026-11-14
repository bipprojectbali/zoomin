import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { listRooms } from "@/api.client";
import { errorMessage } from "@/error.message";
import { CreateRoomForm } from "@/lobby/CreateRoomForm";
import { LobbyHeader } from "@/lobby/LobbyHeader";
import { RoomList } from "@/lobby/RoomList";
import { RequireSession, useSession, type LoginRedirectState } from "@/session.context";
import type { RoomSummary } from "../../shared/api.types";

const TEXT = {
  title: "Lobby",
  greeting: (name: string) => `Halo, ${name}`,
  subtitleAdmin: "Buat room, bagikan link undangan, lalu masuk ke meeting.",
  subtitleGuest: "Pilih room untuk masuk ke meeting.",
  loggedOut: "Anda sudah logout",
  logoutFailed: (msg: string) => `Gagal logout. ${msg}`,
};

/** Halaman lobby (terlindung sesi). */
export function LobbyPage() {
  return (
    <RequireSession>
      <Lobby />
    </RequireSession>
  );
}

function Lobby() {
  const { user, logout } = useSession();
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (from?: string) => {
    setLoading(true);
    setError(null);
    try {
      const page = await listRooms({ cursor: from });
      setRooms((prev) => (from ? [...prev, ...page.items] : page.items));
      setCursor(page.nextCursor);
    } catch (err) {
      console.error("lobby: daftar room gagal", err);
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onLogout() {
    try {
      await logout();
      toast.success(TEXT.loggedOut);
      const state: LoginRedirectState = { from: "/", reason: "logout" };
      navigate("/login", { replace: true, state });
    } catch (err) {
      console.error("lobby: logout gagal", err);
      toast.error(TEXT.logoutFailed(errorMessage(err)));
    }
  }

  function onCreated(room: RoomSummary) {
    setRooms((prev) => [room, ...prev.filter((r) => r.id !== room.id)]);
  }

  if (!user) return null; // RequireSession menjamin user ada.

  return (
    <div className="min-h-svh bg-muted/40">
      <LobbyHeader user={user} onLogout={() => void onLogout()} />
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{TEXT.greeting(user.name)}</h1>
          <p className="text-sm text-muted-foreground">{user.isAdmin ? TEXT.subtitleAdmin : TEXT.subtitleGuest}</p>
        </div>

        {user.isAdmin && <CreateRoomForm onCreated={onCreated} />}

        {error && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <RoomList user={user} rooms={rooms} loading={loading} hasMore={cursor !== null} onLoadMore={() => void load(cursor ?? undefined)} />
      </main>
    </div>
  );
}
