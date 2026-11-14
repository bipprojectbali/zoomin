import { beforeEach, describe, expect, test } from "bun:test";
import type { RoomServiceClient } from "livekit-server-sdk";
import { createTestDeps, createTestUser } from "../../test/auth.helpers";
import type { ApiError, InvitePreview, SessionUser } from "../shared/api.types";
import { createApi } from "./api";
import type { ApiDeps } from "./api.deps";
import { createInvite } from "./auth.invite";
import { ROOM_PASSWORD_ATTEMPTS_MAX } from "./room.password";
import { createRoom } from "./rooms.repository";

// W3–W6: masuk room password lewat ID room (join), token, dan link undangan.
type Actor = { user: SessionUser; cookie: string };
const PW = "rahasia-1"; // test-only

let deps: ApiDeps;
let app: ReturnType<typeof createApi>;
let admin: Actor;
let host: Actor;
let member: Actor;
let stranger: Actor;

beforeEach(async () => {
  deps = createTestDeps();
  // test-only: LiveKit palsu untuk syncRoomLayout di route token.
  deps.roomService = {
    createRoom: async ({ name }: { name: string }) => ({ name, metadata: "" }),
    updateRoomMetadata: async () => ({}),
  } as unknown as RoomServiceClient;
  app = createApi(deps);
  admin = await createTestUser(deps, { email: "admin@example.test", role: "admin" });
  host = await createTestUser(deps, { email: "host@example.test" });
  member = await createTestUser(deps, { email: "member@example.test" });
  stranger = await createTestUser(deps, { email: "stranger@example.test" });
  createRoom(deps.db, { id: "pw", title: "PW", createdBy: host.user.id, visibility: "password", passwordHash: await Bun.password.hash(PW) });
  createRoom(deps.db, { id: "pub", title: "Pub", createdBy: host.user.id });
  createRoom(deps.db, { id: "priv", title: "Priv", createdBy: host.user.id, visibility: "private" });
  deps.db.query("INSERT INTO room_members (room_id, user_id, role) VALUES ('pw', ?, 'viewer')").run(member.user.id);
});

function call(method: string, path: string, cookie?: string, body?: unknown) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  return app.handle(new Request(`http://localhost/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }));
}
const join = (roomId: string, cookie: string | undefined, password: string) => call("POST", `/rooms/${roomId}/join`, cookie, { password });
const result = async (res: Promise<Response>) => {
  const r = await res;
  const body = (await r.json()) as Partial<ApiError>;
  return [r.status, body.code ?? (body as unknown)];
};
const roleOf = (roomId: string, userId: string) =>
  deps.db.query<{ role: string }, [string, string]>("SELECT role FROM room_members WHERE room_id = ? AND user_id = ?").get(roomId, userId)?.role ?? null;

describe("POST /api/rooms/:roomId/join", () => {
  test("password benar → anggota permanen participant; respons tanpa hash; token sesudahnya 200", async () => {
    expect(await result(join("pw", stranger.cookie, PW))).toEqual([200, { roomId: "pw", role: "participant" }]);
    expect(roleOf("pw", stranger.user.id)).toBe("participant");
    expect((await call("POST", "/rooms/pw/token", stranger.cookie)).status).toBe(200);
  });

  test("password salah → 403 password_invalid, bukan anggota; tanpa sesi → 401", async () => {
    expect(await result(join("pw", stranger.cookie, "salah-123"))).toEqual([403, "password_invalid"]);
    expect(await result(join("pw", stranger.cookie, ""))).toEqual([403, "password_invalid"]);
    expect(roleOf("pw", stranger.user.id)).toBeNull();
    expect((await join("pw", undefined, PW)).status).toBe(401);
  });

  test(`rate limit ${ROOM_PASSWORD_ATTEMPTS_MAX}/menit per user+room → 429 + retry-after (password benar pun ditahan); user lain tidak kena`, async () => {
    for (let i = 0; i < ROOM_PASSWORD_ATTEMPTS_MAX; i++) expect((await join("pw", stranger.cookie, "salah-123")).status).toBe(403);
    const limited = await join("pw", stranger.cookie, PW);
    expect(limited.status).toBe(429);
    expect(((await limited.json()) as ApiError).code).toBe("rate_limited");
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(roleOf("pw", stranger.user.id)).toBeNull();
    const other = await createTestUser(deps, { email: "other@example.test" });
    expect((await join("pw", other.cookie, PW)).status).toBe(200);
  });

  test("anggota & admin+ tidak ditanya: role efektif tanpa mengubah keanggotaan", async () => {
    expect(await result(join("pw", member.cookie, "apa-saja"))).toEqual([200, { roomId: "pw", role: "viewer" }]);
    expect(roleOf("pw", member.user.id)).toBe("viewer");
    expect(await result(join("pw", admin.cookie, ""))).toEqual([200, { roomId: "pw", role: "host" }]);
    expect(roleOf("pw", admin.user.id)).toBeNull();
  });

  test("room tidak ada / public tanpa password / private / nonaktif / kadaluarsa → ditolak", async () => {
    expect(await result(join("nope", stranger.cookie, PW))).toEqual([404, "room_not_found"]);
    expect(await result(join("pub", stranger.cookie, PW))).toEqual([403, "forbidden"]);
    expect(await result(join("priv", stranger.cookie, PW))).toEqual([403, "room_private"]);
    deps.db.run(`UPDATE rooms SET expires_at = ${Date.now() - 1} WHERE id = 'pw'`);
    expect(await result(join("pw", stranger.cookie, PW))).toEqual([403, "room_expired"]);
    deps.db.run("UPDATE rooms SET disabled_at = 1 WHERE id = 'pw'");
    expect(await result(join("pw", stranger.cookie, PW))).toEqual([403, "room_inactive"]);
    expect(roleOf("pw", stranger.user.id)).toBeNull();
  });
});

describe("POST /api/rooms/:roomId/token room password (W6)", () => {
  test("non-anggota → 403 password_required; anggota & admin non-member tetap dapat token; room public non-anggota → forbidden", async () => {
    expect(await result(call("POST", "/rooms/pw/token", stranger.cookie))).toEqual([403, "password_required"]);
    expect((await call("POST", "/rooms/pw/token", member.cookie)).status).toBe(200);
    expect((await call("POST", "/rooms/pw/token", admin.cookie)).status).toBe(200);
    expect(await result(call("POST", "/rooms/pub/token", stranger.cookie))).toEqual([403, "forbidden"]);
  });
});

describe("undangan room password (W6)", () => {
  const invite = (roomId = "pw") => createInvite({ roomId, role: "viewer", ttlSeconds: 60 }, deps.config.authSecret);
  const preview = async (cookie?: string, roomId = "pw") =>
    (await (await call("GET", `/invites/preview?${new URLSearchParams({ invite: invite(roomId) })}`, cookie)).json()) as InvitePreview;
  const accept = (cookie: string, password?: string) => call("POST", "/invites/accept", cookie, { invite: invite(), password });

  test("preview passwordRequired: true untuk tamu & non-anggota; false untuk anggota, admin+, room public", async () => {
    expect((await preview()).passwordRequired).toBe(true);
    expect((await preview(stranger.cookie)).passwordRequired).toBe(true);
    expect((await preview(member.cookie)).passwordRequired).toBe(false);
    expect((await preview(admin.cookie)).passwordRequired).toBe(false);
    expect((await preview(stranger.cookie, "pub")).passwordRequired).toBe(false);
    expect(JSON.stringify(await preview())).not.toContain("$argon2");
  });

  test("accept tanpa password → 403 password_required; salah → password_invalid; benar → anggota role undangan", async () => {
    expect(await result(accept(stranger.cookie))).toEqual([403, "password_required"]);
    expect(await result(accept(stranger.cookie, "salah-123"))).toEqual([403, "password_invalid"]);
    expect(roleOf("pw", stranger.user.id)).toBeNull();
    const ok = await accept(stranger.cookie, PW);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ roomId: "pw", role: "viewer" });
    expect(roleOf("pw", stranger.user.id)).toBe("viewer");
  });

  test("anggota menerima tanpa password; limiter dibagi dengan join (5 gagal lewat join → accept 429)", async () => {
    expect((await accept(member.cookie)).status).toBe(200);
    for (let i = 0; i < ROOM_PASSWORD_ATTEMPTS_MAX; i++) await join("pw", stranger.cookie, "salah-123");
    const res = await accept(stranger.cookie, PW);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).not.toBeNull();
  });
});
