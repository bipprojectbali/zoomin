/** Pemetaan track LiveKit → slot layout (murni). */
import type { LayoutSlot, LayoutState, TrackRef } from "../../shared/layout.model";

/** Bentuk minimal TrackReference components-react yang dipakai stage. */
export type TrackLike = {
  participant: { identity: string; name?: string };
  publication: { trackName: string };
  source: string;
};

const SCREEN_SOURCE = "screen_share"; // = Track.Source.ScreenShare

export const keyOf = (r: TrackRef) => `${r.identity}\u0000${r.trackName}`;
export const refOf = (t: TrackLike): TrackRef => ({ identity: t.participant.identity, trackName: t.publication.trackName });

export type ResolvedSlot<T> = { index: number; slot: LayoutSlot; track: T | null };

/** Slot terisi track yang cocok (atau null = kosong); track yang tidak ada di layout → extras. */
export function resolveSlots<T extends TrackLike>(layout: LayoutState, tracks: T[]): { slots: ResolvedSlot<T>[]; extras: T[] } {
  const byKey = new Map(tracks.map((t) => [keyOf(refOf(t)), t]));
  const used = new Set<string>();
  const slots = layout.slots.map((slot, index) => {
    const k = keyOf(slot.trackRef);
    used.add(k);
    return { index, slot, track: byKey.get(k) ?? null };
  });
  return { slots, extras: tracks.filter((t) => !used.has(keyOf(refOf(t)))) };
}

/** Berdampingan dengan lebih dari ini jadi kolom potret sempit → dirender sebagai grid (UX-19). */
export const SIDE_BY_SIDE_MAX = 3;

/**
 * Layout otomatis saat admin belum mengatur (UX-19):
 * - ada layar → slot = layar saja; kamera tidak masuk slot sehingga tampil di strip kecil "lainnya".
 * - tanpa layar → slot = kamera.
 * Template: 2 track → berdampingan, selain itu grid (1 track grid = penuh). Urutan stabil (numeric).
 */
export function autoLayout(tracks: TrackLike[]): LayoutState {
  const screens = tracks.filter((t) => t.source === SCREEN_SOURCE);
  const main = (screens.length > 0 ? screens : tracks).toSorted((a, b) =>
    keyOf(refOf(a)).localeCompare(keyOf(refOf(b)), "en", { numeric: true }),
  );
  return {
    version: 0,
    template: main.length === 2 ? "side-by-side" : "grid",
    slots: main.map((t) => ({ trackRef: refOf(t) })),
    updatedBy: "auto",
    updatedAt: 0,
  };
}
