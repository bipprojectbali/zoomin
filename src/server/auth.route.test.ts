import { beforeEach, describe, expect, test } from "bun:test";
import { RoomServiceClient } from "livekit-server-sdk";
import { SAFE_ID_PATTERN } from "../shared/api.types";
import { createApi } from "./api";
import type { ApiDeps } from "./api.deps";
import { createInvite } from "./auth.invite";
import { createSessionCookie, SESSION_COOKIE_NAME } from "./auth.session";
import { loadConfig } from "./config";
import { openDb } from "./db";

const config = { ...loadConfig({ DB_PATH: ":memory:" }), publicAppUrl: "https://app.example.test" }; // test-only
let deps: ApiDeps;
let app: ReturnType<typeof createApi>;

beforeEach(() => {
  deps = {
    db: openDb(":memory:"),
    config,
    // Tidak dipanggil di test ini; hanya memenuhi tipe.
    roomService: new RoomServiceClient("http://127.0.0.1:7880", config.livekitApiKey, config.livekitApiSecret),
  };
  app = createApi(deps);
  const now = Date.now();
  deps.db.run("INSERT INTO users (id, name, is_admin, created_at) VALUES ('owner', 'Owner', 0, ?)", [now]);
  deps.db.run("INSERT INTO users (id, name, is_admin, created_at) VALUES ('guest', 'Guest', 0, ?)", [now]);
  deps.db.run("INSERT INTO rooms (id, title, created_by, created_at) VALUES ('r1', 'Room 1', 'owner', ?)", [now]);
  deps.db.run("INSERT INTO room_members (room_id, user_id, role) VALUES ('r1', 'owner', 'admin'), ('r1', 'guest', 'viewer')");
});

const cookieFor = (userId: string) => createSessionCookie(userId, config.sessionSecret, 60, false).split(";")[0] ?? "";
const cookiePair = (res: Response) => (res.headers.get("set-cookie") ?? "").split(";")[0] ?? "";

function call(method: string, path: string, body?: unknown, cookie?: string): Promise<Response> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (cookie) headers.cookie = cookie;
  return app.handle(
    new Request(`http://localhost/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
  );
}

const roleOf = (userId: string) =>
  deps.db.query<{ role: string }, [string]>("SELECT role FROM room_members WHERE room_id = 'r1' AND user_id = ?").get(userId)?.role;
const userCount = () => deps.db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM users").get()?.n;
const inviteFor = (role: "admin" | "participant" | "viewer", ttlSeconds = 60) =>
  createInvite({ roomId: "r1", role, ttlSeconds }, config.sessionSecret);

describe("admin-login + /me + logout", () => {
  test("password benar → user admin + cookie; /me dengan cookie → user", async () => {
    const res = await call("POST", "/auth/admin-login", { password: config.adminPassword });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ user: { id: "admin", name: "Admin", isAdmin: true } });
    expect(res.headers.get("set-cookie")).toContain("HttpOnly");
    const me = await call("GET", "/me", undefined, cookiePair(res));
    expect(me.status).toBe(200);
    expect(((await me.json()) as { user: { id: string } }).user.id).toBe("admin");
  });

  test("password salah → 401 tanpa cookie; body tanpa password → 400", async () => {
    const res = await call("POST", "/auth/admin-login", { password: "salah" });
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect((await call("POST", "/auth/admin-login", {})).status).toBe(400);
  });

  test("/me tanpa cookie / cookie palsu → 401", async () => {
    expect((await call("GET", "/me")).status).toBe(401);
    expect((await call("GET", "/me", undefined, `${SESSION_COOKIE_NAME}=abc.def`)).status).toBe(401);
  });

  test("logout → 204 + cookie dihapus", async () => {
    const res = await call("POST", "/auth/logout");
    expect(res.status).toBe(204);
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});

describe("POST /rooms/:roomId/invites", () => {
  test("tanpa sesi → 401", async () => {
    expect((await call("POST", "/rooms/r1/invites", { role: "viewer" })).status).toBe(401);
  });

  test("room tidak ada → 404", async () => {
    expect((await call("POST", "/rooms/nope/invites", { role: "viewer" }, cookieFor("owner"))).status).toBe(404);
  });

  test("member non-admin → 403", async () => {
    expect((await call("POST", "/rooms/r1/invites", { role: "viewer" }, cookieFor("guest"))).status).toBe(403);
  });

  test("admin room → 200, url berisi publicAppUrl; ttlHours di luar batas → 400", async () => {
    const before = Date.now();
    const res = await call("POST", "/rooms/r1/invites", { role: "participant", ttlHours: 1 }, cookieFor("owner"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string; expiresAt: number };
    expect(body.url).toStartWith("https://app.example.test/invite/");
    expect(body.expiresAt).toBeGreaterThanOrEqual(before + 3600 * 1000 - 1000);
    expect((await call("POST", "/rooms/r1/invites", { role: "viewer", ttlHours: 721 }, cookieFor("owner"))).status).toBe(400);
    expect((await call("POST", "/rooms/r1/invites", { role: "owner" }, cookieFor("owner"))).status).toBe(400);
  });

  test("admin global non-member → 200", async () => {
    const login = await call("POST", "/auth/admin-login", { password: config.adminPassword });
    expect((await call("POST", "/rooms/r1/invites", { role: "viewer" }, cookiePair(login))).status).toBe(200);
  });
});

describe("POST /invites/accept", () => {
  test("tanpa sesi → user baru + member + cookie; url dari create bisa dipakai", async () => {
    const created = await call("POST", "/rooms/r1/invites", { role: "participant" }, cookieFor("owner"));
    const invite = ((await created.json()) as { url: string }).url.split("/invite/")[1];
    const res = await call("POST", "/invites/accept", { invite, name: "  Budi  " });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { id: string; name: string; isAdmin: boolean }; roomId: string };
    expect(body.roomId).toBe("r1");
    expect(body.user.name).toBe("Budi");
    expect(body.user.isAdmin).toBe(false);
    expect(body.user.id).toMatch(/^u_[A-Za-z0-9]{20}$/);
    expect(body.user.id).toMatch(new RegExp(SAFE_ID_PATTERN));
    expect(roleOf(body.user.id)).toBe("participant");
    const me = await call("GET", "/me", undefined, cookiePair(res));
    expect(((await me.json()) as { user: { id: string } }).user.id).toBe(body.user.id);
  });

  test("dengan sesi existing → pakai user itu, tidak membuat user baru; role naik", async () => {
    const before = userCount();
    const res = await call("POST", "/invites/accept", { invite: inviteFor("participant"), name: "X" }, cookieFor("guest"));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { user: unknown }).user).toEqual({ id: "guest", name: "Guest", isAdmin: false });
    expect(userCount()).toBe(before);
    expect(roleOf("guest")).toBe("participant");
  });

  test("tidak pernah menurunkan role", async () => {
    const res = await call("POST", "/invites/accept", { invite: inviteFor("viewer"), name: "O" }, cookieFor("owner"));
    expect(res.status).toBe(200);
    expect(roleOf("owner")).toBe("admin");
  });

  test("invite expired / tamper → 400 {error}", async () => {
    const expired = await call("POST", "/invites/accept", { invite: inviteFor("viewer", -1), name: "A" });
    expect(expired.status).toBe(400);
    expect(typeof ((await expired.json()) as { error: string }).error).toBe("string");
    expect((await call("POST", "/invites/accept", { invite: `${inviteFor("viewer")}x`, name: "A" })).status).toBe(400);
  });

  test("nama kosong / >60 → 400; room sudah dihapus → 404", async () => {
    expect((await call("POST", "/invites/accept", { invite: inviteFor("viewer"), name: "   " })).status).toBe(400);
    expect((await call("POST", "/invites/accept", { invite: inviteFor("viewer"), name: "a".repeat(61) })).status).toBe(400);
    const gone = createInvite({ roomId: "gone", role: "viewer", ttlSeconds: 60 }, config.sessionSecret);
    expect((await call("POST", "/invites/accept", { invite: gone, name: "A" })).status).toBe(404);
  });
});
