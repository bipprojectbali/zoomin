import { useCallback, useEffect, useState } from "react";
import { listRooms } from "@/api.client";
import { AppShell } from "@/app/AppShell";
import { errorMessage } from "@/error.message";
import { CreateRoomForm } from "@/lobby/CreateRoomForm";
import { JoinByIdForm } from "@/lobby/JoinByIdForm";
import { RoomList } from "@/lobby/RoomList";
import { hasRole, RequireSession, useSession } from "@/session.context";
import type { RoomSummary } from "../../shared/api.types";

const TEXT = {
  title: "Room",
  subtitleAdmin: "Buat room, bagikan link undangan, lalu masuk ke meeting.",
  subtitleUser: "Pilih room untuk masuk ke meeting.",
};

/** Halaman lobby /app (terlindung sesi), di dalam AppShell. */
export function LobbyPage() {
  return (
    <RequireSession>
      <Lobby />
    </RequireSession>
  );
}

function Lobby() {
  const { user } = useSession();
  const canCreate = hasRole(user, "admin");
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

  function onCreated(room: RoomSummary) {
    setRooms((prev) => [room, ...prev.filter((r) => r.id !== room.id)]);
  }

  const onChanged = (room: RoomSummary) => setRooms((prev) => prev.map((r) => (r.id === room.id ? room : r)));
  const onDeleted = (roomId: string) => setRooms((prev) => prev.filter((r) => r.id !== roomId));

  return (
    <AppShell title={TEXT.title}>
      <p className="-mt-4 text-sm text-muted-foreground">{canCreate ? TEXT.subtitleAdmin : TEXT.subtitleUser}</p>

      {canCreate && <CreateRoomForm onCreated={onCreated} />}

      <JoinByIdForm />

      {error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <RoomList canCreate={canCreate} rooms={rooms} loading={loading} hasMore={cursor !== null} onLoadMore={() => void load(cursor ?? undefined)}
        onChanged={onChanged}
        onDeleted={onDeleted}
      />
    </AppShell>
  );
}
