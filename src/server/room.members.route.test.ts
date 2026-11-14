import { describe, expect, test } from "bun:test";
import type { RoomServiceClient } from "livekit-server-sdk";
import { createTestDeps, createTestUser } from "../../test/auth.helpers";
import type { ApiError, Page, RoomMemberItem } from "../shared/api.types";
import { createApi } from "./api";
import { listAudit } from "./audit.repository";
import { ALLOWED_EMAIL_DOMAINS_KEY } from "./auth.better";
import { createRoom } from "./rooms.repository";

const deps = createTestDeps();
const { db } = deps;
// test-only: removeParticipant palsu; identity "absent" meniru peserta yang tidak sedang di room.
const removed: [string, string][] = [];
deps.roomService = {
  async removeParticipant(room: string, identity: string) {
    if (identity === absentId) throw new Error("participant not found");
    removed.push([room, identity]);
  },
} as unknown as RoomServiceClient;
const app = createApi(deps);

const host = await createTestUser(deps, { email: "host@example.test", name: "Hana" });
const admin = await createTestUser(deps, { email: "admin@example.test", name: "Adi", role: "admin" });
const bob = await createTestUser(deps, { email: "bob@example.test", name: "Bob" });
const cici = await createTestUser(deps, { email: "cici@example.test", name: "Cici" });
const absentId = cici.user.id;

let seq = 0;
/** Room baru dengan `host` sebagai host tunggal. */
function newRoom(): string {
  const id = `room-${++seq}`;
  createRoom(db, { id, title: id, createdBy: host.user.id });
  return id;
}

function call(method: string, path: string, cookie?: string, body?: unknown) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  return app.handle(new Request(`http://localhost/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }));
}
const code = async (res: Response) => ((await res.json()) as ApiError).code;
const roleOf = (roomId: string, userId: string) =>
  db.query<{ role: string }, [string, string]>("SELECT role FROM room_members WHERE room_id = ? AND user_id = ?").get(roomId, userId)?.role ?? null;

describe("akses endpoint anggota (R3)", () => {
  test("tanpa sesi 401, non-pengelola 403 forbidden, room tak ada 404", async () => {
    const r = newRoom();
    expect((await call("GET", `/rooms/${r}/members`)).status).toBe(401);
    const res = await call("GET", `/rooms/${r}/members`, bob.cookie);
    expect(res.status).toBe(403);
    expect(await code(res)).toBe("forbidden");
    // Anggota non-host juga bukan pengelola.
    db.query("INSERT INTO room_members (room_id, user_id, role) VALUES (?, ?, 'participant')").run(r, bob.user.id);
    expect((await call("POST", `/rooms/${r}/members`, bob.cookie, { email: "x@example.test", role: "viewer" })).status).toBe(403);
    expect((await call("DELETE", `/rooms/${r}/members/${host.user.id}`, bob.cookie)).status).toBe(403);
    const missing = await call("GET", "/rooms/nope/members", admin.cookie);
    expect(missing.status).toBe(404);
    expect(await code(missing)).toBe("room_not_found");
  });

  test("admin global tanpa keanggotaan boleh mengelola", async () => {
    const r = newRoom();
    expect((await call("GET", `/rooms/${r}/members`, admin.cookie)).status).toBe(200);
  });
});

describe("POST /rooms/:roomId/members (R2)", () => {
  test("email user yang ada → member dengan role persis (juga menurunkan), normalisasi email, audit", async () => {
    const r = newRoom();
    const res = await call("POST", `/rooms/${r}/members`, host.cookie, { email: "  BOB@Example.TEST ", role: "host" });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ kind: "member", userId: bob.user.id, name: "Bob", email: "bob@example.test", image: null, role: "host" });
    await call("POST", `/rooms/${r}/members`, host.cookie, { email: "bob@example.test", role: "viewer" });
    expect(roleOf(r, bob.user.id)).toBe("viewer");
    const entry = listAudit(db, { action: "room.member.add" }).items.find((e) => e.targetId === r);
    expect(entry).toMatchObject({ actorId: host.user.id, targetType: "room", detail: { userId: bob.user.id, role: "viewer", pending: false } });
  });

  test("email belum terdaftar → pending; ulang = update role, bukan duplikat", async () => {
    const r = newRoom();
    const res = await call("POST", `/rooms/${r}/members`, host.cookie, { email: "New@Example.test", role: "participant" });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ kind: "pending", email: "new@example.test", role: "participant" });
    await call("POST", `/rooms/${r}/members`, host.cookie, { email: "new@example.test", role: "viewer" });
    expect(db.query("SELECT role FROM room_invitations WHERE room_id = ?").all(r)).toEqual([{ role: "viewer" }]);
  });

  test.each([{ email: "bukan-email", role: "viewer" }, { email: "a b@x.test", role: "viewer" }, { email: "x@example.test", role: "owner" }, { role: "viewer" }])(
    "body invalid → 400 invalid_input: %o",
    async (body) => {
      const res = await call("POST", `/rooms/${newRoom()}/members`, host.cookie, body);
      expect(res.status).toBe(400);
      expect(await code(res)).toBe("invalid_input");
    },
  );

  test("allowlist domain ditegakkan → 400 email_domain_not_allowed", async () => {
    const r = newRoom();
    db.query("INSERT OR REPLACE INTO app_settings (key, value_json, updated_at) VALUES (?, ?, ?)").run(ALLOWED_EMAIL_DOMAINS_KEY, '["corp.test"]', Date.now());
    try {
      const res = await call("POST", `/rooms/${r}/members`, host.cookie, { email: "x@other.test", role: "viewer" });
      expect(res.status).toBe(400);
      expect(await code(res)).toBe("email_domain_not_allowed");
      expect((await call("POST", `/rooms/${r}/members`, host.cookie, { email: "x@CORP.test", role: "viewer" })).status).toBe(201);
    } finally {
      db.query("DELETE FROM app_settings WHERE key = ?").run(ALLOWED_EMAIL_DOMAINS_KEY);
    }
  });

  test("menurunkan host terakhir lewat POST → 409 last_host", async () => {
    const r = newRoom();
    const res = await call("POST", `/rooms/${r}/members`, admin.cookie, { email: "host@example.test", role: "viewer" });
    expect(res.status).toBe(409);
    expect(await code(res)).toBe("last_host");
    expect(roleOf(r, host.user.id)).toBe("host");
  });
});

describe("GET /rooms/:roomId/members (paginasi)", () => {
  test("member urut nama lalu pending urut email; cursor melintasi batas member→pending", async () => {
    const r = newRoom();
    for (const u of [cici, bob]) await call("POST", `/rooms/${r}/members`, host.cookie, { email: u.user.email, role: "viewer" });
    for (const e of ["zed@example.test", "amy@example.test"]) await call("POST", `/rooms/${r}/members`, host.cookie, { email: e, role: "viewer" });
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const q: string = cursor ? `&cursor=${cursor}` : "";
      const res = await call("GET", `/rooms/${r}/members?limit=1${q}`, host.cookie);
      expect(res.status).toBe(200);
      const page = (await res.json()) as Page<RoomMemberItem>;
      expect(page.items.length).toBe(1);
      seen.push(...page.items.map((i) => (i.kind === "member" ? i.name : i.email)));
      cursor = page.nextCursor;
      pages++;
    } while (cursor && pages < 10);
    expect(seen).toEqual(["Bob", "Cici", "Hana", "amy@example.test", "zed@example.test"]);
    const all = (await (await call("GET", `/rooms/${r}/members?limit=3`, host.cookie)).json()) as Page<RoomMemberItem>;
    expect(all.items.map((i) => i.kind)).toEqual(["member", "member", "member"]);
    const rest = (await (await call("GET", `/rooms/${r}/members?cursor=${all.nextCursor}`, host.cookie)).json()) as Page<RoomMemberItem>;
    expect(rest).toMatchObject({ items: [{ email: "amy@example.test" }, { email: "zed@example.test" }], nextCursor: null });
  });

  test("cursor rusak → 400; limit > 200 → 400", async () => {
    const r = newRoom();
    expect((await call("GET", `/rooms/${r}/members?cursor=xyz`, host.cookie)).status).toBe(400);
    expect((await call("GET", `/rooms/${r}/members?limit=201`, host.cookie)).status).toBe(400);
  });
});

describe("PATCH/DELETE anggota (R9)", () => {
  test("ubah role + audit; bukan anggota → 404 member_not_found; host terakhir → 409", async () => {
    const r = newRoom();
    await call("POST", `/rooms/${r}/members`, host.cookie, { email: "bob@example.test", role: "viewer" });
    const res = await call("PATCH", `/rooms/${r}/members/${bob.user.id}`, host.cookie, { role: "host" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ kind: "member", userId: bob.user.id, role: "host" });
    expect(listAudit(db, { action: "room.member.role" }).items[0]).toMatchObject({ targetId: r, detail: { userId: bob.user.id, from: "viewer", to: "host" } });
    // Dua host → host asli boleh turun; lalu bob jadi host terakhir.
    expect((await call("PATCH", `/rooms/${r}/members/${host.user.id}`, bob.cookie, { role: "participant" })).status).toBe(200);
    const last = await call("PATCH", `/rooms/${r}/members/${bob.user.id}`, admin.cookie, { role: "viewer" });
    expect(last.status).toBe(409);
    expect(await code(last)).toBe("last_host");
    const missing = await call("PATCH", `/rooms/${r}/members/${cici.user.id}`, admin.cookie, { role: "viewer" });
    expect(missing.status).toBe(404);
    expect(await code(missing)).toBe("member_not_found");
  });

  test("keluarkan → 204, removeParticipant LiveKit, audit; host terakhir → 409", async () => {
    const r = newRoom();
    await call("POST", `/rooms/${r}/members`, host.cookie, { email: "bob@example.test", role: "participant" });
    const res = await call("DELETE", `/rooms/${r}/members/${bob.user.id}`, host.cookie);
    expect(res.status).toBe(204);
    expect(roleOf(r, bob.user.id)).toBeNull();
    expect(removed).toContainEqual([r, bob.user.id]);
    expect(listAudit(db, { action: "room.member.remove" }).items[0]).toMatchObject({ targetId: r, detail: { userId: bob.user.id } });
    expect((await call("DELETE", `/rooms/${r}/members/${bob.user.id}`, host.cookie)).status).toBe(404);
    const last = await call("DELETE", `/rooms/${r}/members/${host.user.id}`, admin.cookie);
    expect(last.status).toBe(409);
    expect(await code(last)).toBe("last_host");
  });

  test("removeParticipant gagal (tidak di room) → tetap 204", async () => {
    const r = newRoom();
    await call("POST", `/rooms/${r}/members`, host.cookie, { email: "cici@example.test", role: "viewer" });
    expect((await call("DELETE", `/rooms/${r}/members/${cici.user.id}`, host.cookie)).status).toBe(204);
    expect(roleOf(r, cici.user.id)).toBeNull();
  });
});

describe("DELETE /rooms/:roomId/invitations/:email", () => {
  test("batalkan pending (email ter-encode, case-insensitive) → 204 + audit; tidak ada → 404", async () => {
    const r = newRoom();
    await call("POST", `/rooms/${r}/members`, host.cookie, { email: "pending+x@example.test", role: "viewer" });
    const res = await call("DELETE", `/rooms/${r}/invitations/${encodeURIComponent("Pending+X@example.test")}`, host.cookie);
    expect(res.status).toBe(204);
    expect(db.query("SELECT 1 FROM room_invitations WHERE room_id = ?").all(r)).toEqual([]);
    expect(listAudit(db, { action: "room.member.remove" }).items[0]).toMatchObject({ targetId: r, detail: { email: "pending+x@example.test", pending: true } });
    const again = await call("DELETE", `/rooms/${r}/invitations/${encodeURIComponent("pending+x@example.test")}`, host.cookie);
    expect(again.status).toBe(404);
    expect(await code(again)).toBe("member_not_found");
  });
});
