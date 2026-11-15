import { describe, expect, test } from "bun:test";
import type { StageRequest } from "../../shared/api.types";
import { livePending, parseStageEvent, removeRequest, upsertRequest } from "./stage.request.queue";

// test-only
const req = (id: string, userId: string, patch: Partial<StageRequest> = {}): StageRequest => ({
  id, roomId: "r", userId, userName: userId, trackName: "screen-1", action: "show", status: "pending", createdAt: 0, expiresAt: 100, ...patch,
});
const bytes = (v: unknown) => new TextEncoder().encode(typeof v === "string" ? v : JSON.stringify(v));

describe("parseStageEvent", () => {
  test("event valid diterima", () => {
    const ev = { type: "request.created", request: req("1", "u") };
    expect(parseStageEvent(bytes(ev))).toEqual(ev as never);
  });
  test("bukan JSON / bentuk salah → null", () => {
    expect(parseStageEvent(bytes("{oops"))).toBeNull();
    expect(parseStageEvent(bytes(null))).toBeNull();
    expect(parseStageEvent(bytes({ type: "x", request: req("1", "u") }))).toBeNull();
    expect(parseStageEvent(bytes({ type: "request.created" }))).toBeNull();
    expect(parseStageEvent(bytes({ type: "request.created", request: { ...req("1", "u"), status: "weird" } }))).toBeNull();
    expect(parseStageEvent(bytes({ type: "request.created", request: { ...req("1", "u"), userId: 5 } }))).toBeNull();
  });
});

describe("antrean", () => {
  test("request baru user yang sama menggantikan yang lama", () => {
    const items = upsertRequest([req("1", "a"), req("2", "b")], req("3", "a"));
    expect(items.map((x) => x.id)).toEqual(["2", "3"]);
  });
  test("hapus per id & buang yang kedaluwarsa", () => {
    expect(removeRequest([req("1", "a"), req("2", "b")], "1").map((x) => x.id)).toEqual(["2"]);
    const items = [req("1", "a", { expiresAt: 50 }), req("2", "b", { expiresAt: 150 }), req("3", "c", { status: "denied", expiresAt: 150 })];
    expect(livePending(items, 100).map((x) => x.id)).toEqual(["2"]);
  });
});
