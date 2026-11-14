import { describe, expect, test } from "bun:test";
import type { RoomServiceClient } from "livekit-server-sdk";
import type { LayoutState } from "../shared/layout.model";
import { createApi } from "./api";
import { createSessionCookie } from "./auth.session";
import { loadConfig } from "./config";
import { openDb } from "./db";

const config = loadConfig({}); // test-only: dev default

function setup() {
  const db = openDb(":memory:");
  db.run(
    `INSERT INTO users (id, name, is_admin, created_at) VALUES
      ('admin', 'Admin', 1, 1), ('ra', 'RoomAdmin', 0, 1), ('p', 'Part', 0, 1), ('out', 'Outsider', 0, 1)`,
  );
  db.run("INSERT INTO rooms (id, title, created_by, created_at) VALUES ('r1', 'R1', 'admin', 1)");
  db.run("INSERT INTO room_members (room_id, user_id, role) VALUES ('r1', 'ra', 'admin'), ('r1', 'p', 'participant')");
  // test-only: roomService palsu; publish metadata cukup dicatat.
  const published: string[] = [];
  const roomService = {
    updateRoomMetadata: async (_room: string, md: string) => published.push(md),
  } as unknown as RoomServiceClient;
  const app = createApi({ db, config, roomService });
  return { app, published };
}

const cookieFor = (uid: string) => createSessionCookie(uid, config.sessionSecret, 3600, false).split(";")[0]!;

function call(app: ReturnType<typeof setup>["app"], method: string, uid: string | null, room = "r1", body?: unknown) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (uid) headers.cookie = cookieFor(uid);
  return app.handle(
    new Request(`http://localhost/api/rooms/${room}/layout`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
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
    const { app } = setup();
    expect((await call(app, "GET", null)).status).toBe(401);
    expect((await call(app, "PUT", null, "r1", { baseVersion: 0, layout })).status).toBe(401);
  });

  test("404 room tidak ada", async () => {
    const { app } = setup();
    expect((await call(app, "GET", "ra", "nope")).status).toBe(404);
    expect((await call(app, "PUT", "admin", "nope", { baseVersion: 0, layout })).status).toBe(404);
  });

  test("403: bukan member GET; participant PUT", async () => {
    const { app } = setup();
    expect((await call(app, "GET", "out")).status).toBe(403);
    const res = await call(app, "PUT", "p", "r1", { baseVersion: 0, layout });
    expect(res.status).toBe(403);
  });

  test("participant boleh GET layout", async () => {
    const { app } = setup();
    const res = await call(app, "GET", "p");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ version: 0, layout: null });
  });

  test("400 layout invalid dengan path field", async () => {
    const { app } = setup();
    const bad = { ...layout, slots: [{ trackRef: { identity: "", trackName: "camera" } }] };
    const res = await call(app, "PUT", "ra", "r1", { baseVersion: 0, layout: bad });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ path: "slots[0].trackRef.identity" });
  });

  test("400 body tanpa baseVersion / tanpa layout", async () => {
    const { app } = setup();
    expect((await call(app, "PUT", "ra", "r1", { layout })).status).toBe(400);
    const res = await call(app, "PUT", "ra", "r1", { baseVersion: 0 });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ path: "$" });
  });

  test("200 admin room lalu 409 baseVersion usang; GET mengembalikan versi terbaru", async () => {
    const { app, published } = setup();
    const ok = await call(app, "PUT", "ra", "r1", { baseVersion: 0, layout });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ version: 1 });
    expect(published).toHaveLength(1);

    const stale = await call(app, "PUT", "ra", "r1", { baseVersion: 0, layout: { ...layout, template: "focus" } });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toEqual({ error: "layout conflict", currentVersion: 1 });

    // admin global (bukan member) boleh menulis
    const ok2 = await call(app, "PUT", "admin", "r1", { baseVersion: 1, layout: { ...layout, template: "focus" } });
    expect(await ok2.json()).toEqual({ version: 2 });

    const got = await call(app, "GET", "p");
    expect(got.status).toBe(200);
    const body = (await got.json()) as { version: number; layout: LayoutState };
    expect(body.version).toBe(2);
    expect(body.layout).toMatchObject({ version: 2, template: "focus", updatedBy: "admin" });
  });
});
