/**
 * Opsi publish screen share (RND/plan/01-arsitektur.md §Publish, RND/spike/02-research.md §2).
 * VP8 + simulcast; VP9/AV1 dihindari karena SVC mengabaikan screenShareSimulcastLayers.
 */
import { ScreenSharePresets, Track, type TrackPublishOptions } from "livekit-client";

/** Share pertama dapat 1080p; share berikutnya 720p supaya CPU encoder + uplink tidak meledak. */
const FIRST_SHARE_PRESET = ScreenSharePresets.h1080fps15;
const NEXT_SHARE_PRESET = ScreenSharePresets.h720fps15;
/** Layer rendah untuk tile kecil (adaptiveStream memilihnya otomatis). */
const LOW_LAYER_PRESET = ScreenSharePresets.h360fps3;

export type ScreenContentHint = "detail" | "text" | "motion";

/** Opsi publish video layar ke-`shareIndex` (mulai 1). `name` diisi pemanggil. */
export function screenPublishOptions(shareIndex: number): TrackPublishOptions {
  const preset = shareIndex <= 1 ? FIRST_SHARE_PRESET : NEXT_SHARE_PRESET;
  return {
    source: Track.Source.ScreenShare,
    videoCodec: "vp8",
    simulcast: true,
    screenShareEncoding: preset.encoding,
    screenShareSimulcastLayers: [LOW_LAYER_PRESET],
  };
}

/** Opsi publish audio layar (hanya ada di Chromium saat berbagi tab/sistem). `name` diisi pemanggil. */
export function screenAudioPublishOptions(): TrackPublishOptions {
  return { source: Track.Source.ScreenShareAudio };
}

/** Set contentHint pada MediaStreamTrack; `detail`/`text` = teks tajam, fps dikorbankan. */
export function applyContentHint(track: MediaStreamTrack, hint: ScreenContentHint = "detail"): void {
  track.contentHint = hint;
}
