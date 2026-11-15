import { beforeEach, describe, expect, test } from "bun:test";
import type { RoomServiceClient } from "livekit-server-sdk";
import { createTestDeps, createTestUser } from "../../test/auth.helpers";
import type { ApiError, RoomSummary, SessionUser } from "../shared/api.types";
import { parseRoomStage } from "../shared/stage.model";
import { createApi } from "./api";
import type { ApiDeps } from "./api.deps";
import { listAudit } from "./audit.repository";
import { createRoom } from "./rooms.repository";

type Actor = { user: SessionUser; cookie: string };

let deps: ApiDeps;
let app: ReturnType<typeof createApi>;
let admin: Actor;
let host: Actor;
let member: Actor;
let published: string[];

beforeEach(async () => {
  deps = createTestDeps();
  published = [];
  // test-only: LiveKit palsu; metadata dicatat.
  deps.roomService = {
    updateRoomMetadata: async (_room: string, md: string) => published.push(md),
  } as unknown as RoomServiceClient;
  app = createApi(deps);
  admin = await createTestUser(deps, { email: "admin@example.test", role: "admin" });
  host = await createTestUser(deps, { email: "host@example.test" });
  member = await createTestUser(deps, { email: "member@example.test" });
  createRoom(deps.db, { id: "r1", title: "R1", createdBy: host.user.id });
  deps.db.query("INSERT INTO room_members (room_id, user_id, role) VALUES ('r1', ?, 'participant')").run(member.user.id);
});

const call = (method: string, path: string, cookie: string, body?: unknown) =>
  app.handle(
    new Request(`http://localhost/api${path}`, {
      method,
      headers: { "content-type": "application/json", cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
const modeAudit = () => listAudit(deps.db, { action: "room.stage_mode" }).items.map((e) => e.detail);

describe("PUT /api/rooms/:roomId/stage-mode", () => {
  test("host room: 200 RoomSummary, audit {from,to}, envelope disiarkan; mode sama tanpa audit baru", async () => {
    const res = await call("PUT", "/rooms/r1/stage-mode", host.cookie, { mode: "request" });
    expect(res.status).toBe(200);
    expect((await res.json()) as RoomSummary).toMatchObject({ id: "r1", stageMode: "request", canManage: true });
    expect(modeAudit()).toEqual([{ from: "host", to: "request" }]);
    expect(parseRoomStage(published.at(-1))).toEqual({ stageMode: "request", layout: null });

    expect((await call("PUT", "/rooms/r1/stage-mode", host.cookie, { mode: "request" })).status).toBe(200);
    expect(modeAudit()).toHaveLength(1);
    const got = await call("GET", "/rooms/r1/layout", member.cookie);
    expect(await got.json()).toMatchObject({ stageMode: "request" });
  });

  test("admin global non-member boleh; participant 403; room tidak ada 404; mode asing 400", async () => {
    expect((await call("PUT", "/rooms/r1/stage-mode", admin.cookie, { mode: "open" })).status).toBe(200);
    const denied = await call("PUT", "/rooms/r1/stage-mode", member.cookie, { mode: "host" });
    expect(denied.status).toBe(403);
    expect(((await denied.json()) as ApiError).code).toBe("forbidden");
    expect((await call("PUT", "/rooms/nope/stage-mode", admin.cookie, { mode: "open" })).status).toBe(404);
    expect((await call("PUT", "/rooms/r1/stage-mode", host.cookie, { mode: "chaos" })).status).toBe(400);
    expect(modeAudit()).toEqual([{ from: "host", to: "open" }]);
  });
});

describe("stageMode di POST /api/rooms dan PATCH /api/rooms/:roomId", () => {
  test("POST default host; stageMode diset tersimpan + ikut audit room.create", async () => {
    const def = await call("POST", "/rooms", admin.cookie, { id: "a", title: "A" });
    expect(await def.json()).toMatchObject({ stageMode: "host" });
    const res = await call("POST", "/rooms", admin.cookie, { id: "b", title: "B", stageMode: "open" });
    expect(await res.json()).toMatchObject({ stageMode: "open" });
    expect((await (await call("GET", "/rooms/b", admin.cookie)).json()) as RoomSummary).toMatchObject({ stageMode: "open" });
    const created = listAudit(deps.db, { action: "room.create" }).items.find((e) => e.targetId === "b");
    expect(created?.detail).toMatchObject({ stageMode: "open" });
    expect((await call("POST", "/rooms", admin.cookie, { id: "c", title: "C", stageMode: "x" })).status).toBe(400);
  });

  test("PATCH stageMode oleh pengelola: tersimpan + audit; participant 403", async () => {
    const res = await call("PATCH", "/rooms/r1", host.cookie, { title: "New", stageMode: "open" });
    expect(await res.json()).toMatchObject({ title: "New", stageMode: "open" });
    expect(modeAudit()).toEqual([{ from: "host", to: "open" }]);
    expect((await call("PATCH", "/rooms/r1", member.cookie, { stageMode: "host" })).status).toBe(403);
  });
});
