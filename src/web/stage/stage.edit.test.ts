import { describe, expect, test } from "bun:test";
import { LAYOUT_MAX_SLOTS, LayoutValidationError, parseLayout, serializeLayout, type LayoutState } from "../../shared/layout.model";
import { canRemoveLast, cellOfSlot, placeTrack, removeSlot } from "./stage.edit";

// test-only
const ref = (identity: string, trackName = "camera") => ({ identity, trackName });
const layout = (n: number, patch: Partial<LayoutState> = {}): LayoutState => ({
  version: 3,
  template: "grid",
  slots: Array.from({ length: n }, (_, i) => ({ trackRef: ref(`u${i}`) })),
  updatedBy: "admin",
  updatedAt: 1,
  ...patch,
});
const names = (s: LayoutState) => s.slots.map((x) => x.trackRef.identity);

describe("placeTrack", () => {
  test("ganti isi slot; size slot dipertahankan; version tidak berubah", () => {
    const base = layout(3);
    base.slots[1]!.size = "large";
    const next = placeTrack(base, 1, ref("new"), "u9");
    expect(names(next)).toEqual(["u0", "new", "u2"]);
    expect(next.slots[1]!.size).toBe("large");
    expect(next.version).toBe(3);
    expect(next.updatedBy).toBe("u9");
    expect(names(base)).toEqual(["u0", "u1", "u2"]); // input tidak dimutasi
    expect(() => parseLayout(serializeLayout(next))).not.toThrow();
  });
  test("track yang sudah ada di layout dipindah (tukar), tidak duplikat", () => {
    expect(names(placeTrack(layout(3), 0, ref("u2"), "a"))).toEqual(["u2", "u1", "u0"]);
  });
  test("tambah slot di akhir; side-by-side membuang panelSizes lama", () => {
    const next = placeTrack(layout(2, { template: "side-by-side", panelSizes: [40, 60] }), null, ref("new"), "a");
    expect(names(next)).toEqual(["u0", "u1", "new"]);
    expect("panelSizes" in next).toBe(false);
    expect(() => parseLayout(serializeLayout(next))).not.toThrow();
  });
  test("tambah di focus mempertahankan panelSizes stage/strip", () => {
    const next = placeTrack(layout(2, { template: "focus", panelSizes: [70, 30] }), null, ref("new"), "a");
    expect(next.panelSizes).toEqual([70, 30]);
  });
  test("tambah track yang sudah ada → state sama", () => {
    const base = layout(2);
    expect(placeTrack(base, null, ref("u1"), "a")).toBe(base);
  });
  test(`batas ${LAYOUT_MAX_SLOTS} slot`, () => {
    expect(placeTrack(layout(LAYOUT_MAX_SLOTS - 1), null, ref("x"), "a").slots).toHaveLength(LAYOUT_MAX_SLOTS);
    expect(() => placeTrack(layout(LAYOUT_MAX_SLOTS), null, ref("x"), "a")).toThrow(LayoutValidationError);
  });
  test("index di luar rentang ditolak", () => {
    expect(() => placeTrack(layout(2), 2, ref("x"), "a")).toThrow(LayoutValidationError);
    expect(() => placeTrack(layout(2), -1, ref("x"), "a")).toThrow(LayoutValidationError);
  });
});

describe("removeSlot", () => {
  test("hapus slot index; input tidak dimutasi; hasil valid", () => {
    const base = layout(3);
    const next = removeSlot(base, 1, "u9");
    expect(names(next)).toEqual(["u0", "u2"]);
    expect(next.updatedBy).toBe("u9");
    expect(next.version).toBe(3);
    expect(names(base)).toEqual(["u0", "u1", "u2"]);
    expect(() => parseLayout(serializeLayout(next))).not.toThrow();
  });
  test("side-by-side membuang panelSizes; focus mempertahankan", () => {
    const sbs = removeSlot(layout(3, { template: "side-by-side", panelSizes: [30, 30, 40] }), 0, "a");
    expect("panelSizes" in sbs).toBe(false);
    expect(() => parseLayout(serializeLayout(sbs))).not.toThrow();
    expect(removeSlot(layout(3, { template: "focus", panelSizes: [70, 30] }), 2, "a").panelSizes).toEqual([70, 30]);
  });
  test("hapus slot terakhir → layout kosong valid", () => {
    expect(removeSlot(layout(1), 0, "a").slots).toEqual([]);
  });
  test("index di luar rentang ditolak", () => {
    expect(() => removeSlot(layout(2), 2, "a")).toThrow(LayoutValidationError);
    expect(() => removeSlot(layout(2), -1, "a")).toThrow(LayoutValidationError);
    expect(() => removeSlot(layout(2), 0.5, "a")).toThrow(LayoutValidationError);
  });
});

describe("custom-grid lewat layout.grid (S8)", () => {
  const grid = (cells: (string | null)[], cols: number): LayoutState => {
    const refs = cells.map((c) => (c ? ref(c) : null));
    return {
      version: 2,
      template: "custom-grid",
      slots: refs.flatMap((r) => (r ? [{ trackRef: r }] : [])),
      grid: { cols, rows: cells.length / cols, cells: refs.map((trackRef) => ({ trackRef })) },
      updatedBy: "admin",
      updatedAt: 1,
    };
  };
  const cells = (s: LayoutState) => s.grid!.cells.map((c) => c.trackRef?.identity ?? null);
  const valid = (s: LayoutState) => expect(() => parseLayout(serializeLayout(s))).not.toThrow();

  test("tambah (index null) → sel kosong pertama; penuh → tambah baris", () => {
    const next = placeTrack(grid(["a", null, "b", null], 2), null, ref("x"), "h");
    expect(cells(next)).toEqual(["a", "x", "b", null]);
    valid(next);
    const grown = placeTrack(grid(["a", "b"], 2), null, ref("x"), "h");
    expect(grown.grid!.rows).toBe(2);
    expect(cells(grown)).toEqual(["a", "b", "x", null]);
    valid(grown);
  });
  test("ganti slot index = sel slot itu; track yang sudah ada → state sama", () => {
    const base = grid([null, "a", "b", null], 2);
    expect(cells(placeTrack(base, 1, ref("x"), "h"))).toEqual([null, "a", "x", null]);
    expect(placeTrack(base, null, ref("a"), "h")).toBe(base);
  });
  test("removeSlot mengosongkan sel (grid tetap)", () => {
    const next = removeSlot(grid(["a", null, "b", "c"], 2), 1, "h");
    expect(cells(next)).toEqual(["a", null, null, "c"]);
    expect(next.slots.map((s) => s.trackRef.identity)).toEqual(["a", "c"]);
    valid(next);
  });
  test("canRemoveLast: hanya bila baris/kolom terakhir kosong dan >1", () => {
    const g = grid(["a", null, "b", null], 2);
    expect(canRemoveLast(g, "column")).toBe(true);
    expect(canRemoveLast(g, "row")).toBe(false);
    expect(canRemoveLast(grid([null], 1), "row")).toBe(false);
    expect(canRemoveLast(layout(2), "row")).toBe(false);
  });
  test("cellOfSlot di luar grid ditolak", () => {
    expect(cellOfSlot(grid([null, "a"], 2), 0)).toBe(1);
    expect(() => cellOfSlot(grid([null, "a"], 2), 1)).toThrow(LayoutValidationError);
  });
});
