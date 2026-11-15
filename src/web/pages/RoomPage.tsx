import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ApiRequestError, getRoom, getRoomToken, joinRoomWithPassword } from "@/api.client";
import { takeFirstJoinChoices } from "@/prejoin/media.preferences";
import { PreJoin } from "@/prejoin/PreJoin";
import { PasswordGate } from "@/room-password/PasswordGate";
import type { PreJoinChoices } from "@/prejoin/prejoin.types";
import { ConnectedRoom } from "@/room/ConnectedRoom";
import { canPublishFor, logJoinFailure, useRoomConnection, type ConnectionError } from "@/room/room.connection";
import { ROOM_LABELS } from "@/room/room.labels";
import { RoomStatusScreen } from "@/room/RoomStatusScreen";
import { ROLE_LABEL } from "@/role.label";
import { hasRole, RequireSession, useSession } from "@/session.context";
import type { RoomRole, RoomSummary } from "../../shared/api.types";

/**
 * GET /rooms/:id menjawab 403 `forbidden` untuk semua non-anggota; hanya endpoint token yang membedakan room ber-password
 * (W6, 403 `password_required`). Jadi 403 dari info room diperiksa sekali lewat token. Token yang (tak terduga) berhasil dibuang.
 */
async function needsPassword(roomId: string, err: unknown): Promise<boolean> {
  if (err instanceof ApiRequestError && err.code === "password_required") return true;
  if (!(err instanceof ApiRequestError && err.status === 403 && err.code === "forbidden")) return false;
  try {
    await getRoomToken(roomId);
    return false;
  } catch (probe) {
    return probe instanceof ApiRequestError && probe.code === "password_required";
  }
}

/** Halaman /rooms/:roomId (terlindung sesi). */
export function RoomPage() {
  const { roomId = "" } = useParams();
  return (
    <RequireSession>
      {/* key: ganti room = state koneksi baru sepenuhnya. */}
      <RoomView key={roomId} roomId={roomId} />
    </RequireSession>
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
  // Non-anggota room password (W4/W6): form password sebelum info room / token bisa diambil.
  const [gate, setGate] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSummaryError(null);
    getRoom(roomId)
      .then((s) => !cancelled && setSummary(s))
      .catch(async (err: unknown) => {
        const error = logJoinFailure(`room ${roomId}: muat info room gagal`, err);
        const locked = await needsPassword(roomId, err);
        if (cancelled) return;
        if (locked) setGate(true);
        else setSummaryError(error);
      });
    return () => {
      cancelled = true;
    };
  }, [roomId, summaryAttempt]);

  const title = summary?.title ?? roomId;
  // Admin global yang bukan member diperlakukan host (A7, token.route.ts); peran dari token menang setelah join.
  const role: RoomRole | null = conn.role ?? summary?.role ?? (hasRole(user, "admin") ? "host" : null);
  const toLobby = () => navigate("/app");
  const { status, room } = conn;

  async function unlock(password: string) {
    await joinRoomWithPassword(roomId, password);
    setGate(false);
    setSummaryAttempt((n) => n + 1);
    if (conn.error?.kind === "password_required") conn.retry();
  }

  let body;
  if (gate || conn.error?.kind === "password_required") {
    body = (
      <div className="flex flex-1 p-4">
        <PasswordGate roomTitle={title} onSubmit={unlock} onLobby={toLobby} />
      </div>
    );
  } else if (status === "left" || status === "disconnected" || status === "error" || (summaryError && !choices)) {
    const kind = status === "left" || status === "disconnected" ? status : "error";
    body = <RoomStatusScreen kind={kind} error={conn.error ?? summaryError} onRejoin={summaryError && !choices ? () => setSummaryAttempt((n) => n + 1) : conn.retry} onLobby={toLobby} />;
  } else if (room && (status === "connected" || status === "reconnecting")) {
    body = (
      <ConnectedRoom
        room={room}
        roomId={roomId}
        title={title}
        role={role}
        status={status}
        summary={summary}
        onSummaryChanged={setSummary}
        onLeave={() => void conn.leave()}
        onRoomDeleted={() => {
          void conn.leave();
          toLobby();
        }}
      />
    );
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
