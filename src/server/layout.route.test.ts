import { describe, expect, test } from "bun:test";
import type { RoomServiceClient } from "livekit-server-sdk";
import { createTestDeps, createTestUser } from "../../test/auth.helpers";
import type { LayoutState } from "../shared/layout.model";
import { createApi } from "./api";

type Alias = "admin" | "ra" | "p" | "out";

/** admin = admin global (bukan member); ra = host room; p = participant; out = bukan member. */
async function setup() {
  const deps = createTestDeps();
  const { db } = deps;
  const users = {
    admin: await createTestUser(deps, { email: "admin@example.test", role: "admin" }),
    ra: await createTestUser(deps, { email: "ra@example.test" }),
    p: await createTestUser(deps, { email: "p@example.test" }),
    out: await createTestUser(deps, { email: "out@example.test" }),
  };
  db.run("INSERT INTO rooms (id, title, created_by, created_at) VALUES ('r1', 'R1', ?, 1)", [users.admin.user.id]);
  db.run("INSERT INTO room_members (room_id, user_id, role) VALUES ('r1', ?, 'host'), ('r1', ?, 'participant')", [users.ra.user.id, users.p.user.id]);
  // test-only: roomService palsu; publish metadata cukup dicatat.
  const published: string[] = [];
  const roomService = {
    updateRoomMetadata: async (_room: string, md: string) => published.push(md),
  } as unknown as RoomServiceClient;
  const app = createApi({ ...deps, roomService });
  const call = (method: string, who: Alias | null, room = "r1", body?: unknown) => {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (who) headers.cookie = users[who].cookie;
    return app.handle(
      new Request(`http://localhost/api/rooms/${room}/layout`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
  };
  return { call, published, users };
}

const layout: LayoutState = {
  version: 0,
  template: "grid",
  slots: [{ trackRef: { identity: "p", trackName: "camera" } }],
  updatedBy: "ra",
  updatedAt: 1,
};

describe("layout.route", () => {
  test("401 tanpa sesi (GET & PUT)", async () => {
    const { call } = await setup();
    expect((await call("GET", null)).status).toBe(401);
    expect((await call("PUT", null, "r1", { baseVersion: 0, layout })).status).toBe(401);
  });

  test("404 room tidak ada", async () => {
    const { call } = await setup();
    expect((await call("GET", "ra", "nope")).status).toBe(404);
    expect((await call("PUT", "admin", "nope", { baseVersion: 0, layout })).status).toBe(404);
  });

  test("403: bukan member GET; participant PUT", async () => {
    const { call } = await setup();
    expect((await call("GET", "out")).status).toBe(403);
    const res = await call("PUT", "p", "r1", { baseVersion: 0, layout });
    expect(res.status).toBe(403);
  });

  test("participant boleh GET layout", async () => {
    const { call } = await setup();
    const res = await call("GET", "p");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ version: 0, layout: null });
  });

  test("400 layout invalid dengan path field", async () => {
    const { call } = await setup();
    const bad = { ...layout, slots: [{ trackRef: { identity: "", trackName: "camera" } }] };
    const res = await call("PUT", "ra", "r1", { baseVersion: 0, layout: bad });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ path: "slots[0].trackRef.identity" });
  });

  test("400 body tanpa baseVersion / tanpa layout", async () => {
    const { call } = await setup();
    expect((await call("PUT", "ra", "r1", { layout })).status).toBe(400);
    const res = await call("PUT", "ra", "r1", { baseVersion: 0 });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ path: "$" });
  });

  test("200 host room lalu 409 baseVersion usang; GET mengembalikan versi terbaru", async () => {
    const { call, published, users } = await setup();
    const ok = await call("PUT", "ra", "r1", { baseVersion: 0, layout });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ version: 1 });
    expect(published).toHaveLength(1);

    const stale = await call("PUT", "ra", "r1", { baseVersion: 0, layout: { ...layout, template: "focus" } });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toEqual({ error: "layout conflict", code: "layout_conflict", currentVersion: 1 });

    // admin global (bukan member) boleh menulis
    const ok2 = await call("PUT", "admin", "r1", { baseVersion: 1, layout: { ...layout, template: "focus" } });
    expect(await ok2.json()).toEqual({ version: 2 });

    const got = await call("GET", "p");
    expect(got.status).toBe(200);
    const body = (await got.json()) as { version: number; layout: LayoutState };
    expect(body.version).toBe(2);
    expect(body.layout).toMatchObject({ version: 2, template: "focus", updatedBy: users.admin.user.id });
  });
});
