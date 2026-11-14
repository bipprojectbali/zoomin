import { RoomEvent, type Participant, type RemoteParticipant, type RemoteTrackPublication, type Room } from "livekit-client";
import { useEffect } from "react";
import { toast } from "sonner";
import { displayName, presenceToastText, screenToastText } from "./participants.model";

const TEXT = { reconnected: "Koneksi tersambung kembali" };

/** Jendela agregasi masuk/keluar: banyak peserta dalam jendela ini = satu toast. */
const PRESENCE_BATCH_MS = 1500;

/**
 * Toast kejadian room (UX-05). Peserta yang sudah ada saat hook dipasang (setelah connect) tidak
 * memicu event, jadi join awal tidak spam. Diri sendiri tidak pernah di-toast.
 */
export function useRoomToasts(room: Room | null, localIdentity?: string): void {
  useEffect(() => {
    if (!room) return;
    const pending = { join: [] as string[], leave: [] as string[] };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const isSelf = (p: Participant) => p.isLocal || p.identity === localIdentity;

    const flush = () => {
      timer = undefined;
      for (const kind of ["join", "leave"] as const) {
        const text = presenceToastText(pending[kind], kind);
        if (text) toast(text);
        pending[kind] = [];
      }
    };
    const queue = (kind: "join" | "leave") => (p: RemoteParticipant) => {
      if (isSelf(p)) return;
      pending[kind].push(displayName(p));
      timer ??= setTimeout(flush, PRESENCE_BATCH_MS);
    };
    const onJoin = queue("join");
    const onLeave = queue("leave");
    const screen = (started: boolean) => (pub: RemoteTrackPublication, p: RemoteParticipant) => {
      if (isSelf(p)) return;
      // Peserta keluar → LiveKit meng-unpublish semua tracknya; cukup toast "keluar".
      if (!started && !room.remoteParticipants.has(p.identity)) return;
      const text = screenToastText(displayName(p), pub.trackName, started);
      if (text) toast(text);
    };
    const onPublished = screen(true);
    const onUnpublished = screen(false);
    const onReconnected = () => toast.success(TEXT.reconnected);

    room
      .on(RoomEvent.ParticipantConnected, onJoin)
      .on(RoomEvent.ParticipantDisconnected, onLeave)
      .on(RoomEvent.TrackPublished, onPublished)
      .on(RoomEvent.TrackUnpublished, onUnpublished)
      .on(RoomEvent.Reconnected, onReconnected);
    return () => {
      clearTimeout(timer);
      room
        .off(RoomEvent.ParticipantConnected, onJoin)
        .off(RoomEvent.ParticipantDisconnected, onLeave)
        .off(RoomEvent.TrackPublished, onPublished)
        .off(RoomEvent.TrackUnpublished, onUnpublished)
        .off(RoomEvent.Reconnected, onReconnected);
    };
  }, [room, localIdentity]);
}
