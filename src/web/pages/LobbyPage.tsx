import { LogIn, LogOut } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listRooms } from "@/api.client";
import { errorMessage } from "@/error.message";
import { CreateRoomForm } from "@/lobby/CreateRoomForm";
import { InviteLinks } from "@/lobby/InviteLinks";
import { ROLE_LABEL } from "@/role.label";
import { ProtectedPage, useSession } from "@/session.context";
import type { RoomSummary } from "../../shared/api.types";

const TEXT = {
  title: "Daftar room",
  greeting: (name: string) => `Masuk sebagai ${name}`,
  logout: "Keluar",
  enter: "Masuk room",
  loadMore: "Muat lagi",
  loading: "Memuat…",
  empty: "Belum ada room.",
  globalAdmin: "Admin global",
  logoutFailed: "Gagal keluar",
};

/** Halaman lobby (terlindung sesi). */
export function LobbyPage() {
  return (
    <ProtectedPage>
      <Lobby />
    </ProtectedPage>
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
      navigate("/login", { replace: true });
    } catch (err) {
      console.error("lobby: logout gagal", err);
      setError(`${TEXT.logoutFailed}: ${errorMessage(err)}`);
    }
  }

  function onCreated(room: RoomSummary) {
    setRooms((prev) => [room, ...prev.filter((r) => r.id !== room.id)]);
  }

  if (!user) return null; // RequireSession menjamin user ada.

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{TEXT.title}</h1>
          <p className="text-sm text-muted-foreground">
            {TEXT.greeting(user.name)} {user.isAdmin && <Badge variant="secondary">{TEXT.globalAdmin}</Badge>}
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void onLogout()}>
          <LogOut />
          {TEXT.logout}
        </Button>
      </header>

      {user.isAdmin && <CreateRoomForm onCreated={onCreated} />}

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <ul className="flex flex-col gap-3" aria-busy={loading}>
        {rooms.map((room) => (
          <li key={room.id} className="flex flex-col gap-3 rounded-xl border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <h2 className="truncate font-medium">{room.title}</h2>
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="truncate">{room.id}</span>
                  {room.role && <Badge variant="outline">{ROLE_LABEL[room.role]}</Badge>}
                </p>
              </div>
              <Button asChild size="sm">
                <Link to={`/rooms/${encodeURIComponent(room.id)}`}>
                  <LogIn />
                  {TEXT.enter}
                </Link>
              </Button>
            </div>
            {(user.isAdmin || room.role === "admin") && <InviteLinks roomId={room.id} />}
          </li>
        ))}
      </ul>

      {!loading && rooms.length === 0 && !error && <p className="text-muted-foreground">{TEXT.empty}</p>}
      {loading && (
        <p className="text-sm text-muted-foreground" role="status">
          {TEXT.loading}
        </p>
      )}
      {cursor && !loading && (
        <Button type="button" variant="secondary" className="self-center" onClick={() => void load(cursor)}>
          {TEXT.loadMore}
        </Button>
      )}
    </main>
  );
}
