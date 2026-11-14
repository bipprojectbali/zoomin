import { beforeAll, describe, expect, test } from "bun:test";
import { createTestDeps, createTestUser, TEST_SUPER_ADMIN_EMAIL } from "../../test/auth.helpers";
import type { ApiError, AuditEntry, Page, RoomSummary } from "../shared/api.types";
import { createApi } from "./api";
import { createRoom } from "./rooms.repository";

const deps = createTestDeps();
const { db } = deps;
const app = createApi(deps);

const admin = await createTestUser(deps, { email: "admin@example.test", role: "admin" });
const alice = await createTestUser(deps, { email: "alice@example.test" });
const ADMIN = admin.cookie;
const ADMIN_ID = admin.user.id;
const ALICE = alice.cookie;
const ALICE_ID = alice.user.id;

function call(method: string, path: string, cookie?: string, body?: unknown) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  return app.handle(
    new Request(`http://localhost/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
  );
}

describe("GET/POST /api/rooms", () => {
  test("tanpa sesi → 401", async () => {
    expect((await call("GET", "/rooms")).status).toBe(401);
    expect((await call("POST", "/rooms", undefined, { id: "x", title: "X" })).status).toBe(401);
  });

  test("user POST → 403 insufficient_role; super_admin boleh", async () => {
    const res = await call("POST", "/rooms", ALICE, { id: "x", title: "X" });
    expect(res.status).toBe(403);
    expect(((await res.json()) as ApiError).code).toBe("insufficient_role");
    const root = await createTestUser(deps, { email: TEST_SUPER_ADMIN_EMAIL });
    expect(root.user.role).toBe("super_admin");
    expect((await call("POST", "/rooms", root.cookie, { id: "root-room", title: "Root" })).status).toBe(200);
  });

  test("user di-ban → 403 banned", async () => {
    const banned = await createTestUser(deps, { email: "banned@example.test" });
    db.query(`UPDATE "user" SET banned = 1 WHERE id = ?`).run(banned.user.id);
    const res = await call("GET", "/rooms", banned.cookie);
    expect(res.status).toBe(403);
    expect(((await res.json()) as ApiError).code).toBe("banned");
  });

  test.each([
    { id: "a b", title: "T" },
    { id: "../etc", title: "T" },
    { id: "", title: "T" },
    { id: "ok", title: "" },
    { id: "ok", title: "t".repeat(101) },
    { title: "T" },
  ])("body invalid → 400 (bukan 422): %o", async (body) => {
    const res = await call("POST", "/rooms", ADMIN, body);
    expect(res.status).toBe(400);
    const err = (await res.json()) as ApiError;
    expect(err.error).toBeString();
    expect(err.code).toBe("invalid_input");
  });

  test("admin POST → room + creator jadi host; duplikat → 409", async () => {
    const res = await call("POST", "/rooms", ADMIN, { id: "dup-room", title: "Dup" });
    expect(res.status).toBe(200);
    const room = (await res.json()) as RoomSummary;
    expect(room).toMatchObject({ id: "dup-room", title: "Dup", role: "host" });
    expect(db.query("SELECT role FROM room_members WHERE room_id = ? AND user_id = ?").get("dup-room", ADMIN_ID)).toEqual({
      role: "host",
    });
    const dup = await call("POST", "/rooms", ADMIN, { id: "dup-room", title: "Lagi" });
    expect(dup.status).toBe(409);
    expect(await dup.json()).toMatchObject({ code: "room_exists", path: "/id" });
  });

  test("A8: POST sukses → audit room.create (actor & target benar); duplikat 409 → tanpa entri baru", async () => {
    const root = await createTestUser(deps, { email: TEST_SUPER_ADMIN_EMAIL });
    const audited = async () => {
      const res = await call("GET", "/dev/audit?action=room.create&limit=200", root.cookie);
      expect(res.status).toBe(200);
      return ((await res.json()) as Page<AuditEntry>).items.filter((e) => e.targetId === "audit-room");
    };
    expect((await call("POST", "/rooms", ADMIN, { id: "audit-room", title: "Audit" })).status).toBe(200);
    const entries = await audited();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      actorId: ADMIN_ID,
      actorEmail: "admin@example.test",
      action: "room.create",
      targetType: "room",
      targetId: "audit-room",
      detail: { title: "Audit" },
    });
    expect((await call("POST", "/rooms", ADMIN, { id: "audit-room", title: "Lagi" })).status).toBe(409);
    expect(await audited()).toHaveLength(1);
  });

  test("paginasi 25 room, limit 10 → 3 halaman tanpa duplikat, nextCursor null di akhir", async () => {
    for (let i = 0; i < 25; i++) createRoom(db, { id: `page-${String(i).padStart(2, "0")}`, title: `P${i}`, createdBy: ADMIN_ID });
    const total = (db.query("SELECT COUNT(*) AS n FROM rooms").get() as { n: number }).n;
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const qs: string = `?limit=10${cursor ? `&cursor=${cursor}` : ""}`;
      const res = await call("GET", `/rooms${qs}`, ADMIN);
      expect(res.status).toBe(200);
      const page = (await res.json()) as Page<RoomSummary>;
      expect(page.items.length).toBeLessThanOrEqual(10);
      seen.push(...page.items.map((r) => r.id));
      cursor = page.nextCursor;
      pages++;
    } while (cursor);
    expect(pages).toBe(Math.ceil(total / 10));
    expect(pages).toBe(3);
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.length).toBe(total);
  });

  test("limit di luar batas / cursor rusak → 400", async () => {
    expect((await call("GET", "/rooms?limit=0", ADMIN)).status).toBe(400);
    expect((await call("GET", "/rooms?limit=101", ADMIN)).status).toBe(400);
    expect((await call("GET", "/rooms?cursor=bm9wZQ", ADMIN)).status).toBe(400);
  });

  test("user biasa hanya melihat room miliknya; admin global melihat semua dengan role null bila bukan member", async () => {
    createRoom(db, { id: "alice-room", title: "Alice", createdBy: ADMIN_ID });
    db.query("INSERT INTO room_members (room_id, user_id, role) VALUES ('alice-room', ?, 'viewer')").run(ALICE_ID);
    db.query("DELETE FROM room_members WHERE room_id = 'alice-room' AND user_id = ?").run(ADMIN_ID);

    const mine = (await (await call("GET", "/rooms?limit=100", ALICE)).json()) as Page<RoomSummary>;
    expect(mine.items.map((r) => [r.id, r.role])).toEqual([["alice-room", "viewer"]]);
    expect(mine.nextCursor).toBeNull();

    const all = (await (await call("GET", "/rooms?limit=100", ADMIN)).json()) as Page<RoomSummary>;
    expect(all.items.find((r) => r.id === "alice-room")?.role).toBeNull();
    expect(all.items.find((r) => r.id === "dup-room")?.role).toBe("host");
  });
});

describe("GET /api/rooms/:roomId", () => {
  let BOB = "";
  beforeAll(async () => {
    BOB = (await createTestUser(deps, { email: "bob@example.test" })).cookie;
    createRoom(db, { id: "detail-room", title: "Rapat Detail", createdBy: ADMIN_ID });
    db.query("INSERT INTO room_members (room_id, user_id, role) VALUES ('detail-room', ?, 'participant')").run(ALICE_ID);
    db.query("DELETE FROM room_members WHERE room_id = 'detail-room' AND user_id = ?").run(ADMIN_ID);
  });
  const codeOf = async (res: Response) => ((await res.json()) as ApiError).code;

  test("member → 200 RoomSummary dengan role-nya", async () => {
    const res = await call("GET", "/rooms/detail-room", ALICE);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: "detail-room", title: "Rapat Detail", role: "participant" });
  });

  test("admin global non-member → 200 role null", async () => {
    const res = await call("GET", "/rooms/detail-room", ADMIN);
    expect(res.status).toBe(200);
    expect(((await res.json()) as RoomSummary).role).toBeNull();
  });

  test("401 / 403 / 404 / 400 dengan code", async () => {
    const anon = await call("GET", "/rooms/detail-room");
    expect([anon.status, await codeOf(anon)]).toEqual([401, "unauthorized"]);
    const outsider = await call("GET", "/rooms/detail-room", BOB);
    expect([outsider.status, await codeOf(outsider)]).toEqual([403, "forbidden"]);
    const missing = await call("GET", "/rooms/tidak-ada", ALICE);
    expect([missing.status, await codeOf(missing)]).toEqual([404, "room_not_found"]);
    const bad = await call("GET", "/rooms/a%20b", ALICE);
    expect([bad.status, await codeOf(bad)]).toEqual([400, "invalid_input"]);
  });
});
