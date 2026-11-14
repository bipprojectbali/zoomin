/**
 * Edit layout khusus stage yang belum ada di shared/layout.model: taruh track ke slot (ganti) atau tambah slot.
 * Version tidak diubah (dikelola server via CAS).
 */
import { LAYOUT_MAX_SLOTS, LayoutValidationError, type LayoutState, type TrackRef } from "../../shared/layout.model";
import { keyOf } from "./stage.resolve";

/**
 * index = slot tujuan (ganti trackRef-nya; size slot dipertahankan), null = tambah slot di akhir.
 * Track yang sudah ada di layout dipindah (tukar posisi) agar tidak duplikat.
 */
export function placeTrack(state: LayoutState, index: number | null, trackRef: TrackRef, by: string): LayoutState {
  const n = state.slots.length;
  const existing = state.slots.findIndex((s) => keyOf(s.trackRef) === keyOf(trackRef));
  const slots = state.slots.map((s) => ({ ...s }));
  let panelSizes = state.panelSizes;
  if (index === null) {
    if (existing >= 0) return state;
    if (n >= LAYOUT_MAX_SLOTS) throw new LayoutValidationError("slots", `placeTrack: maks ${LAYOUT_MAX_SLOTS} slot`);
    slots.push({ trackRef });
    // side-by-side: jumlah panel = jumlah slot, ukuran lama tidak valid lagi → render pakai default.
    if (state.template === "side-by-side") panelSizes = undefined;
  } else {
    if (!Number.isInteger(index) || index < 0 || index >= n) {
      throw new LayoutValidationError("slots", `placeTrack: index ${index} di luar 0..${n - 1}`);
    }
    if (existing === index) return state;
    if (existing >= 0) slots[existing]!.trackRef = slots[index]!.trackRef;
    slots[index]!.trackRef = trackRef;
  }
  const next: LayoutState = { ...state, slots, panelSizes, updatedBy: by, updatedAt: Date.now() };
  if (next.panelSizes === undefined) delete next.panelSizes;
  return next;
}
