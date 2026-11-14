import { beforeEach, describe, expect, test } from "bun:test";
import type { RoomServiceClient } from "livekit-server-sdk";
import { createTestDeps, createTestUser } from "../../test/auth.helpers";
import { type ApiError, ROOM_EXPIRY_MAX_DAYS, type RoomSummary, type SessionUser } from "../shared/api.types";
import { createApi } from "./api";
import type { ApiDeps } from "./api.deps";
import { listAudit } from "./audit.repository";
import { createRoom } from "./rooms.repository";

type Actor = { user: SessionUser; cookie: string };
const DAY = 86_400_000;

let deps: ApiDeps;
let app: ReturnType<typeof createApi>;
let admin: Actor;
let host: Actor;
let member: Actor;
let deleted: string[];

beforeEach(async () => {
  deps = createTestDeps();
  deleted = [];
  // test-only: LiveKit palsu; deleteRoom room yang tidak live → not found (harus tetap sukses, hanya warn).
  deps.roomService = {
    async deleteRoom(name: string) {
      deleted.push(name);
      throw new Error("room not found");
    },
  } as unknown as RoomServiceClient;
  app = createApi(deps);
  admin = await createTestUser(deps, { email: "admin@example.test", role: "admin" });
  host = await createTestUser(deps, { email: "host@example.test" });
  member = await createTestUser(deps, { email: "member@example.test" });
  createRoom(deps.db, { id: "r1", title: "R1", createdBy: host.user.id });
  deps.db.query("INSERT INTO room_members (room_id, user_id, role) VALUES ('r1', ?, 'participant')").run(member.user.id);
});

function call(method: string, path: string, cookie: string, body?: unknown) {
  return app.handle(
    new Request(`http://localhost/api${path}`, {
      method,
      headers: { "content-type": "application/json", cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}
const codeOf = async (res: Response) => ((await res.json()) as ApiError).code;
const actions = () => listAudit(deps.db, { limit: 100 }).items.map((e) => e.action).toSorted();

describe("POST /api/rooms (visibility, expiresAt)", () => {
  test("default public, aktif, tanpa batas; canManage untuk pembuat", async () => {
    const res = await call("POST", "/rooms", admin.cookie, { id: "new", title: "New" });
    expect(await res.json()).toMatchObject({ visibility: "public", status: "active", expiresAt: null, canManage: true });
  });

  test("private + expiresAt valid tersimpan; expiresAt lampau / > 365 hari → 400 invalid_input", async () => {
    const exp = Date.now() + DAY;
    const res = await call("POST", "/rooms", admin.cookie, { id: "p", title: "P", visibility: "private", expiresAt: exp });
    expect(await res.json()).toMatchObject({ visibility: "private", expiresAt: exp, status: "active" });
    for (const bad of [Date.now() - 1, Date.now() + (ROOM_EXPIRY_MAX_DAYS + 1) * DAY]) {
      const r = await call("POST", "/rooms", admin.cookie, { id: "q", title: "Q", expiresAt: bad });
      expect(r.status).toBe(400);
      expect(await r.json()).toMatchObject({ code: "invalid_input", path: "/expiresAt" });
    }
    expect((await call("POST", "/rooms", admin.cookie, { id: "q", title: "Q", visibility: "secret" })).status).toBe(400);
  });
});

describe("GET /api/rooms field baru", () => {
  test("status turunan server + canManage per pemanggil", async () => {
    deps.db.query("UPDATE rooms SET expires_at = ? WHERE id = 'r1'").run(Date.now() - 1);
    const asMember = (await (await call("GET", "/rooms/r1", member.cookie)).json()) as RoomSummary;
    expect(asMember).toMatchObject({ status: "expired", canManage: false, role: "participant" });
    deps.db.query("UPDATE rooms SET disabled_at = 1 WHERE id = 'r1'").run();
    const asHost = (await (await call("GET", "/rooms?limit=10", host.cookie)).json()) as { items: RoomSummary[] };
    expect(asHost.items[0]).toMatchObject({ id: "r1", status: "inactive", canManage: true });
  });
});

describe("PATCH /api/rooms/:roomId", () => {
  test("participant → 403 forbidden; room tidak ada → 404", async () => {
    const res = await call("PATCH", "/rooms/r1", member.cookie, { title: "X" });
    expect([res.status, await codeOf(res)]).toEqual([403, "forbidden"]);
    const missing = await call("PATCH", "/rooms/nope", admin.cookie, { title: "X" });
    expect([missing.status, await codeOf(missing)]).toEqual([404, "room_not_found"]);
  });

  test("host mengubah semua field → RoomSummary baru + satu audit per perubahan; nonaktif → deleteRoom LiveKit", async () => {
    const exp = Date.now() + 7 * DAY;
    const res = await call("PATCH", "/rooms/r1", host.cookie, { title: " Baru ", visibility: "private", enabled: false, expiresAt: exp });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ title: "Baru", visibility: "private", status: "inactive", expiresAt: exp });
    expect(deleted).toEqual(["r1"]);
    expect(actions()).toEqual(["room.deactivate", "room.expiry", "room.update", "room.visibility"]);
    const vis = listAudit(deps.db, { limit: 10, action: "room.visibility" }).items[0];
    expect(vis).toMatchObject({ actorId: host.user.id, targetType: "room", targetId: "r1", detail: { from: "public", to: "private" } });
  });

  test("tanpa perubahan nyata → tanpa audit; admin non-member mengaktifkan & menghapus batas", async () => {
    await call("PATCH", "/rooms/r1", host.cookie, { title: "R1", visibility: "public", enabled: true, expiresAt: null });
    expect(actions()).toEqual([]);
    deps.db.query("UPDATE rooms SET disabled_at = 1, expires_at = ? WHERE id = 'r1'").run(Date.now() - 1);
    const res = await call("PATCH", "/rooms/r1", admin.cookie, { enabled: true, expiresAt: null });
    expect(await res.json()).toMatchObject({ status: "active", expiresAt: null, role: null, canManage: true });
    expect(actions()).toEqual(["room.activate", "room.expiry"]);
    expect(deleted).toEqual([]);
  });

  test("validasi: judul kosong / expiresAt di luar batas → 400", async () => {
    expect(await (await call("PATCH", "/rooms/r1", host.cookie, { title: "  " })).json()).toMatchObject({ code: "invalid_input", path: "/title" });
    const far = Date.now() + (ROOM_EXPIRY_MAX_DAYS + 1) * DAY;
    expect(await (await call("PATCH", "/rooms/r1", host.cookie, { expiresAt: far })).json()).toMatchObject({ path: "/expiresAt" });
  });
});

describe("DELETE /api/rooms/:roomId", () => {
  test("participant → 403; host → 204, room & member hilang, audit room.delete, deleteRoom LiveKit (gagal = tetap 204)", async () => {
    expect((await call("DELETE", "/rooms/r1", member.cookie)).status).toBe(403);
    expect((await call("DELETE", "/rooms/r1", host.cookie)).status).toBe(204);
    expect(deps.db.query("SELECT COUNT(*) AS n FROM room_members WHERE room_id = 'r1'").get()).toEqual({ n: 0 });
    expect(deleted).toEqual(["r1"]);
    expect(listAudit(deps.db, { limit: 10 }).items[0]).toMatchObject({ action: "room.delete", actorId: host.user.id, detail: { title: "R1" } });
    expect((await call("DELETE", "/rooms/r1", admin.cookie)).status).toBe(404);
  });

  test("admin global non-member boleh menghapus", async () => {
    expect((await call("DELETE", "/rooms/r1", admin.cookie)).status).toBe(204);
  });
});
