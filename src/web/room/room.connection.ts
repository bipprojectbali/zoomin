import { ConnectionState, DisconnectReason, Room, RoomEvent } from "livekit-client";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { Role } from "../../shared/api.types";
import { CAMERA_TRACK, MIC_TRACK } from "../../shared/track.naming";
import { ApiRequestError, getRoomToken } from "../api.client";
import { errorMessage } from "../error.message";
import type { PreJoinChoices } from "../prejoin/prejoin.types";

/** Status koneksi room untuk UI. `left` = keluar sukarela; `idle` = belum ada pilihan pre-join. */
export type ConnectionStatus = "idle" | "connecting" | "connected" | "reconnecting" | "disconnected" | "left" | "error";

export type ConnectionErrorKind =
  | "room_not_found"
  | "forbidden"
  | "unauthorized"
  | "duplicate_session"
  | "network"
  | "server"
  | "unknown";

/** Error join / putus koneksi yang siap ditampilkan. */
export type ConnectionError = { kind: ConnectionErrorKind; message: string };

const TEXT = {
  unauthorized: "Sesi berakhir, silakan masuk lagi",
  forbidden: "Anda bukan anggota room ini",
  notFound: "Room tidak ditemukan atau sudah dihapus",
  server: "Server sedang bermasalah, coba beberapa saat lagi",
  mediaServer: "Gagal terhubung ke server media",
  duplicate: "Anda membuka room ini di tab/perangkat lain",
  removed: "Anda dikeluarkan dari room",
  roomDeleted: "Room sudah dihapus",
  roomClosed: "Room sudah ditutup",
  serverShutdown: "Server media dimatikan",
  lost: "Koneksi ke room terputus",
  micFailed: "Mikrofon gagal diaktifkan",
  cameraFailed: "Kamera gagal diaktifkan",
};

const HTTP_SERVER_ERROR = 500;
const API_ERROR: Record<number, ConnectionError> = {
  401: { kind: "unauthorized", message: TEXT.unauthorized },
  403: { kind: "forbidden", message: TEXT.forbidden },
  404: { kind: "room_not_found", message: TEXT.notFound },
};

/** Viewer hanya subscribe; tombol publish disembunyikan (spike 03: penolakan server baru datang ~10 dtk). */
export function canPublishFor(role: Role | null): boolean {
  return role === "admin" || role === "participant";
}

/** Kontrol publish/layout hanya aktif saat benar-benar terhubung (BUG-03). */
export function controlsEnabled(status: ConnectionStatus): boolean {
  return status === "connected";
}

/** Retry tidak berguna bila room tidak ada, bukan anggota, atau sesi habis (UX-24). */
export function canRetry(error: ConnectionError | null): boolean {
  return !error || !["room_not_found", "forbidden", "unauthorized"].includes(error.kind);
}

/** Error saat join (token API / connect LiveKit) → kind + pesan. */
export function joinErrorFor(err: unknown): ConnectionError {
  if (err instanceof ApiRequestError) {
    const known = API_ERROR[err.status];
    if (known) return known;
    if (err.status >= HTTP_SERVER_ERROR) return { kind: "server", message: TEXT.server };
    return { kind: "unknown", message: errorMessage(err) };
  }
  // fetch() gagal di level jaringan → TypeError; LiveKit gagal connect → ConnectionError.
  if (err instanceof TypeError) return { kind: "network", message: errorMessage(err) };
  if (err instanceof Error && err.name === "ConnectionError") return { kind: "network", message: TEXT.mediaServer };
  return { kind: "unknown", message: errorMessage(err) };
}

/** Pemetaan state LiveKit → status UI. */
export function statusFromConnectionState(state: ConnectionState): ConnectionStatus {
  switch (state) {
    case ConnectionState.Connected:
      return "connected";
    case ConnectionState.Disconnected:
      return "disconnected";
    case ConnectionState.Reconnecting:
    case ConnectionState.SignalReconnecting:
      return "reconnecting";
    default:
      return "connecting";
  }
}

/** Error putus koneksi; CLIENT_INITIATED (keluar sendiri) → null. */
export function disconnectErrorFor(reason: DisconnectReason | undefined): ConnectionError | null {
  switch (reason) {
    case DisconnectReason.CLIENT_INITIATED:
      return null;
    case DisconnectReason.DUPLICATE_IDENTITY:
      return { kind: "duplicate_session", message: TEXT.duplicate };
    case DisconnectReason.PARTICIPANT_REMOVED:
      return { kind: "forbidden", message: TEXT.removed };
    case DisconnectReason.ROOM_DELETED:
      return { kind: "room_not_found", message: TEXT.roomDeleted };
    case DisconnectReason.ROOM_CLOSED:
      return { kind: "server", message: TEXT.roomClosed };
    case DisconnectReason.SERVER_SHUTDOWN:
      return { kind: "server", message: TEXT.serverShutdown };
    default:
      return { kind: "network", message: TEXT.lost };
  }
}

export type RoomConnection = {
  /** Tetap terisi setelah putus agar bisa dibaca; kontrol wajib mengikuti `controlsEnabled(status)`. */
  room: Room | null;
  role: Role | null;
  status: ConnectionStatus;
  error: ConnectionError | null;
  /** Join ulang (token baru + Room baru). */
  retry: () => void;
  /** Keluar sukarela → status `left`. */
  leave: () => Promise<void>;
};

type ConnState = Pick<RoomConnection, "room" | "role" | "status" | "error">;
const IDLE: ConnState = { room: null, role: null, status: "idle", error: null };

async function applyChoices(room: Room, choices: PreJoinChoices, roomId: string): Promise<void> {
  const lp = room.localParticipant;
  const tasks: Promise<unknown>[] = [];
  if (choices.audioEnabled) {
    tasks.push(
      lp.setMicrophoneEnabled(true, { deviceId: choices.audioDeviceId }, { name: MIC_TRACK }).catch((err: unknown) => {
        console.error(`room ${roomId}: aktifkan mikrofon gagal`, err);
        toast.error(TEXT.micFailed);
      }),
    );
  }
  if (choices.videoEnabled) {
    tasks.push(
      lp.setCameraEnabled(true, { deviceId: choices.videoDeviceId }, { name: CAMERA_TRACK }).catch((err: unknown) => {
        console.error(`room ${roomId}: aktifkan kamera gagal`, err);
        toast.error(TEXT.cameraFailed);
      }),
    );
  }
  await Promise.all(tasks);
}

/** Join room setelah pre-join: token → Room → connect → publish pilihan → startAudio. */
export function useRoomConnection(roomId: string, choices: PreJoinChoices | null): RoomConnection {
  const [state, setState] = useState<ConnState>(IDLE);
  const [attempt, setAttempt] = useState(0);
  const roomRef = useRef<Room | null>(null);
  const leavingRef = useRef(false);
  // Pilihan dibaca lewat ref: objek baru dari pemanggil tidak boleh memicu reconnect.
  const choicesRef = useRef(choices);
  choicesRef.current = choices;
  const ready = choices !== null;

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const leave = useCallback(async () => {
    leavingRef.current = true;
    const room = roomRef.current;
    if (room) await room.disconnect();
    setState((prev) => ({ ...prev, status: "left", error: null }));
  }, []);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    let joined = false;
    leavingRef.current = false;
    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;
    setState({ ...IDLE, status: "connecting" });

    room
      .on(RoomEvent.ConnectionStateChanged, (s) => {
        // Sebelum join selesai status dikelola alur connect; Disconnected ditangani event-nya sendiri.
        if (!joined || s === ConnectionState.Disconnected) return;
        setState((prev) => ({ ...prev, status: statusFromConnectionState(s) }));
      })
      .on(RoomEvent.Disconnected, (reason) => {
        if (leavingRef.current) {
          setState((prev) => ({ ...prev, status: "left", error: null }));
          return;
        }
        const error = disconnectErrorFor(reason);
        console.warn(`room ${roomId}: terputus (reason=${reason})`);
        setState((prev) => ({ ...prev, status: "disconnected", error }));
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
        const current = choicesRef.current;
        if (current && canPublishFor(role)) await applyChoices(room, current, roomId);
        // Klik "Gabung" adalah gesture user, jadi autoplay audio diizinkan; gagal → <StartAudio> jadi cadangan.
        await room.startAudio().catch((err: unknown) => console.warn(`room ${roomId}: startAudio ditolak`, err));
        if (cancelled) return;
        joined = true;
        setState({ room, role, status: statusFromConnectionState(room.state), error: null });
      } catch (err) {
        // Unmount di tengah connect membatalkan connect: itu disengaja, bukan error untuk user.
        if (cancelled) return;
        console.error(`room ${roomId}: join gagal`, err);
        setState({ room: null, role: null, status: "error", error: joinErrorFor(err) });
      }
    })();

    return () => {
      cancelled = true;
      room.removeAllListeners();
      room.disconnect().catch((err: unknown) => console.error(`room ${roomId}: disconnect gagal`, err));
    };
  }, [roomId, attempt, ready]);

  return { ...state, retry, leave };
}
