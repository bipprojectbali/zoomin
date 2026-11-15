import { describe, expect, test } from "bun:test";
import { LAYOUT_MAX_BYTES, type LayoutState, LayoutValidationError } from "./layout.model";
import { parseRoomStage, serializeRoomStage } from "./stage.model";

const layout: LayoutState = {
  version: 3,
  template: "grid",
  slots: [{ trackRef: { identity: "alice", trackName: "screen-1" } }],
  updatedBy: "u1",
  updatedAt: 1,
};

describe("stage.model", () => {
  test("round-trip envelope untuk tiap mode, dengan dan tanpa layout", () => {
    for (const stageMode of ["host", "request", "open"] as const) {
      expect(parseRoomStage(serializeRoomStage({ stageMode, layout }))).toEqual({ stageMode, layout });
      expect(parseRoomStage(serializeRoomStage({ stageMode, layout: null }))).toEqual({ stageMode, layout: null });
    }
  });

  test("kosong/null/undefined → host tanpa layout", () => {
    for (const v of ["", null, undefined]) expect(parseRoomStage(v)).toEqual({ stageMode: "host", layout: null });
  });

  test("metadata lama (LayoutState mentah) → host + layout", () => {
    expect(parseRoomStage(JSON.stringify(layout))).toEqual({ stageMode: "host", layout });
  });

  test("rusak: JSON invalid, bukan objek, mode asing, layout invalid, terlalu besar", () => {
    const bad = [
      "{",
      "[]",
      '"x"',
      JSON.stringify({ stageMode: "chaos", layout: null }),
      JSON.stringify({ layout: null }),
      JSON.stringify({ stageMode: "open", layout: { ...layout, template: "nope" } }),
      JSON.stringify({ stageMode: "open", pad: "x".repeat(LAYOUT_MAX_BYTES + 100) }),
    ];
    for (const json of bad) expect(() => parseRoomStage(json)).toThrow(LayoutValidationError);
  });

  test("serialize menolak layout lewat batas", () => {
    const huge = { ...layout, updatedBy: "x".repeat(LAYOUT_MAX_BYTES) };
    expect(() => serializeRoomStage({ stageMode: "host", layout: huge })).toThrow(LayoutValidationError);
  });
});
