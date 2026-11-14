import { RoomAudioRenderer, RoomContext, useAudioPlayback } from "@livekit/components-react";
import type { Room } from "livekit-client";
import { VolumeX } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getRoom } from "@/api.client";
import { takeFirstJoinChoices } from "@/prejoin/media.preferences";
import { PreJoin } from "@/prejoin/PreJoin";
import type { PreJoinChoices } from "@/prejoin/prejoin.types";
import { ConnectionBanner } from "@/room/ConnectionBanner";
import { ControlBar } from "@/room/ControlBar";
import { ParticipantsPanel, useParticipantCount } from "@/room/ParticipantsPanel";
import { canPublishFor, controlsEnabled, joinErrorFor, useRoomConnection, type ConnectionError, type ConnectionStatus } from "@/room/room.connection";
import { ROOM_LABELS } from "@/room/room.labels";
import { useRoomToasts } from "@/room/room.toasts";
import { RoomStatusScreen } from "@/room/RoomStatusScreen";
import { ROLE_LABEL } from "@/role.label";
import { ProtectedPage, useSession } from "@/session.context";
import { useLayoutSync } from "@/stage/layout.sync";
import { Stage } from "@/stage/Stage";
import type { Role, RoomSummary } from "../../shared/api.types";

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

/** Alur: info room → (pilihan dari undangan | pre-join) → koneksi → room / layar status. */
function RoomView({ roomId }: { roomId: string }) {
  const navigate = useNavigate();
  const { user } = useSession();
  const [summary, setSummary] = useState<RoomSummary | null>(null);
  const [summaryError, setSummaryError] = useState<ConnectionError | null>(null);
  // InvitePage menitipkan pilihan join pertama → lewati pre-join kedua. Initializer dipakai sekali oleh React.
  const [choices, setChoices] = useState<PreJoinChoices | null>(() => takeFirstJoinChoices(roomId));
  const conn = useRoomConnection(roomId, choices);
  const [summaryAttempt, setSummaryAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setSummaryError(null);
    getRoom(roomId)
      .then((s) => !cancelled && setSummary(s))
      .catch((err: unknown) => {
        console.error(`room ${roomId}: muat info room gagal`, err);
        if (!cancelled) setSummaryError(joinErrorFor(err));
      });
    return () => {
      cancelled = true;
    };
  }, [roomId, summaryAttempt]);

  const title = summary?.title ?? roomId;
  // Admin global yang bukan member mendapat token admin (token.route.ts); peran dari token menang setelah join.
  const role: Role | null = conn.role ?? summary?.role ?? (user?.isAdmin ? "admin" : null);
  const toLobby = () => navigate("/");
  const { status, room } = conn;

  let body;
  if (status === "left" || status === "disconnected" || status === "error" || (summaryError && !choices)) {
    const kind = status === "left" || status === "disconnected" ? status : "error";
    body = <RoomStatusScreen kind={kind} error={conn.error ?? summaryError} onRejoin={summaryError && !choices ? () => setSummaryAttempt((n) => n + 1) : conn.retry} onLobby={toLobby} />;
  } else if (room && (status === "connected" || status === "reconnecting")) {
    body = <ConnectedRoom room={room} roomId={roomId} title={title} role={role} status={status} onLeave={() => void conn.leave()} />;
  } else if (!choices && summary) {
    body = (
      <PreJoin
        title={title}
        subtitle={role ? ROOM_LABELS.joinAs(ROLE_LABEL[role]) : undefined}
        canPublish={canPublishFor(role)}
        onJoin={(c) => setChoices(c)}
      />
    );
  } else {
    body = <p className="m-auto text-muted-foreground">{choices ? ROOM_LABELS.status.connecting : ROOM_LABELS.loading}</p>;
  }

  return (
    <div className="flex h-svh flex-col">
      {/* Status mesin-terbaca untuk e2e & pembaca layar; banner/layar status menangani visualnya. */}
      <span className="sr-only" data-testid="connection-status" data-status={status}>
        {ROOM_LABELS.status[status]}
      </span>
      {body}
    </div>
  );
}

function ConnectedRoom({ room, roomId, title, role, status, onLeave }: {
  room: Room;
  roomId: string;
  title: string;
  role: Role | null;
  status: ConnectionStatus;
  onLeave: () => void;
}) {
  const { layout, commit, error } = useLayoutSync(room, roomId);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const participantCount = useParticipantCount(room);
  useRoomToasts(room, room.localParticipant.identity);
  const enabled = controlsEnabled(status);

  return (
    <RoomContext.Provider value={room}>
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3 sm:px-4">
        <h1 className="min-w-0 flex-1 truncate font-semibold">{title}</h1>
        {role && <Badge variant="outline">{ROLE_LABEL[role]}</Badge>}
      </header>
      <ConnectionBanner status={status} />
      <main className="relative min-h-0 flex-1 overflow-hidden">
        <AudioBlockedBanner room={room} />
        {error && (
          <p className="absolute inset-x-0 top-0 z-10 bg-destructive/10 px-4 py-1 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <Stage room={room} layout={layout} editable={role === "admin" && enabled} onCommit={(next) => void commit(next)} />
      </main>
      <ControlBar
        room={room}
        roomId={roomId}
        enabled={enabled}
        canPublish={canPublishFor(role)}
        canInvite={role === "admin"}
        participantCount={participantCount}
        onOpenParticipants={() => setParticipantsOpen(true)}
        onLeave={onLeave}
      />
      <ParticipantsPanel room={room} open={participantsOpen} onOpenChange={setParticipantsOpen} />
      <RoomAudioRenderer room={room} />
    </RoomContext.Provider>
  );
}

/** Autoplay diblokir (UX-10): ajakan mencolok di atas stage; klik = gesture yang membuka audio. */
function AudioBlockedBanner({ room }: { room: Room }) {
  const { canPlayAudio, startAudio } = useAudioPlayback(room);
  if (canPlayAudio) return null;
  return (
    <div className="absolute inset-x-0 top-3 z-20 flex justify-center px-3">
      <Button
        type="button"
        size="lg"
        className="rounded-full shadow-lg"
        onClick={() => startAudio().catch((err: unknown) => console.error("room: startAudio gagal", err))}
        data-testid="start-audio"
      >
        <VolumeX />
        {ROOM_LABELS.audioBlocked} · {ROOM_LABELS.audioStart}
      </Button>
    </div>
  );
}
