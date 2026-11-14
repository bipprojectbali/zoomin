import { RoomAudioRenderer, RoomContext, StartAudio } from "@livekit/components-react";
import type { Room } from "livekit-client";
import { ArrowLeft, RotateCw } from "lucide-react";
import { useNavigate, useParams } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MediaControls } from "@/room/MediaControls";
import { canPublishFor, useRoomConnection, type ConnectionStatus } from "@/room/room.connection";
import { ScreenControls } from "@/room/ScreenControls";
import { ROLE_LABEL } from "@/role.label";
import { ProtectedPage } from "@/session.context";
import { useLayoutSync } from "@/stage/layout.sync";
import { Stage } from "@/stage/Stage";
import type { Role } from "../../shared/api.types";

const TEXT = {
  leave: "Keluar",
  retry: "Coba lagi",
  startAudio: "Klik untuk mengaktifkan suara",
  reconnecting: "Menyambung ulang…",
  status: {
    connecting: "Menghubungkan…",
    connected: "Terhubung",
    disconnected: "Terputus",
    error: "Gagal",
  } satisfies Record<ConnectionStatus, string>,
};

const STATUS_VARIANT: Record<ConnectionStatus, "default" | "secondary" | "destructive" | "outline"> = {
  connecting: "secondary",
  connected: "default",
  disconnected: "outline",
  error: "destructive",
};

/** Halaman /rooms/:roomId (terlindung sesi). */
export function RoomPage() {
  const { roomId = "" } = useParams();
  return (
    <ProtectedPage>
      {/* key: ganti room = state koneksi baru sepenuhnya. */}
      <RoomView key={roomId} roomId={roomId} />
    </ProtectedPage>
  );
}

function RoomView({ roomId }: { roomId: string }) {
  const navigate = useNavigate();
  const { room, role, status, error, retry } = useRoomConnection(roomId);
  // Room yang pernah terhubung lalu status "connecting" = sedang reconnect.
  const statusLabel = room && status === "connecting" ? TEXT.reconnecting : TEXT.status[status];

  return (
    <div className="flex h-svh flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b px-3 py-2 sm:px-4">
        <Button type="button" variant="ghost" size="sm" onClick={() => navigate("/")}>
          <ArrowLeft />
          {TEXT.leave}
        </Button>
        <h1 className="min-w-0 flex-1 truncate font-semibold">{roomId}</h1>
        {role && <Badge variant="outline">{ROLE_LABEL[role]}</Badge>}
        <Badge variant={STATUS_VARIANT[status]} role="status" aria-live="polite">
          {statusLabel}
        </Badge>
      </header>

      {error && (
        <div className="flex flex-wrap items-center gap-3 border-b bg-destructive/10 px-4 py-2" role="alert">
          <p className="text-sm text-destructive">{error}</p>
          {(status === "error" || status === "disconnected") && (
            <Button type="button" size="sm" variant="outline" onClick={retry}>
              <RotateCw />
              {TEXT.retry}
            </Button>
          )}
        </div>
      )}

      {room ? (
        <ConnectedRoom room={room} roomId={roomId} role={role} />
      ) : (
        <p className="m-auto text-muted-foreground">{TEXT.status[status]}</p>
      )}
    </div>
  );
}

function ConnectedRoom({ room, roomId, role }: { room: Room; roomId: string; role: Role | null }) {
  const { layout, commit, error } = useLayoutSync(room, roomId);

  return (
    <RoomContext.Provider value={room}>
      <main className="relative min-h-0 flex-1 overflow-hidden">
        {error && (
          <p className="absolute inset-x-0 top-0 z-10 bg-destructive/10 px-4 py-1 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <Stage room={room} layout={layout} editable={role === "admin"} onCommit={(next) => void commit(next)} />
      </main>
      <footer className="flex flex-wrap items-start justify-center gap-3 border-t px-3 py-2">
        <StartAudio label={TEXT.startAudio} className="rounded-md border px-3 py-1 text-sm" />
        {canPublishFor(role) && (
          <>
            <MediaControls room={room} />
            <ScreenControls room={room} />
          </>
        )}
      </footer>
      <RoomAudioRenderer room={room} />
    </RoomContext.Provider>
  );
}
