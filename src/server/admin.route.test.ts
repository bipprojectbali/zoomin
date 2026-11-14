import { beforeEach, describe, expect, test } from "bun:test";
import type { RoomServiceClient } from "livekit-server-sdk";
import { createTestDeps, createTestUser, TEST_SUPER_ADMIN_EMAIL } from "../../test/auth.helpers";
import type { AdminRoomSummary, AdminUser, ApiError, Page, SessionUser } from "../shared/api.types";
import { createApi } from "./api";
import type { ApiDeps } from "./api.deps";
import { listAudit } from "./audit.repository";
import { createRoom } from "./rooms.repository";

type Actor = { user: SessionUser; cookie: string };

// test-only: RoomServiceClient palsu; `live` = room aktif → identity peserta.
function fakeRoomService(live: Record<string, string[]>, opts: { down?: boolean } = {}) {
  const calls = { listRooms: 0, removed: [] as [string, string][], deleted: [] as string[] };
  const fake = {
    async listRooms(names?: string[]) {
      calls.listRooms++;
      if (opts.down) throw new Error("livekit down");
      return Object.entries(live)
        .filter(([name]) => !names?.length || names.includes(name))
        .map(([name, ids]) => ({ name, numParticipants: ids.length }));
    },
    async listParticipants(room: string) {
      if (room === "broken") throw new Error("room rusak");
      return (live[room] ?? []).map((identity) => ({ identity }));
    },
    async removeParticipant(room: string, identity: string) {
      calls.removed.push([room, identity]);
    },
    async deleteRoom(room: string) {
      calls.deleted.push(room);
      if (!live[room]) throw new Error("room not found");
    },
  };
  return { fake: fake as unknown as RoomServiceClient, calls };
}

let deps: ApiDeps;
let app: ReturnType<typeof createApi>;
let lk: ReturnType<typeof fakeRoomService>;
let root: Actor, adm: Actor, adm2: Actor, ana: Actor, budi: Actor;

beforeEach(async () => {
  deps = createTestDeps();
  lk = fakeRoomService({});
  deps.roomService = lk.fake;
  app = createApi(deps);
  root = await createTestUser(deps, { email: TEST_SUPER_ADMIN_EMAIL, name: "Root" });
  adm = await createTestUser(deps, { email: "adm@example.test", name: "Adm", role: "admin" });
  adm2 = await createTestUser(deps, { email: "adm2@example.test", name: "Adm Dua", role: "admin" });
  ana = await createTestUser(deps, { email: "ana@example.test", name: "Ana" });
  budi = await createTestUser(deps, { email: "budi@example.test", name: "Budi" });
});

function call(method: string, path: string, cookie?: string, body?: unknown) {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (cookie) headers.cookie = cookie;
  return app.handle(new Request(`http://localhost/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }));
}
const json = async <T>(res: Response | Promise<Response>) => (await (await res).json()) as T;
const ban = (actor: Actor, target: Actor, body: unknown = { reason: "spam terus" }) => call("POST", `/admin/users/${target.user.id}/ban`, actor.cookie, body);
const actions = () => listAudit(deps.db, { limit: 200 }).items.map((e) => `${e.action}:${e.targetId}`);

describe("izin /api/admin (A5)", () => {
  test("tanpa sesi → 401; user biasa → 403 insufficient_role di semua endpoint", async () => {
    const id = budi.user.id;
    const endpoints: [string, string, unknown?][] = [
      ["GET", "/admin/users"],
      ["POST", `/admin/users/${id}/ban`, { reason: "spam terus" }],
      ["POST", `/admin/users/${id}/unban`],
      ["DELETE", `/admin/users/${id}`],
      ["POST", `/admin/users/${id}/sessions/revoke`],
      ["GET", "/admin/rooms"],
      ["DELETE", "/admin/rooms/r1"],
    ];
    for (const [method, path, body] of endpoints) {
      expect((await call(method, path, undefined, body)).status).toBe(401);
      const res = await call(method, path, ana.cookie, body);
      expect(res.status).toBe(403);
      expect(await json<ApiError>(res)).toMatchObject({ code: "insufficient_role" });
    }
    expect(actions()).toEqual([]);
  });

  // code "" = sukses (bun meneruskan callback `done` sebagai argumen ekstra bila elemen kurang).
  const matrix: [string, () => Actor, () => Actor, number, string][] = [
    ["admin → user", () => adm, () => ana, 200, ""],
    ["admin → admin", () => adm, () => adm2, 403, "insufficient_role"],
    ["admin → super_admin", () => adm, () => root, 403, "insufficient_role"],
    ["super_admin → admin", () => root, () => adm, 200, ""],
    ["super_admin → user", () => root, () => ana, 200, ""],
    ["admin → diri sendiri", () => adm, () => adm, 403, "cannot_modify_self"],
    ["super_admin → diri sendiri", () => root, () => root, 403, "cannot_modify_self"],
  ];
  test.each(matrix)("%s: ban/unban/revoke/delete → %d", async (_, actorOf, targetOf, expected, code) => {
    const [actor, target] = [actorOf(), targetOf()];
    const id = target.user.id;
    for (const [method, path, body] of [
      ["POST", `/admin/users/${id}/ban`, { reason: "spam terus" }],
      ["POST", `/admin/users/${id}/unban`, undefined],
      ["POST", `/admin/users/${id}/sessions/revoke`, undefined],
      ["DELETE", `/admin/users/${id}`, undefined],
    ] as const) {
      const res = await call(method, path, actor.cookie, body);
      expect(res.status).toBe(expected === 200 && (method === "DELETE" || path.endsWith("revoke")) ? 204 : expected);
      if (code) expect(await json<ApiError>(res)).toMatchObject({ code });
    }
  });

  test("target tidak ada → 404 user_not_found", async () => {
    const res = await call("POST", "/admin/users/nope/ban", adm.cookie, { reason: "spam terus" });
    expect(res.status).toBe(404);
    expect(await json<ApiError>(res)).toMatchObject({ code: "user_not_found" });
    expect((await call("DELETE", "/admin/users/nope", adm.cookie)).status).toBe(404);
  });
});

describe("ban / unban", () => {
  test("ban: sesi target dicabut (401 di /api/me), AdminUser dikembalikan, audit tercatat", async () => {
    expect((await call("GET", "/me", ana.cookie)).status).toBe(200);
    const res = await ban(adm, ana, { reason: "  spam terus  ", expiresInHours: 2 });
    expect(res.status).toBe(200);
    const { user } = await json<{ user: AdminUser }>(res);
    expect(user).toMatchObject({ id: ana.user.id, banned: true, banReason: "spam terus", role: "user" });
    expect(user.banExpires! - Date.now()).toBeGreaterThan(7_100_000);
    expect((await call("GET", "/me", ana.cookie)).status).toBe(401);
    const [entry] = listAudit(deps.db, { action: "user.ban" }).items;
    expect(entry).toMatchObject({ actorId: adm.user.id, actorEmail: "adm@example.test", targetType: "user", targetId: ana.user.id });
    expect(entry!.detail).toMatchObject({ reason: "spam terus", expiresInHours: 2 });
  });

  test("user di-ban yang sesinya masih ada → 403 banned (guard)", async () => {
    // Simulasi sesi yang lolos (mis. dibuat sebelum ban tercatat): tandai banned langsung di DB.
    deps.db.query(`UPDATE "user" SET banned = 1 WHERE id = ?`).run(ana.user.id);
    const res = await call("GET", "/me", ana.cookie);
    expect(res.status).toBe(403);
    expect(await json<ApiError>(res)).toMatchObject({ code: "banned" });
  });

  test("ban mengeluarkan identity dari room LiveKit tempat ia hadir saja; room rusak tidak menggagalkan", async () => {
    lk = fakeRoomService({ r1: [ana.user.id, budi.user.id], r2: [budi.user.id], r3: [ana.user.id], broken: [ana.user.id] });
    deps.roomService = lk.fake;
    app = createApi(deps);
    expect((await ban(adm, ana)).status).toBe(200);
    expect(lk.calls.removed.toSorted()).toEqual([["r1", ana.user.id], ["r3", ana.user.id]]);
    expect(listAudit(deps.db, { action: "user.ban" }).items[0]!.detail).toMatchObject({ kickedRooms: 2 });
  });

  test("LiveKit down → ban tetap sukses", async () => {
    deps.roomService = fakeRoomService({}, { down: true }).fake;
    app = createApi(deps);
    expect((await ban(adm, ana)).status).toBe(200);
  });

  test.each([
    [{ reason: "ab" }, "/reason"],
    [{ reason: "   abc   ".padEnd(300, "x") }, "/reason"],
    [{ reason: "spam terus", expiresInHours: 0 }, "/expiresInHours"],
    [{ reason: "spam terus", expiresInHours: 8761 }, "/expiresInHours"],
  ])("body invalid %o → 400 invalid_input %s", async (body, path) => {
    const res = await ban(adm, ana, body);
    expect(res.status).toBe(400);
    expect(await json<ApiError>(res)).toMatchObject({ code: "invalid_input", path });
  });

  test("unban: ban dicabut, bisa login lagi, audit user.unban", async () => {
    await ban(adm, ana);
    const res = await call("POST", `/admin/users/${ana.user.id}/unban`, adm.cookie);
    expect((await json<{ user: AdminUser }>(res)).user).toMatchObject({ banned: false, banReason: null, banExpires: null });
    const again = await createTestUser(deps, { email: "ana@example.test" });
    expect((await call("GET", "/me", again.cookie)).status).toBe(200);
    expect(actions().toSorted()).toEqual([`user.ban:${ana.user.id}`, `user.unban:${ana.user.id}`]);
  });
});

describe("hapus user & cabut sesi", () => {
  test("hapus: rooms.created_by NULL, membership hilang, audit menyimpan email, LiveKit kick", async () => {
    createRoom(deps.db, { id: "r1", title: "R1", createdBy: adm.user.id });
    deps.db.query("INSERT INTO room_members (room_id, user_id, role) VALUES ('r1', ?, 'participant')").run(ana.user.id);
    deps.db.query("UPDATE rooms SET created_by = ? WHERE id = 'r1'").run(ana.user.id);
    lk = fakeRoomService({ r1: [ana.user.id] });
    deps.roomService = lk.fake;
    app = createApi(deps);
    expect((await call("DELETE", `/admin/users/${ana.user.id}`, adm.cookie)).status).toBe(204);
    expect(deps.db.query(`SELECT 1 FROM "user" WHERE id = ?`).get(ana.user.id)).toBeNull();
    expect(deps.db.query("SELECT created_by FROM rooms WHERE id = 'r1'").get()).toEqual({ created_by: null });
    expect(deps.db.query("SELECT user_id FROM room_members WHERE room_id = 'r1'").all()).toEqual([{ user_id: adm.user.id }]);
    expect(lk.calls.removed).toEqual([["r1", ana.user.id]]);
    expect(listAudit(deps.db, { action: "user.delete" }).items[0]!.detail).toMatchObject({ email: "ana@example.test" });
    expect((await call("GET", "/me", ana.cookie)).status).toBe(401);
  });

  test("revoke sessions: semua sesi target hilang, audit user.sessions.revoke", async () => {
    expect((await call("POST", `/admin/users/${ana.user.id}/sessions/revoke`, adm.cookie)).status).toBe(204);
    expect((await call("GET", "/me", ana.cookie)).status).toBe(401);
    expect(actions()).toEqual([`user.sessions.revoke:${ana.user.id}`]);
  });
});

describe("GET /api/admin/users", () => {
  test("25 user tambahan, limit 10 → 3 halaman tanpa duplikat, urut terbaru dulu", async () => {
    for (let i = 0; i < 20; i++) await createTestUser(deps, { email: `u${i}@example.test`, name: `U${i}` });
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const qs: string = cursor ? `&cursor=${cursor}` : "";
      const page: Page<AdminUser> = await json(call("GET", `/admin/users?limit=10${qs}`, adm.cookie));
      seen.push(...page.items.map((u) => u.id));
      cursor = page.nextCursor;
      pages++;
    } while (cursor);
    expect(pages).toBe(3);
    expect(seen).toHaveLength(25);
    expect(new Set(seen).size).toBe(25);
    const all = deps.db.query<{ id: string }, []>(`SELECT id FROM "user" ORDER BY createdAt DESC, id DESC`).all().map((r) => r.id);
    expect(seen).toEqual(all);
  });

  test("filter q (nama/email, case-insensitive), role, banned; lastActiveAt terisi", async () => {
    const ids = async (qs: string) => (await json<Page<AdminUser>>(call("GET", `/admin/users?${qs}`, adm.cookie))).items.map((u) => u.email).toSorted();
    expect(await ids("q=ADM")).toEqual(["adm2@example.test", "adm@example.test"]);
    expect(await ids("q=dua")).toEqual(["adm2@example.test"]);
    expect(await ids("q=%25")).toEqual([]);
    expect(await ids("role=super_admin")).toEqual([TEST_SUPER_ADMIN_EMAIL]);
    await ban(adm, budi);
    expect(await ids("banned=true")).toEqual(["budi@example.test"]);
    expect(await ids("banned=false&role=user")).toEqual(["ana@example.test"]);
    const [ana1] = (await json<Page<AdminUser>>(call("GET", "/admin/users?q=ana", adm.cookie))).items;
    expect(ana1!.lastActiveAt).toBeGreaterThan(0);
    expect((await call("GET", "/admin/users?cursor=rusak", adm.cookie)).status).toBe(400);
    expect((await call("GET", "/admin/users?role=root", adm.cookie)).status).toBe(400);
  });

  test("ban yang sudah kedaluwarsa dihitung tidak di-ban", async () => {
    deps.db.query(`UPDATE "user" SET banned = 1, banExpires = '2000-01-01T00:00:00.000Z' WHERE id = ?`).run(ana.user.id);
    const [u] = (await json<Page<AdminUser>>(call("GET", "/admin/users?q=ana", adm.cookie))).items;
    expect(u).toMatchObject({ banned: false, banExpires: null });
  });
});

describe("room admin", () => {
  beforeEach(() => {
    createRoom(deps.db, { id: "r1", title: "R1", createdBy: adm.user.id });
    createRoom(deps.db, { id: "r2", title: "R2", createdBy: root.user.id });
    deps.db.query("INSERT INTO room_members (room_id, user_id, role) VALUES ('r1', ?, 'viewer')").run(ana.user.id);
  });

  test("list: members, live & participants dari SATU listRooms", async () => {
    lk = fakeRoomService({ r1: ["a", "b", "c"] });
    deps.roomService = lk.fake;
    app = createApi(deps);
    const page = await json<Page<AdminRoomSummary>>(call("GET", "/admin/rooms", adm.cookie));
    expect(page.items.map(({ id, members, live, participants, role }) => ({ id, members, live, participants, role })).toSorted((a, b) => a.id.localeCompare(b.id))).toEqual([
      { id: "r1", members: 2, live: true, participants: 3, role: "host" },
      { id: "r2", members: 1, live: false, participants: 0, role: null },
    ]);
    expect(lk.calls.listRooms).toBe(1);
  });

  test("LiveKit down → live=false, tetap 200", async () => {
    deps.roomService = fakeRoomService({}, { down: true }).fake;
    app = createApi(deps);
    const res = await call("GET", "/admin/rooms", adm.cookie);
    expect(res.status).toBe(200);
    expect((await json<Page<AdminRoomSummary>>(res)).items.every((r) => !r.live)).toBe(true);
  });

  test("hapus room: DB + member hilang, deleteRoom LiveKit dipanggil (gagal = tetap 204), audit; tak ada → 404", async () => {
    expect((await call("DELETE", "/admin/rooms/r1", adm.cookie)).status).toBe(204);
    expect(deps.db.query("SELECT 1 FROM rooms WHERE id = 'r1'").get()).toBeNull();
    expect(deps.db.query("SELECT 1 FROM room_members WHERE room_id = 'r1'").get()).toBeNull();
    expect(lk.calls.deleted).toEqual(["r1"]);
    expect(listAudit(deps.db, { action: "room.delete" }).items[0]).toMatchObject({ targetType: "room", targetId: "r1", detail: { title: "R1" } });
    const res = await call("DELETE", "/admin/rooms/r1", adm.cookie);
    expect(res.status).toBe(404);
    expect(await json<ApiError>(res)).toMatchObject({ code: "room_not_found" });
  });
});

