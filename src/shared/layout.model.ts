/**
 * Model layout stage: tipe, validasi, dan transformasi murni (tanpa SDK/DOM).
 * Dipakai server (validasi PUT layout) dan web (render + edit admin).
 * Port dari RND/spike/lk-bun/src/layout.ts; publish ke LiveKit ada di server (layout.service.ts).
 */

/** Batas layout kita jauh di bawah batas metadata LiveKit 512 KiB; layout wajar < 2 KiB. */
export const LAYOUT_MAX_BYTES = 16 * 1024;
export const LAYOUT_MAX_SLOTS = 49; // grid 7x7
export const LAYOUT_TEMPLATES = ["side-by-side", "grid", "focus", "custom-grid"] as const;
/** Batas baris/kolom template custom-grid (cols*rows juga ≤ LAYOUT_MAX_SLOTS). */
export const GRID_MAX_DIM = 7;
export const SLOT_SIZES = ["small", "medium", "large"] as const;
/** Toleransi total panelSizes terhadap 100 (pembulatan dari react-resizable-panels). */
export const PANEL_SIZES_TOTAL_TOLERANCE = 0.5;

export type LayoutTemplate = (typeof LAYOUT_TEMPLATES)[number];
export type SlotSize = (typeof SLOT_SIZES)[number];
export type TrackRef = { identity: string; trackName: string };
export type LayoutSlot = { trackRef: TrackRef; size?: SlotSize };
/** Sel custom-grid; `trackRef: null` = sel kosong (drop target). */
export type GridCell = { trackRef: TrackRef | null };
/** Grid custom: `cells.length === cols * rows`, urutan baris-mayor (index = row * cols + col). */
export type LayoutGrid = { cols: number; rows: number; cells: GridCell[] };
/** State layout yang disiarkan ke semua klien via room metadata. */
export type LayoutState = {
  version: number;
  template: LayoutTemplate;
  slots: LayoutSlot[];
  /** Ukuran panel dalam persen (total 100); jumlah = panelCountFor(template, slots.length). */
  panelSizes?: number[];
  /**
   * Hanya (dan wajib) untuk template custom-grid. `slots` tetap = sel terisi dalam urutan sel (tanpa size),
   * sehingga konsumen yang hanya membaca `slots` tetap benar; parseLayout menolak bila tidak sinkron.
   */
  grid?: LayoutGrid;
  updatedBy: string;
  updatedAt: number;
};

/** Error validasi layout; `path` menunjuk field yang salah (mis. `slots[2].trackRef.identity`). */
export class LayoutValidationError extends Error {
  constructor(
    readonly path: string,
    detail: string,
    options?: ErrorOptions,
  ) {
    super(`${path}: ${detail}`, options);
    this.name = "LayoutValidationError";
  }
}

const ROOT = "$";

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const byteLength = (s: string) => new TextEncoder().encode(s).byteLength;

function nonEmptyString(v: unknown, path: string): string {
  if (typeof v !== "string" || v.length === 0) throw new LayoutValidationError(path, "must be a non-empty string");
  return v;
}

function parseRef(v: unknown, p: string): TrackRef {
  if (!isObj(v)) throw new LayoutValidationError(p, "must be an object");
  return { identity: nonEmptyString(v.identity, `${p}.identity`), trackName: nonEmptyString(v.trackName, `${p}.trackName`) };
}

function parseSlot(v: unknown, i: number): LayoutSlot {
  const p = `slots[${i}]`;
  if (!isObj(v)) throw new LayoutValidationError(p, "must be an object");
  const trackRef = parseRef(v.trackRef, `${p}.trackRef`);
  if (v.size === undefined) return { trackRef };
  if (!SLOT_SIZES.includes(v.size as SlotSize)) {
    throw new LayoutValidationError(`${p}.size`, `"${String(v.size)}" is not one of ${SLOT_SIZES.join("|")}`);
  }
  return { trackRef, size: v.size as SlotSize };
}

const isDim = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= GRID_MAX_DIM;

/** Validasi grid custom-grid + sinkron dengan slots (slots = sel terisi, urut, tanpa size). */
function parseGrid(v: unknown, slots: LayoutSlot[]): LayoutGrid {
  if (!isObj(v)) throw new LayoutValidationError("grid", "must be an object (required for custom-grid)");
  if (!isDim(v.cols)) throw new LayoutValidationError("grid.cols", `must be an integer 1..${GRID_MAX_DIM}`);
  if (!isDim(v.rows)) throw new LayoutValidationError("grid.rows", `must be an integer 1..${GRID_MAX_DIM}`);
  const { cols, rows } = v;
  if (cols * rows > LAYOUT_MAX_SLOTS) throw new LayoutValidationError("grid", `cols*rows must be <= ${LAYOUT_MAX_SLOTS}`);
  if (!Array.isArray(v.cells) || v.cells.length !== cols * rows) {
    throw new LayoutValidationError("grid.cells", `must be an array of ${cols * rows} cells`);
  }
  const seen = new Set<string>();
  const cells = v.cells.map((c: unknown, i: number): GridCell => {
    const p = `grid.cells[${i}]`;
    if (!isObj(c)) throw new LayoutValidationError(p, "must be an object");
    if (c.trackRef === null) return { trackRef: null };
    const trackRef = parseRef(c.trackRef, `${p}.trackRef`);
    if (seen.has(refKey(trackRef))) throw new LayoutValidationError(`${p}.trackRef`, "duplicate trackRef");
    seen.add(refKey(trackRef));
    return { trackRef };
  });
  const filled = gridSlots(cells).map((s) => refKey(s.trackRef));
  if (slots.some((s) => s.size !== undefined) || filled.join("\n") !== slots.map((s) => refKey(s.trackRef)).join("\n")) {
    throw new LayoutValidationError("slots", "custom-grid slots must equal the filled grid.cells in order, without size");
  }
  return { cols, rows, cells };
}

/** Slots turunan custom-grid: sel terisi dalam urutan sel. */
export function gridSlots(cells: GridCell[]): LayoutSlot[] {
  return cells.flatMap((c) => (c.trackRef ? [{ trackRef: c.trackRef }] : []));
}

/**
 * Jumlah panel resizable per template: side-by-side = satu per slot,
 * focus = 2 (stage + strip), grid = 0 (tidak memakai panelSizes).
 */
export function panelCountFor(template: LayoutTemplate, slotCount: number): number {
  switch (template) {
    case "side-by-side":
      return slotCount;
    case "focus":
      return 2;
    case "grid":
    case "custom-grid":
      return 0;
  }
}

/** Validasi panelSizes terhadap template + jumlah slot; mengembalikan salinan array. */
function validatePanelSizes(v: unknown, template: LayoutTemplate, slotCount: number): number[] {
  if (!Array.isArray(v)) throw new LayoutValidationError("panelSizes", "must be an array of numbers");
  const expected = panelCountFor(template, slotCount);
  if (expected === 0) throw new LayoutValidationError("panelSizes", `template ${template} does not use panelSizes`);
  if (v.length !== expected) {
    throw new LayoutValidationError("panelSizes", `got ${v.length}, template ${template} needs ${expected}`);
  }
  v.forEach((n, i) => {
    if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) {
      throw new LayoutValidationError(`panelSizes[${i}]`, "must be a finite number > 0");
    }
  });
  const total = (v as number[]).reduce((a, b) => a + b, 0);
  if (Math.abs(total - 100) > PANEL_SIZES_TOTAL_TOLERANCE) {
    throw new LayoutValidationError("panelSizes", `total ${total}, must be 100 (±${PANEL_SIZES_TOTAL_TOLERANCE})`);
  }
  return [...(v as number[])];
}

/** Parse + validasi ketat JSON layout (dari room.metadata / body PUT). Field asing dibuang. */
export function parseLayout(json: string): LayoutState {
  if (byteLength(json) > LAYOUT_MAX_BYTES) {
    throw new LayoutValidationError(ROOT, `layout exceeds ${LAYOUT_MAX_BYTES} bytes`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    throw new LayoutValidationError(ROOT, `layout is not valid JSON: ${(e as Error).message}`, { cause: e });
  }
  if (!isObj(raw)) throw new LayoutValidationError(ROOT, "layout must be an object");
  if (!Number.isSafeInteger(raw.version) || (raw.version as number) < 0) {
    throw new LayoutValidationError("version", "must be an integer >= 0");
  }
  if (!LAYOUT_TEMPLATES.includes(raw.template as LayoutTemplate)) {
    throw new LayoutValidationError("template", `unknown template "${String(raw.template)}"`);
  }
  const template = raw.template as LayoutTemplate;
  if (!Array.isArray(raw.slots)) throw new LayoutValidationError("slots", "must be an array");
  if (raw.slots.length > LAYOUT_MAX_SLOTS) throw new LayoutValidationError("slots", `at most ${LAYOUT_MAX_SLOTS}`);
  const slots = raw.slots.map(parseSlot);
  const seen = new Set<string>();
  slots.forEach((s, i) => {
    const k = refKey(s.trackRef);
    if (seen.has(k)) throw new LayoutValidationError(`slots[${i}].trackRef`, "duplicate trackRef");
    seen.add(k);
  });
  if (typeof raw.updatedAt !== "number" || !Number.isFinite(raw.updatedAt)) {
    throw new LayoutValidationError("updatedAt", "must be a number (epoch ms)");
  }
  const state: LayoutState = {
    version: raw.version as number,
    template,
    slots,
    updatedBy: nonEmptyString(raw.updatedBy, "updatedBy"),
    updatedAt: raw.updatedAt,
  };
  if (template === "custom-grid") state.grid = parseGrid(raw.grid, slots);
  else if (raw.grid !== undefined) throw new LayoutValidationError("grid", `only allowed for custom-grid, not ${template}`);
  if (raw.panelSizes !== undefined) state.panelSizes = validatePanelSizes(raw.panelSizes, template, slots.length);
  return state;
}

/** Serialisasi layout; melempar bila melewati LAYOUT_MAX_BYTES. */
export function serializeLayout(state: LayoutState): string {
  const json = JSON.stringify(state);
  const bytes = byteLength(json);
  if (bytes > LAYOUT_MAX_BYTES) {
    throw new LayoutValidationError(ROOT, `layout is ${bytes} bytes, exceeds ${LAYOUT_MAX_BYTES}`);
  }
  return json;
}

/** Kunci unik trackRef (identity + trackName). */
export const refKey = (r: TrackRef) => `${r.identity}\u0000${r.trackName}`;
const sameRef = (a: TrackRef, b: TrackRef) => refKey(a) === refKey(b);

/**
 * Tukar trackRef slot i dan j (size ikut posisi slot). Di custom-grid, i/j tetap index `slots` (sel terisi)
 * dan kedua sel yang memuatnya bertukar isi; untuk index sel (termasuk sel kosong) pakai placeInCell.
 */
export function swapSlots(state: LayoutState, i: number, j: number, by: string): LayoutState {
  const n = state.slots.length;
  if (!Number.isInteger(i) || !Number.isInteger(j) || i < 0 || j < 0 || i >= n || j >= n) {
    throw new LayoutValidationError("slots", `swapSlots: index ${i},${j} outside 0..${n - 1}`);
  }
  const slots = state.slots.map((s) => ({ ...s }));
  const a = slots[i]!;
  const b = slots[j]!;
  [a.trackRef, b.trackRef] = [b.trackRef, a.trackRef];
  if (!state.grid) return touch(state, { slots }, by);
  // Sel terisi ke-k = slots[k]; isi ulang sel terisi dengan urutan slots yang sudah ditukar.
  let k = 0;
  const cells = state.grid.cells.map((c) => (c.trackRef ? { trackRef: slots[k++]!.trackRef } : { trackRef: null }));
  return touch(state, { slots, grid: { ...state.grid, cells } }, by);
}

/** Template focus: trackRef ke slot 0 ukuran large, sisanya small di strip. Dari custom-grid: grid & sel kosong dibuang. */
export function setFocus(state: LayoutState, trackRef: TrackRef, by: string): LayoutState {
  const rest = state.slots.filter((s) => !sameRef(s.trackRef, trackRef));
  if (rest.length === state.slots.length) {
    throw new LayoutValidationError("trackRef", `setFocus: track ${trackRef.identity}/${trackRef.trackName} is not in the layout`);
  }
  const slots: LayoutSlot[] = [
    { trackRef, size: "large" },
    ...rest.map((s) => ({ trackRef: s.trackRef, size: "small" as const })),
  ];
  // panelSizes focus (stage/strip) tetap berlaku bila sudah focus; dari template lain dibuang.
  return touch(state, { template: "focus", slots, grid: undefined, panelSizes: state.template === "focus" ? state.panelSizes : undefined }, by);
}

/**
 * Ganti template; panelSizes dibuang karena jumlah panel template lain berbeda (render pakai default).
 * Ke custom-grid: grid terkecil mendekati persegi memuat semua slot (sisa kosong, size dibuang).
 * Keluar dari custom-grid: grid dibuang, sel kosong hilang, slots = sel terisi berurutan.
 */
export function setTemplate(state: LayoutState, template: LayoutTemplate, by: string): LayoutState {
  if (!LAYOUT_TEMPLATES.includes(template)) {
    throw new LayoutValidationError("template", `unknown template "${String(template)}"`);
  }
  if (template === "custom-grid") {
    if (state.grid) return touch(state, {}, by);
    const n = state.slots.length;
    const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
    const rows = Math.max(1, Math.ceil(n / cols));
    const cells: GridCell[] = Array.from({ length: cols * rows }, (_, i) => ({ trackRef: state.slots[i]?.trackRef ?? null }));
    return touch(state, { template, slots: gridSlots(cells), grid: { cols, rows, cells }, panelSizes: undefined }, by);
  }
  return touch(state, { template, grid: undefined, panelSizes: undefined }, by);
}

/** Set ukuran panel (hasil resize); divalidasi terhadap template + jumlah slot saat ini. */
export function setPanelSizes(state: LayoutState, sizes: number[], by: string): LayoutState {
  return touch(state, { panelSizes: validatePanelSizes(sizes, state.template, state.slots.length) }, by);
}

/** State baru: version TIDAK diubah (dikelola server via CAS), updatedBy/updatedAt diisi. */
export function touch(state: LayoutState, patch: Partial<LayoutState>, by: string): LayoutState {
  const next: LayoutState = { ...state, ...patch, updatedBy: by, updatedAt: Date.now() };
  if (next.panelSizes === undefined) delete next.panelSizes;
  if (next.grid === undefined) delete next.grid;
  return next;
}
