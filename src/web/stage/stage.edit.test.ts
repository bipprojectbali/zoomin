import { describe, expect, test } from "bun:test";
import { LAYOUT_MAX_SLOTS, LayoutValidationError, parseLayout, serializeLayout, type LayoutState } from "../../shared/layout.model";
import { placeTrack } from "./stage.edit";

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
