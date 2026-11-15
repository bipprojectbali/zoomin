/**
 * Operasi murni template custom-grid (S8, RND/plan/11-stage-control.md). Semua op mengembalikan state baru
 * lewat `touch` (version tidak diubah) dan menjaga `slots` = sel terisi berurutan (`gridSlots`).
 */
import {
  GRID_MAX_DIM,
  type GridCell,
  type LayoutGrid,
  LayoutValidationError,
  type LayoutState,
  LAYOUT_MAX_SLOTS,
  gridSlots,
  refKey,
  setTemplate,
  type TrackRef,
  touch,
} from "./layout.model";

/** Ke custom-grid: grid terkecil mendekati persegi yang memuat semua track; no-op (selain touch) bila sudah. */
export const toCustomGrid = (state: LayoutState, by: string): LayoutState => setTemplate(state, "custom-grid", by);

function gridOf(state: LayoutState, op: string): LayoutGrid {
  if (state.template !== "custom-grid" || !state.grid) {
    throw new LayoutValidationError("template", `${op}: requires template custom-grid, got ${state.template}`);
  }
  return state.grid;
}

function withGrid(state: LayoutState, grid: LayoutGrid, by: string): LayoutState {
  return touch(state, { grid, slots: gridSlots(grid.cells) }, by);
}

function checkIndex(index: number, size: number, path: string, op: string): void {
  if (!Number.isInteger(index) || index < 0 || index >= size) {
    throw new LayoutValidationError(path, `${op}: index ${index} outside 0..${size - 1}`);
  }
}

/**
 * Taruh track di sel `index`. Bila track sudah di sel lain, track pindah dan isi sel tujuan (bila ada)
 * bertukar ke sel asal; bila track baru, isi sel tujuan diganti (keluar dari stage).
 */
export function placeInCell(state: LayoutState, index: number, ref: TrackRef, by: string): LayoutState {
  const grid = gridOf(state, "placeInCell");
  checkIndex(index, grid.cells.length, "grid.cells", "placeInCell");
  const cells: GridCell[] = grid.cells.map((c) => ({ ...c }));
  const from = cells.findIndex((c) => c.trackRef && refKey(c.trackRef) === refKey(ref));
  if (from >= 0) cells[from] = { trackRef: cells[index]!.trackRef };
  cells[index] = { trackRef: { ...ref } };
  return withGrid(state, { ...grid, cells }, by);
}

/** Kosongkan sel `index` (track keluar dari stage). */
export function clearCell(state: LayoutState, index: number, by: string): LayoutState {
  const grid = gridOf(state, "clearCell");
  checkIndex(index, grid.cells.length, "grid.cells", "clearCell");
  const cells = grid.cells.map((c, i) => (i === index ? { trackRef: null } : { ...c }));
  return withGrid(state, { ...grid, cells }, by);
}

function checkSize(cols: number, rows: number, op: string): void {
  if (cols > GRID_MAX_DIM || rows > GRID_MAX_DIM || cols * rows > LAYOUT_MAX_SLOTS) {
    throw new LayoutValidationError("grid", `${op}: grid ${cols}x${rows} exceeds ${GRID_MAX_DIM}x${GRID_MAX_DIM}`);
  }
}

/** Tambah satu baris kosong di bawah. */
export function addRow(state: LayoutState, by: string): LayoutState {
  const grid = gridOf(state, "addRow");
  checkSize(grid.cols, grid.rows + 1, "addRow");
  const empty = Array.from({ length: grid.cols }, (): GridCell => ({ trackRef: null }));
  return withGrid(state, { ...grid, rows: grid.rows + 1, cells: [...grid.cells, ...empty] }, by);
}

/** Tambah satu kolom kosong di kanan (isi sel lain tetap di baris/kolomnya). */
export function addColumn(state: LayoutState, by: string): LayoutState {
  const grid = gridOf(state, "addColumn");
  checkSize(grid.cols + 1, grid.rows, "addColumn");
  const cells = Array.from({ length: grid.rows }, (_, r) => [
    ...grid.cells.slice(r * grid.cols, (r + 1) * grid.cols),
    { trackRef: null },
  ]).flat();
  return withGrid(state, { ...grid, cols: grid.cols + 1, cells }, by);
}

/** Hapus baris `index`; hanya bila semua selnya kosong dan masih tersisa ≥1 baris. */
export function removeRow(state: LayoutState, index: number, by: string): LayoutState {
  const grid = gridOf(state, "removeRow");
  checkIndex(index, grid.rows, "grid.rows", "removeRow");
  if (grid.rows === 1) throw new LayoutValidationError("grid.rows", "removeRow: grid needs at least 1 row");
  const inRow = (i: number) => Math.floor(i / grid.cols) === index;
  return removeCells(state, grid, inRow, { rows: grid.rows - 1 }, `row ${index}`, by);
}

/** Hapus kolom `index`; hanya bila semua selnya kosong dan masih tersisa ≥1 kolom. */
export function removeColumn(state: LayoutState, index: number, by: string): LayoutState {
  const grid = gridOf(state, "removeColumn");
  checkIndex(index, grid.cols, "grid.cols", "removeColumn");
  if (grid.cols === 1) throw new LayoutValidationError("grid.cols", "removeColumn: grid needs at least 1 column");
  const inCol = (i: number) => i % grid.cols === index;
  return removeCells(state, grid, inCol, { cols: grid.cols - 1 }, `column ${index}`, by);
}

function removeCells(
  state: LayoutState,
  grid: LayoutGrid,
  hit: (i: number) => boolean,
  dims: Partial<LayoutGrid>,
  what: string,
  by: string,
): LayoutState {
  const busy = grid.cells.findIndex((c, i) => hit(i) && c.trackRef !== null);
  if (busy >= 0) throw new LayoutValidationError(`grid.cells[${busy}]`, `cannot remove ${what}: cell is not empty`);
  const cells = grid.cells.filter((_, i) => !hit(i)).map((c) => ({ ...c }));
  return withGrid(state, { ...grid, ...dims, cells }, by);
}
