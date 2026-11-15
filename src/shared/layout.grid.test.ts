import { describe, expect, test } from "bun:test";
import { addColumn, addRow, clearCell, placeInCell, removeColumn, removeRow, toCustomGrid } from "./layout.grid";
import {
  LAYOUT_MAX_SLOTS,
  LayoutValidationError,
  type LayoutState,
  parseLayout,
  serializeLayout,
  setFocus,
  setPanelSizes,
  setTemplate,
  swapSlots,
  type TrackRef,
} from "./layout.model";

const ref = (identity: string, trackName = "screen-1"): TrackRef => ({ identity, trackName });
const base: LayoutState = {
  version: 3,
  template: "grid",
  slots: [{ trackRef: ref("a") }, { trackRef: ref("b"), size: "large" }, { trackRef: ref("c") }],
  updatedBy: "host",
  updatedAt: 1_700_000_000_000,
};
const grid = toCustomGrid(base, "host"); // 2x2: a b / c _
const names = (s: LayoutState) => s.grid!.cells.map((c) => c.trackRef?.identity ?? "_").join("");
const json = (s: LayoutState, patch: Record<string, unknown>) => JSON.stringify({ ...s, ...patch });

function pathOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof LayoutValidationError) return e.path;
    throw e;
  }
  throw new Error("did not throw");
}

describe("toCustomGrid / setTemplate", () => {
  test("smallest near-square grid, rest empty, sizes dropped, version kept", () => {
    expect(grid.template).toBe("custom-grid");
    expect(grid.grid).toMatchObject({ cols: 2, rows: 2 });
    expect(names(grid)).toBe("abc_");
    expect(grid.slots).toEqual([{ trackRef: ref("a") }, { trackRef: ref("b") }, { trackRef: ref("c") }]);
    expect(grid.version).toBe(3);
    expect(base.template).toBe("grid");
  });

  test("dimensions for various counts", () => {
    const dims = (n: number) => {
      const s = toCustomGrid({ ...base, slots: Array.from({ length: n }, (_, i) => ({ trackRef: ref(`u${i}`) })) }, "h");
      return `${s.grid!.cols}x${s.grid!.rows}`;
    };
    expect([0, 1, 2, 5, 7, 10, 49].map(dims)).toEqual(["1x1", "1x1", "2x1", "3x2", "3x3", "4x3", "7x7"]);
  });

  test("panelSizes dropped when entering; already custom-grid keeps cells", () => {
    const g = toCustomGrid({ ...base, template: "side-by-side", panelSizes: [50, 25, 25] }, "h");
    expect("panelSizes" in g).toBe(false);
    const again = toCustomGrid(clearCell(grid, 0, "h"), "h");
    expect(names(again)).toBe("_bc_");
  });

  test("leaving custom-grid drops grid and empty cells", () => {
    const sparse = placeInCell(clearCell(grid, 0, "h"), 3, ref("a"), "h"); // _ b / c a
    const out = setTemplate(sparse, "side-by-side", "h");
    expect("grid" in out).toBe(false);
    expect(out.slots.map((s) => s.trackRef.identity)).toEqual(["b", "c", "a"]);
    expect(parseLayout(serializeLayout(out))).toEqual(out);
  });

  test("setFocus from custom-grid leaves grid", () => {
    const f = setFocus(grid, ref("c"), "h");
    expect(f.template).toBe("focus");
    expect("grid" in f).toBe(false);
    expect(f.slots.map((s) => s.trackRef.identity)).toEqual(["c", "a", "b"]);
  });
});

describe("parseLayout custom-grid", () => {
  test("roundtrip with empty cells", () => {
    expect(parseLayout(serializeLayout(grid))).toEqual(grid);
  });

  test("7x7 max roundtrip, 8 rows rejected", () => {
    const cells = Array.from({ length: LAYOUT_MAX_SLOTS }, (_, i) => ({ trackRef: i % 2 ? ref(`u${i}`) : null }));
    const s: LayoutState = { ...grid, slots: cells.flatMap((c) => (c.trackRef ? [{ trackRef: c.trackRef }] : [])), grid: { cols: 7, rows: 7, cells } };
    expect(parseLayout(serializeLayout(s))).toEqual(s);
    expect(pathOf(() => parseLayout(json(grid, { grid: { cols: 1, rows: 8, cells: [] } })))).toBe("grid.rows");
  });

  test("invalid grid shapes rejected with path", () => {
    const g = grid.grid!;
    expect(pathOf(() => parseLayout(json(grid, { grid: undefined })))).toBe("grid");
    expect(pathOf(() => parseLayout(json(grid, { grid: { ...g, cols: 0 } })))).toBe("grid.cols");
    expect(pathOf(() => parseLayout(json(grid, { grid: { ...g, cols: 1.5 } })))).toBe("grid.cols");
    expect(pathOf(() => parseLayout(json(grid, { grid: { ...g, cells: g.cells.slice(1) } })))).toBe("grid.cells");
    expect(pathOf(() => parseLayout(json(grid, { grid: { ...g, cells: [...g.cells.slice(0, 3), 5] } })))).toBe("grid.cells[3]");
    expect(pathOf(() => parseLayout(json(grid, { grid: { ...g, cells: [...g.cells.slice(0, 3), { trackRef: { identity: "" } }] } })))).toBe(
      "grid.cells[3].trackRef.identity",
    );
  });

  test("duplicate trackRef across cells rejected", () => {
    const cells = [{ trackRef: ref("a") }, { trackRef: ref("b") }, { trackRef: ref("c") }, { trackRef: ref("a") }];
    expect(pathOf(() => parseLayout(json(grid, { grid: { cols: 2, rows: 2, cells } })))).toBe("grid.cells[3].trackRef");
  });

  test("slots out of sync with cells, sized slots, panelSizes, grid on other template rejected", () => {
    expect(pathOf(() => parseLayout(json(grid, { slots: [...grid.slots].reverse() })))).toBe("slots");
    expect(pathOf(() => parseLayout(json(grid, { slots: grid.slots.slice(1) })))).toBe("slots");
    expect(pathOf(() => parseLayout(json(grid, { slots: [{ ...grid.slots[0], size: "large" }, ...grid.slots.slice(1)] })))).toBe("slots");
    expect(pathOf(() => parseLayout(json(grid, { panelSizes: [50, 50] })))).toBe("panelSizes");
    expect(pathOf(() => parseLayout(json(base, { grid: grid.grid })))).toBe("grid");
    expect(pathOf(() => setPanelSizes(grid, [50, 50], "h"))).toBe("panelSizes");
  });

  test("null trackRef in regular slots still rejected", () => {
    expect(pathOf(() => parseLayout(json(base, { slots: [{ trackRef: null }] })))).toBe("slots[0].trackRef");
  });
});

describe("cell ops", () => {
  test("placeInCell new track into empty cell", () => {
    const s = placeInCell(grid, 3, ref("d"), "h2");
    expect(names(s)).toBe("abcd");
    expect(s.slots.map((x) => x.trackRef.identity)).toEqual(["a", "b", "c", "d"]);
    expect(s.updatedBy).toBe("h2");
    expect(names(grid)).toBe("abc_");
  });

  test("placeInCell moves an existing track (empty target)", () => {
    expect(names(placeInCell(grid, 3, ref("a"), "h"))).toBe("_bca");
  });

  test("placeInCell moves existing track onto occupied cell: occupant goes to source", () => {
    expect(names(placeInCell(grid, 2, ref("a"), "h"))).toBe("cba_");
  });

  test("placeInCell new track on occupied cell replaces occupant", () => {
    const s = placeInCell(grid, 0, ref("d"), "h");
    expect(names(s)).toBe("dbc_");
    expect(s.slots).toHaveLength(3);
  });

  test("placeInCell same cell is a no-op on cells", () => {
    expect(names(placeInCell(grid, 1, ref("b"), "h"))).toBe("abc_");
  });

  test("clearCell empties; bad index and wrong template rejected", () => {
    const s = clearCell(grid, 1, "h");
    expect(names(s)).toBe("a_c_");
    expect(s.slots.map((x) => x.trackRef.identity)).toEqual(["a", "c"]);
    expect(pathOf(() => clearCell(grid, 4, "h"))).toBe("grid.cells");
    expect(pathOf(() => placeInCell(grid, -1, ref("x"), "h"))).toBe("grid.cells");
    expect(pathOf(() => clearCell(base, 0, "h"))).toBe("template");
    expect(pathOf(() => addRow(base, "h"))).toBe("template");
  });

  test("swapSlots in custom-grid swaps the cells holding those slots", () => {
    const s = swapSlots(clearCell(grid, 1, "h"), 0, 1, "h"); // a _ / c _ -> c _ / a _
    expect(names(s)).toBe("c_a_");
    expect(parseLayout(serializeLayout(s))).toEqual(s);
  });
});

describe("row/column ops", () => {
  test("addRow / addColumn keep positions", () => {
    expect(names(addRow(grid, "h"))).toBe("abc___");
    const c = addColumn(grid, "h");
    expect(c.grid).toMatchObject({ cols: 3, rows: 2 });
    expect(names(c)).toBe("ab_c__");
    expect(parseLayout(serializeLayout(c))).toEqual(c);
  });

  test("cannot grow beyond 7", () => {
    let s = toCustomGrid({ ...base, slots: [] }, "h");
    for (let i = 0; i < 6; i++) s = addColumn(addRow(s, "h"), "h");
    expect(s.grid).toMatchObject({ cols: 7, rows: 7 });
    expect(s.grid!.cells).toHaveLength(LAYOUT_MAX_SLOTS);
    expect(pathOf(() => addRow(s, "h"))).toBe("grid");
    expect(pathOf(() => addColumn(s, "h"))).toBe("grid");
  });

  test("removeRow / removeColumn only when empty", () => {
    expect(names(removeRow(addRow(grid, "h"), 2, "h"))).toBe("abc_");
    expect(pathOf(() => removeRow(grid, 1, "h"))).toBe("grid.cells[2]");
    expect(pathOf(() => removeColumn(grid, 1, "h"))).toBe("grid.cells[1]");
    const s = removeColumn(clearCell(grid, 1, "h"), 1, "h"); // a / c
    expect(s.grid).toMatchObject({ cols: 1, rows: 2 });
    expect(names(s)).toBe("ac");
    expect(parseLayout(serializeLayout(s))).toEqual(s);
  });

  test("remove middle column/row shifts remaining cells", () => {
    const s = placeInCell(addColumn(grid, "h"), 2, ref("d"), "h"); // a b d / c _ _
    expect(names(removeColumn(clearCell(s, 1, "h"), 1, "h"))).toBe("adc_");
    const r = placeInCell(addRow(grid, "h"), 4, ref("d"), "h"); // a b / c _ / d _
    expect(names(removeRow(clearCell(r, 2, "h"), 1, "h"))).toBe("abd_");
  });

  test("last row/column and bad index rejected", () => {
    const one = toCustomGrid({ ...base, slots: [] }, "h");
    expect(pathOf(() => removeRow(one, 0, "h"))).toBe("grid.rows");
    expect(pathOf(() => removeColumn(one, 0, "h"))).toBe("grid.cols");
    expect(pathOf(() => removeRow(grid, 2, "h"))).toBe("grid.rows");
    expect(pathOf(() => removeColumn(grid, -1, "h"))).toBe("grid.cols");
  });
});
