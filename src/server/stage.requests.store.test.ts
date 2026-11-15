import { describe, expect, test } from "bun:test";
import { STAGE_REQUEST_TTL_MS, type StageRequest } from "../shared/api.types";
import { createStageRequestStore } from "./stage.requests.store";

const input = { roomId: "r1", userId: "u1", userName: "U1", trackName: "screen-1", action: "show" as const };

function setup() {
  let t = 1_000;
  const resolved: StageRequest[] = [];
  const store = createStageRequestStore({ onResolved: (r) => resolved.push(r), now: () => t });
  return { store, resolved, advance: (ms: number) => (t += ms) };
}

describe("stage.requests.store", () => {
  test("add: pending dengan expiresAt = createdAt + TTL; request baru user sama menggantikan yang lama (canceled)", () => {
    const { store, resolved } = setup();
    const a = store.add(input);
    expect(a).toMatchObject({ ...input, status: "pending", createdAt: 1_000, expiresAt: 1_000 + STAGE_REQUEST_TTL_MS });
    const other = store.add({ ...input, userId: "u2" });
    const b = store.add({ ...input, action: "focus" });
    expect(resolved).toEqual([{ ...a, status: "canceled" }]);
    expect(store.pending("r1").map((r) => r.id)).toEqual([other.id, b.id]);
  });

  test("kedaluwarsa dibuang lazy saat akses dan dilaporkan expired", () => {
    const { store, resolved, advance } = setup();
    const a = store.add(input);
    advance(STAGE_REQUEST_TTL_MS - 1);
    expect(store.get("r1", a.id)).toBeDefined();
    advance(1);
    expect(store.pending("r1")).toEqual([]);
    expect(resolved).toEqual([{ ...a, status: "expired" }]);
    expect(store.resolve("r1", a.id, "approved")).toBeUndefined();
  });

  test("resolve: sekali saja; room lain tidak tersentuh", () => {
    const { store, resolved } = setup();
    const a = store.add(input);
    expect(store.resolve("r2", a.id, "denied")).toBeUndefined();
    expect(store.resolve("r1", a.id, "denied")).toMatchObject({ id: a.id, status: "denied" });
    expect(store.resolve("r1", a.id, "denied")).toBeUndefined();
    expect(resolved.map((r) => r.status)).toEqual(["denied"]);
  });
});
