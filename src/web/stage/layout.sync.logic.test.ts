import { describe, expect, test } from "bun:test";
import type { LayoutState } from "../../shared/layout.model";
import { ApiRequestError } from "../api.client";
import { baseVersionOf, isConflict, layoutFromMetadata, layoutFromResponse, pickNewer } from "./layout.sync.logic";

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

describe("layoutFromMetadata", () => {
  test("metadata kosong → null tanpa error", () => {
    expect(layoutFromMetadata("")).toEqual({ layout: null, error: null });
    expect(layoutFromMetadata(undefined)).toEqual({ layout: null, error: null });
  });
  test("JSON valid di-parse", () => {
    const r = layoutFromMetadata(JSON.stringify(state(4)));
    expect(r.error).toBeNull();
    expect(r.layout?.version).toBe(4);
  });
  test("invalid → null + error ber-cause", () => {
    const r = layoutFromMetadata(JSON.stringify({ ...state(1), template: "carousel" }));
    expect(r.layout).toBeNull();
    expect(r.error?.message).toContain("layoutFromMetadata");
    expect(r.error?.cause).toBeInstanceOf(Error);
  });
});

describe("layoutFromResponse & isConflict", () => {
  test("version server menimpa version di dalam layout", () => {
    expect(layoutFromResponse({ version: 9, layout: state(1) })?.version).toBe(9);
    expect(layoutFromResponse({ version: 0, layout: null })).toBeNull();
  });
  test("hanya ApiRequestError 409 yang konflik", () => {
    expect(isConflict(new ApiRequestError(409, { error: "conflict" }, "PUT x"))).toBe(true);
    expect(isConflict(new ApiRequestError(403, { error: "forbidden" }, "PUT x"))).toBe(false);
    expect(isConflict(new Error("x"))).toBe(false);
  });
});
