import { ConnectionState, DisconnectReason, Room, RoomEvent } from "livekit-client";
import { useCallback, useEffect, useState } from "react";
import type { Role } from "../../shared/api.types";
import { ApiRequestError, getRoomToken } from "../api.client";
import { errorMessage } from "../error.message";

/** Status koneksi yang ditampilkan UI. Reconnecting dipetakan ke "connecting". */
export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

const TEXT = {
  unauthorized: "Sesi berakhir, silakan masuk lagi",
  forbidden: "Anda bukan anggota room ini",
  notFound: "Room tidak ditemukan",
  mediaServer: "Gagal terhubung ke server media",
  duplicate: "Akun ini masuk dari tab atau perangkat lain",
  removed: "Anda dikeluarkan dari room",
  roomDeleted: "Room sudah dihapus",
  serverShutdown: "Server media dimatikan",
  lost: "Koneksi ke room terputus",
};

const API_ERROR_TEXT: Record<number, string> = {
  401: TEXT.unauthorized,
  403: TEXT.forbidden,
  404: TEXT.notFound,
};

/** Viewer hanya subscribe; tombol publish disembunyikan (spike 03: penolakan server baru datang ~10 dtk). */
export function canPublishFor(role: Role | null): boolean {
  return role === "admin" || role === "participant";
}

/** Pesan error saat join: status API dikenal → teks khusus; error LiveKit → teks server media. */
export function connectionErrorMessage(err: unknown): string {
  if (err instanceof ApiRequestError) return API_ERROR_TEXT[err.status] ?? errorMessage(err);
  if (err instanceof Error && err.name === "ConnectionError") return TEXT.mediaServer;
  return errorMessage(err);
}

/** Pemetaan state LiveKit → status UI. */
export function statusFromConnectionState(state: ConnectionState): ConnectionStatus {
  switch (state) {
    case ConnectionState.Connected:
      return "connected";
    case ConnectionState.Disconnected:
      return "disconnected";
    default:
      return "connecting";
  }
}

/** Pesan putus koneksi; CLIENT_INITIATED (keluar sendiri) → null. */
export function disconnectMessage(reason: DisconnectReason | undefined): string | null {
  switch (reason) {
    case DisconnectReason.CLIENT_INITIATED:
      return null;
    case DisconnectReason.DUPLICATE_IDENTITY:
      return TEXT.duplicate;
    case DisconnectReason.PARTICIPANT_REMOVED:
      return TEXT.removed;
    case DisconnectReason.ROOM_DELETED:
      return TEXT.roomDeleted;
    case DisconnectReason.SERVER_SHUTDOWN:
      return TEXT.serverShutdown;
    default:
      return TEXT.lost;
  }
}

export type RoomConnection = {
  room: Room | null;
  role: Role | null;
  status: ConnectionStatus;
  error: string | null;
  /** Coba join ulang (token baru + Room baru). */
  retry: () => void;
};

type ConnState = Omit<RoomConnection, "retry">;
const INITIAL: ConnState = { room: null, role: null, status: "connecting", error: null };

/** Join room: POST token → Room baru → connect; disconnect saat unmount/roomId berubah. */
export function useRoomConnection(roomId: string): RoomConnection {
  const [state, setState] = useState<ConnState>(INITIAL);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    const room = new Room({ adaptiveStream: true, dynacast: true });
    setState(INITIAL);

    room
      .on(RoomEvent.ConnectionStateChanged, (s) => {
        setState((prev) => ({ ...prev, status: statusFromConnectionState(s) }));
      })
      .on(RoomEvent.Disconnected, (reason) => {
        const message = disconnectMessage(reason);
        if (message) console.warn(`room ${roomId}: terputus (reason=${reason})`);
        setState((prev) => ({ ...prev, status: "disconnected", error: message }));
      })
      .on(RoomEvent.MediaDevicesError, (err) => {
        console.error(`room ${roomId}: media device`, err);
      });

    (async () => {
      try {
        const { token, url, role } = await getRoomToken(roomId);
        if (cancelled) return;
        await room.connect(url, token);
        if (cancelled) return;
        setState({ room, role, status: "connected", error: null });
      } catch (err) {
        // Unmount di tengah connect membatalkan connect: itu disengaja, bukan error untuk user.
        if (cancelled) return;
        console.error(`room ${roomId}: join gagal`, err);
        setState({ room: null, role: null, status: "error", error: connectionErrorMessage(err) });
      }
    })();

    return () => {
      cancelled = true;
      room.removeAllListeners();
      room.disconnect().catch((err: unknown) => console.error(`room ${roomId}: disconnect gagal`, err));
    };
  }, [roomId, attempt]);

  return { ...state, retry };
}
