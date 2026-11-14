/** Deteksi gangguan jaringan lebih cepat dari state LiveKit (QA-05) + batas reconnect. */
import {
  ConnectionQuality,
  DefaultReconnectPolicy,
  RoomEvent,
  type Participant,
  type ReconnectContext,
  type ReconnectPolicy,
  type Room,
} from "livekit-client";
import { useEffect, useState } from "react";
import type { ConnectionStatus } from "./room.connection";

/** `lost` = koneksi putus (menyambung ulang); `weak` = masih terhubung tapi kualitas buruk. */
export type NetworkBannerKind = "lost" | "weak";

type NetworkSignals = { status: ConnectionStatus; online: boolean; quality: ConnectionQuality };

/**
 * Banner mana yang tampil. Event `offline` browser dan quality `lost` datang beberapa detik
 * sebelum LiveKit pindah ke Reconnecting (±15 dtk), jadi keduanya dianggap "putus".
 */
export function networkBannerFor({ status, online, quality }: NetworkSignals): NetworkBannerKind | null {
  if (status !== "connected" && status !== "reconnecting") return null;
  if (status === "reconnecting" || !online || quality === ConnectionQuality.Lost) return "lost";
  return quality === ConnectionQuality.Poor ? "weak" : null;
}

const SECONDS_PER_MINUTE = 60;
const MS_PER_SECOND = 1000;

/** Lama mencoba untuk banner: "12 dtk", "1 mnt 5 dtk". */
export function elapsedLabel(ms: number): string {
  const total = Math.max(0, Math.floor(ms / MS_PER_SECOND));
  const min = Math.floor(total / SECONDS_PER_MINUTE);
  const sec = total % SECONDS_PER_MINUTE;
  return min > 0 ? `${min} mnt ${sec} dtk` : `${sec} dtk`;
}

/**
 * Berhenti mencoba setelah batas ini → layar "Anda terputus" dengan tombol Sambung ulang / Ke lobby.
 * Default LiveKit 2.24 (10 percobaan, jeda s.d. 7 dtk + timeout tiap percobaan) baru menyerah ±2 menit (QA-05);
 * offline singkat (≤12 dtk, terukur pulih sendiri) tetap tertutup batas ini.
 */
export const RECONNECT_GIVE_UP_MS = 45_000;

/** Kebijakan resmi LiveKit (`reconnectPolicy`) dengan jeda default, dibatasi total waktu. */
export function cappedReconnectPolicy(
  capMs = RECONNECT_GIVE_UP_MS,
  base: ReconnectPolicy = new DefaultReconnectPolicy(),
): ReconnectPolicy {
  return {
    nextRetryDelayInMs: (ctx: ReconnectContext) => (ctx.elapsedMs >= capMs ? null : base.nextRetryDelayInMs(ctx)),
  };
}

/** Sinyal jaringan dari browser + kualitas koneksi lokal → jenis banner dan kapan gangguan mulai. */
export function useNetworkBanner(room: Room, status: ConnectionStatus): { kind: NetworkBannerKind | null; since: number | null } {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [quality, setQuality] = useState(() => room.localParticipant.connectionQuality);
  const [since, setSince] = useState<number | null>(null);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    const onQuality = (q: ConnectionQuality, p: Participant) => {
      if (p.isLocal) setQuality(q);
    };
    room.on(RoomEvent.ConnectionQualityChanged, onQuality);
    return () => {
      room.off(RoomEvent.ConnectionQualityChanged, onQuality);
    };
  }, [room]);

  const kind = networkBannerFor({ status, online, quality });
  const lost = kind === "lost";
  useEffect(() => setSince(lost ? Date.now() : null), [lost]);
  return { kind, since: lost ? since : null };
}
