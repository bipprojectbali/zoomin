import { describe, expect, test } from "bun:test";
import type { LayoutState } from "../../shared/layout.model";
import { ApiRequestError } from "../api.client";
import { baseVersionOf, isConflict, layoutFromResponse, stageFromMetadata, pickNewer } from "./layout.sync.logic";

// test-only
const state = (version: number, template: LayoutState["template"] = "grid"): LayoutState => ({
  version,
  template,
  slots: [{ trackRef: { identity: "u1", trackName: "camera" } }],
  updatedBy: "admin",
  updatedAt: 1,
});

describe("pickNewer", () => {
  test("state pertama diterima", () => {
    const s = state(1);
    expect(pickNewer(null, s)).toBe(s);
  });
  test("version lebih kecil diabaikan (publish tiba tidak berurutan)", () => {
    const cur = state(5);
    expect(pickNewer(cur, state(3, "focus"))).toBe(cur);
  });
  test("version sama diabaikan, version lebih besar menang", () => {
    const cur = state(5);
    expect(pickNewer(cur, state(5, "focus"))).toBe(cur);
    const next = state(6, "focus");
    expect(pickNewer(cur, next)).toBe(next);
  });
  test("incoming null mempertahankan state", () => {
    const cur = state(2);
    expect(pickNewer(cur, null)).toBe(cur);
    expect(pickNewer(null, null)).toBeNull();
  });
});

describe("baseVersionOf", () => {
  test("null → 0, selain itu version state", () => {
    expect(baseVersionOf(null)).toBe(0);
    expect(baseVersionOf(state(7))).toBe(7);
  });
});

describe("stageFromMetadata", () => {
  test("metadata kosong → layout null, mode host, tanpa error", () => {
    expect(stageFromMetadata("")).toEqual({ layout: null, stageMode: "host", error: null });
    expect(stageFromMetadata(undefined)).toEqual({ layout: null, stageMode: "host", error: null });
  });
  test("envelope di-parse: mode berubah walau layout null", () => {
    const r = stageFromMetadata(JSON.stringify({ stageMode: "open", layout: null }));
    expect(r).toEqual({ layout: null, stageMode: "open", error: null });
    const withLayout = stageFromMetadata(JSON.stringify({ stageMode: "request", layout: state(4) }));
    expect(withLayout.stageMode).toBe("request");
    expect(withLayout.layout?.version).toBe(4);
  });
  test("metadata lama (LayoutState mentah) → mode host", () => {
    const r = stageFromMetadata(JSON.stringify(state(4)));
    expect(r.error).toBeNull();
    expect(r.stageMode).toBe("host");
    expect(r.layout?.version).toBe(4);
  });
  test("invalid → layout & mode null + error ber-cause", () => {
    for (const bad of [JSON.stringify({ ...state(1), template: "carousel" }), JSON.stringify({ stageMode: "x", layout: null })]) {
      const r = stageFromMetadata(bad);
      expect(r.layout).toBeNull();
      expect(r.stageMode).toBeNull();
      expect(r.error?.message).toContain("stageFromMetadata");
      expect(r.error?.cause).toBeInstanceOf(Error);
    }
  });
});

describe("layoutFromResponse & isConflict", () => {
  test("version server menimpa version di dalam layout", () => {
    expect(layoutFromResponse({ version: 9, layout: state(1), stageMode: "host" })?.version).toBe(9);
    expect(layoutFromResponse({ version: 0, layout: null, stageMode: "host" })).toBeNull();
  });
  test("hanya ApiRequestError 409 yang konflik", () => {
    expect(isConflict(new ApiRequestError(409, { error: "conflict" }, "PUT x"))).toBe(true);
    expect(isConflict(new ApiRequestError(403, { error: "forbidden" }, "PUT x"))).toBe(false);
    expect(isConflict(new Error("x"))).toBe(false);
  });
});
