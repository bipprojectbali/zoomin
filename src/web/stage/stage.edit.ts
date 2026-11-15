/**
 * Edit layout khusus stage yang belum ada di shared/layout.model: taruh track ke slot (ganti), tambah, atau hapus slot.
 * Template custom-grid selalu lewat shared/layout.grid.ts agar grid & slots tetap sinkron (server menolak yang tidak).
 * Version tidak diubah (dikelola server via CAS).
 */
import { addRow, clearCell, placeInCell } from "../../shared/layout.grid";
import { LAYOUT_MAX_SLOTS, LayoutValidationError, type LayoutState, type TrackRef } from "../../shared/layout.model";
import { keyOf } from "./stage.resolve";

/** Index sel custom-grid yang memuat slot ke-`slotIndex` (slots = sel terisi berurutan). */
export function cellOfSlot(state: LayoutState, slotIndex: number): number {
  const ref = state.slots[slotIndex]?.trackRef;
  const cell = ref ? (state.grid?.cells.findIndex((c) => c.trackRef && keyOf(c.trackRef) === keyOf(ref)) ?? -1) : -1;
  if (cell < 0) throw new LayoutValidationError("slots", `slot ${slotIndex} is not in the grid`);
  return cell;
}

/** custom-grid: index = slot tujuan (via selnya), null = sel kosong pertama (penuh → tambah baris). */
function placeInGrid(state: LayoutState, index: number | null, trackRef: TrackRef, by: string): LayoutState {
  if (index !== null) return placeInCell(state, cellOfSlot(state, index), trackRef, by);
  if (state.slots.some((s) => keyOf(s.trackRef) === keyOf(trackRef))) return state;
  const grown = state.grid!.cells.some((c) => c.trackRef === null) ? state : addRow(state, by);
  return placeInCell(grown, grown.grid!.cells.findIndex((c) => c.trackRef === null), trackRef, by);
}

/**
 * index = slot tujuan (ganti trackRef-nya; size slot dipertahankan), null = tambah slot di akhir.
 * Track yang sudah ada di layout dipindah (tukar posisi) agar tidak duplikat.
 */
export function placeTrack(state: LayoutState, index: number | null, trackRef: TrackRef, by: string): LayoutState {
  if (state.grid) return placeInGrid(state, index, trackRef, by);
  const n = state.slots.length;
  const existing = state.slots.findIndex((s) => keyOf(s.trackRef) === keyOf(trackRef));
  const slots = state.slots.map((s) => ({ ...s }));
  let panelSizes = state.panelSizes;
  if (index === null) {
    if (existing >= 0) return state;
    if (n >= LAYOUT_MAX_SLOTS) throw new LayoutValidationError("slots", `placeTrack: at most ${LAYOUT_MAX_SLOTS} slots`);
    slots.push({ trackRef });
    // side-by-side: jumlah panel = jumlah slot, ukuran lama tidak valid lagi → render pakai default.
    if (state.template === "side-by-side") panelSizes = undefined;
  } else {
    if (!Number.isInteger(index) || index < 0 || index >= n) {
      throw new LayoutValidationError("slots", `placeTrack: index ${index} is outside 0..${n - 1}`);
    }
    if (existing === index) return state;
    if (existing >= 0) slots[existing]!.trackRef = slots[index]!.trackRef;
    slots[index]!.trackRef = trackRef;
  }
  return withSlots(state, slots, panelSizes, by);
}

/**
 * Hapus slot index dari layout (mis. slot yatim milik peserta yang sudah keluar).
 * side-by-side: panelSizes dibuang (jumlah panel berubah); focus: ukuran stage/strip tetap; custom-grid: sel dikosongkan.
 */
export function removeSlot(state: LayoutState, index: number, by: string): LayoutState {
  const n = state.slots.length;
  if (!Number.isInteger(index) || index < 0 || index >= n) {
    throw new LayoutValidationError("slots", `removeSlot: index ${index} is outside 0..${n - 1}`);
  }
  if (state.grid) return clearCell(state, cellOfSlot(state, index), by);
  const slots = state.slots.filter((_, i) => i !== index).map((s) => ({ ...s }));
  return withSlots(state, slots, state.template === "side-by-side" ? undefined : state.panelSizes, by);
}

/** Baris/kolom terakhir custom-grid bisa dihapus: masih >1 dan semua selnya kosong. */
export function canRemoveLast(state: LayoutState, axis: "row" | "column"): boolean {
  const g = state.grid;
  if (!g) return false;
  const count = axis === "row" ? g.rows : g.cols;
  const hit = (i: number) => (axis === "row" ? Math.floor(i / g.cols) === g.rows - 1 : i % g.cols === g.cols - 1);
  return count > 1 && g.cells.every((c, i) => !hit(i) || c.trackRef === null);
}

function withSlots(state: LayoutState, slots: LayoutState["slots"], panelSizes: number[] | undefined, by: string): LayoutState {
  const next: LayoutState = { ...state, slots, panelSizes, updatedBy: by, updatedAt: Date.now() };
  if (next.panelSizes === undefined) delete next.panelSizes;
  return next;
}
