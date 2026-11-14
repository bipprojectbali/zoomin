/**
 * Konvensi nama track (kontrak, RND/plan/01-arsitektur.md §Konvensi nama track).
 * Layout mereferensikan track via {identity, trackName}, jadi nama harus stabil dan unik per koneksi.
 */

export const CAMERA_TRACK = "camera";
export const MIC_TRACK = "mic";

export type ScreenTrackNames = { video: string; audio: string; index: number };

export type ParsedTrackName =
  | { kind: "camera" }
  | { kind: "mic" }
  | { kind: "screen"; index: number }
  | { kind: "screen-audio"; index: number };

/**
 * Generator nama layar per koneksi: `screen-N` / `screen-N-audio`, N mulai 1, naik terus
 * dan tidak pernah dipakai ulang (slot layout layar yang berhenti tidak terisi layar lain).
 */
export function createScreenNamer(): { next(): ScreenTrackNames } {
  let n = 0;
  return {
    next() {
      n += 1;
      return { video: `screen-${n}`, audio: `screen-${n}-audio`, index: n };
    },
  };
}

// N = integer positif tanpa nol di depan (tolak `screen-0`, `screen-01`).
const SCREEN_RE = /^screen-([1-9]\d*)(-audio)?$/;

/** Parse nama track; nama di luar konvensi → null. */
export function parseTrackName(name: string): ParsedTrackName | null {
  if (name === CAMERA_TRACK) return { kind: "camera" };
  if (name === MIC_TRACK) return { kind: "mic" };
  const m = SCREEN_RE.exec(name);
  if (!m) return null;
  const index = Number(m[1]);
  if (!Number.isSafeInteger(index)) return null;
  return m[2] ? { kind: "screen-audio", index } : { kind: "screen", index };
}

/** Nama track audio pasangan sebuah track video layar (`screen-N` → `screen-N-audio`). */
export function screenAudioFor(videoName: string): string {
  const parsed = parseTrackName(videoName);
  if (parsed?.kind !== "screen") {
    throw new Error(`screenAudioFor: "${videoName}" bukan nama track video layar (screen-N)`);
  }
  return `screen-${parsed.index}-audio`;
}
