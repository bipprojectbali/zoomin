/** Pemetaan track LiveKit → slot layout (murni). */
import { CAMERA_TRACK } from "../../shared/track.naming";
import type { LayoutSlot, LayoutState, TrackRef } from "../../shared/layout.model";
import { roleFromMetadata } from "../room/participants.model";

/** Bentuk minimal TrackReference components-react yang dipakai stage. */
export type TrackLike = {
  participant: { identity: string; name?: string };
  publication: { trackName: string };
  source: string;
};

const SCREEN_SOURCE = "screen_share"; // = Track.Source.ScreenShare
const CAMERA_SOURCE = "camera"; // = Track.Source.Camera

export const keyOf = (r: TrackRef) => `${r.identity}\u0000${r.trackName}`;
export const refOf = (t: TrackLike): TrackRef => ({ identity: t.participant.identity, trackName: t.publication.trackName });

/** live = ada track, atau tile avatar peserta yang hadir tanpa kamera (QA-01). */
export type ResolvedSlot<T> = { index: number; slot: LayoutSlot; track: T | null; live: boolean };
/** Item di luar layout: track nyata, atau avatar (track null). */
export type ExtraItem<T> = { ref: TrackRef; track: T | null };

/**
 * Tile avatar (QA-01): peserta yang bisa publish (host/participant dari metadata `{"role":…}`) tanpa publikasi kamera
 * dapat ref kamera `{identity, "camera"}` agar tetap punya tile. Penonton tidak.
 */
export function avatarRefs(people: { identity: string; metadata?: string }[], tracks: TrackLike[]): TrackRef[] {
  const withCamera = new Set(tracks.filter((t) => t.source === CAMERA_SOURCE).map((t) => t.participant.identity));
  return people
    .filter((p) => !withCamera.has(p.identity) && ["host", "participant"].includes(roleFromMetadata(p.metadata) ?? ""))
    .map((p) => ({ identity: p.identity, trackName: CAMERA_TRACK }));
}

/** Slot terisi track yang cocok (atau null = kosong); track/avatar yang tidak ada di layout → extras. */
export function resolveSlots<T extends TrackLike>(
  layout: LayoutState,
  tracks: T[],
  avatars: TrackRef[] = [],
): { slots: ResolvedSlot<T>[]; extras: ExtraItem<T>[] } {
  const byKey = new Map(tracks.map((t) => [keyOf(refOf(t)), t]));
  const avatarKeys = new Set(avatars.map(keyOf));
  const used = new Set<string>();
  const slots = layout.slots.map((slot, index) => {
    const k = keyOf(slot.trackRef);
    used.add(k);
    const track = byKey.get(k) ?? null;
    return { index, slot, track, live: track !== null || avatarKeys.has(k) };
  });
  const extras: ExtraItem<T>[] = [
    ...tracks.filter((t) => !used.has(keyOf(refOf(t)))).map((t) => ({ ref: refOf(t), track: t })),
    ...avatars.filter((r) => !used.has(keyOf(r))).map((ref) => ({ ref, track: null })),
  ];
  return { slots, extras };
}

/**
 * Template fokus (QA-03): index slot yang dirender di panggung besar SECARA LOKAL.
 * Slot fokus (0) aktif → 0; tidak → slot aktif pertama; tidak ada yang aktif → -1 (empty state).
 */
export const focusMainIndex = (slots: { live: boolean }[]): number => (slots[0]?.live ? 0 : slots.findIndex((s) => s.live));

/** Berdampingan dengan lebih dari ini jadi kolom potret sempit → dirender sebagai grid (UX-19). */
export const SIDE_BY_SIDE_MAX = 3;

/**
 * Layout otomatis saat host belum mengatur (UX-19, QA-01):
 * - ada layar → slot = layar saja; kamera & avatar tidak masuk slot sehingga tampil di strip kecil "lainnya".
 * - tanpa layar → slot = kamera + avatar.
 * Template: 2 track → berdampingan, selain itu grid (1 track grid = penuh). Urutan stabil (numeric).
 */
export function autoLayout(tracks: TrackLike[], avatars: TrackRef[] = []): LayoutState {
  const screens = tracks.filter((t) => t.source === SCREEN_SOURCE).map(refOf);
  const main = (screens.length > 0 ? screens : [...tracks.map(refOf), ...avatars]).toSorted((a, b) =>
    keyOf(a).localeCompare(keyOf(b), "en", { numeric: true }),
  );
  return {
    version: 0,
    template: main.length === 2 ? "side-by-side" : "grid",
    slots: main.map((trackRef) => ({ trackRef })),
    updatedBy: "auto",
    updatedAt: 0,
  };
}
