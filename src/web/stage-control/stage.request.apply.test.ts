import { describe, expect, test } from "bun:test";
import { setTemplate, type LayoutState } from "../../shared/layout.model";
import { sharedEffectiveLayout, splitStage } from "../stage/stage.split";
import { applyStageRequest } from "./stage.request.apply";

// test-only
const base = (refs: string[]): LayoutState => ({
  version: 3,
  template: "grid",
  slots: refs.map((identity) => ({ trackRef: { identity, trackName: "screen-1" } })),
  updatedBy: "host",
  updatedAt: 1,
});
const names = (s: LayoutState) => s.slots.map((x) => x.trackRef.identity);

describe("applyStageRequest", () => {
  test("show menaruh track baru di akhir", () => {
    const next = applyStageRequest(base(["a"]), { userId: "u", trackName: "screen-1", action: "show" }, "host");
    expect(names(next)).toEqual(["a", "u"]);
    expect(next.version).toBe(3);
  });
  test("show untuk track yang sudah tampil tidak mengubah layout", () => {
    const s = base(["a", "u"]);
    expect(applyStageRequest(s, { userId: "u", trackName: "screen-1", action: "show" }, "host")).toBe(s);
  });
  test("focus menaruh lalu memfokuskan", () => {
    const next = applyStageRequest(base(["a"]), { userId: "u", trackName: "screen-1", action: "focus" }, "host");
    expect(next.template).toBe("focus");
    expect(names(next)).toEqual(["u", "a"]);
    expect(next.slots[0]?.size).toBe("large");
  });
  test("custom-grid: sel kosong pertama dipakai", () => {
    const grid = setTemplate(base(["a", "b", "c"]), "custom-grid", "host"); // 2x2, sel 3 kosong
    const next = applyStageRequest(grid, { userId: "u", trackName: "screen-1", action: "show" }, "host");
    expect(next.grid?.cells[3]?.trackRef?.identity).toBe("u");
    expect(next.grid?.rows).toBe(2);
  });
  test("custom-grid penuh: tambah baris", () => {
    const grid = setTemplate(base(["a", "b", "c", "d"]), "custom-grid", "host"); // 2x2 penuh
    const next = applyStageRequest(grid, { userId: "u", trackName: "screen-1", action: "show" }, "host");
    expect(next.grid?.rows).toBe(3);
    expect(next.grid?.cells[4]?.trackRef?.identity).toBe("u");
    expect(names(next)).toEqual(["a", "b", "c", "d", "u"]);
  });
});

describe("paritas layout dasar approve dengan Stage", () => {
  // test-only
  const track = (identity: string, trackName: string, source: string) => ({ participant: { identity }, publication: { trackName }, source });
  const tracks = [track("a", "camera", "camera"), track("b", "screen-1", "screen_share"), track("c", "camera", "camera")];
  const avatars = [{ identity: "d", trackName: "camera" }];

  test("tanpa layout bersama: dasar approve = effective yang dirender Stage", () => {
    expect(sharedEffectiveLayout(null, tracks, avatars)).toEqual(splitStage(null, tracks, avatars).effective);
    const next = applyStageRequest(sharedEffectiveLayout(null, tracks, avatars), { userId: "c", trackName: "screen-1", action: "show" }, "host");
    expect(names(next)).toEqual(["b", "c"]);
  });
  test("tanpa layar: dasar tetap sama dengan Stage (kamera + avatar)", () => {
    const cams = tracks.filter((t) => t.source === "camera");
    expect(sharedEffectiveLayout(null, cams, avatars)).toEqual(splitStage(null, cams, avatars).effective);
  });
  test("ada layout bersama: dipakai apa adanya", () => {
    const shared = base(["x"]);
    expect(sharedEffectiveLayout(shared, tracks, avatars)).toBe(shared);
    expect(splitStage(shared, tracks, avatars).effective).toBe(shared);
  });
});
