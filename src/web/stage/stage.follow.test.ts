import { describe, expect, test } from "bun:test";
import { setFocus, type LayoutState } from "../../shared/layout.model";
import { editLocal, hostChanged, sharedVersion } from "./stage.follow";

// test-only
const shared: LayoutState = {
  version: 7,
  template: "grid",
  slots: [{ trackRef: { identity: "a", trackName: "screen-1" } }, { trackRef: { identity: "b", trackName: "screen-1" } }],
  updatedBy: "h",
  updatedAt: 1,
};

describe("Follow host (S12)", () => {
  test("edit pertama membuat salinan lokal dari layout bersama; edit berikut di atas salinan", () => {
    const first = editLocal(null, shared, 7, (s) => setFocus(s, { identity: "b", trackName: "screen-1" }, "v"));
    expect(first!.local.template).toBe("focus");
    expect(first!.baseVersion).toBe(7);
    expect(shared.template).toBe("grid"); // layout bersama tidak dimutasi
    const second = editLocal(first, { ...shared, version: 8 }, 8, (s) => ({ ...s, updatedBy: "v2" }));
    expect(second!.local.template).toBe("focus");
    expect(second!.baseVersion).toBe(7);
  });
  test("edit no-op tidak keluar dari mode follow", () => {
    expect(editLocal(null, shared, 7, (s) => s)).toBeNull();
  });
  test("hostChanged saat version bersama berubah; otomatis = -1", () => {
    const st = editLocal(null, shared, 7, (s) => ({ ...s }));
    expect(hostChanged(st, 7)).toBe(false);
    expect(hostChanged(st, 8)).toBe(true);
    expect(hostChanged(null, 8)).toBe(false);
    expect(sharedVersion(null)).toBe(-1);
    expect(sharedVersion(shared)).toBe(7);
  });
});
