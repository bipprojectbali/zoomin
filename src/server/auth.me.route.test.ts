import { beforeEach, describe, expect, test } from "bun:test";
import { createTestDeps, createTestUser, TEST_SUPER_ADMIN_EMAIL } from "../../test/auth.helpers";
import type { ApiError, MySession, SessionUser, UserResponse } from "../shared/api.types";
import { createApi } from "./api";
import type { ApiDeps } from "./api.deps";

let deps: ApiDeps;
let app: ReturnType<typeof createApi>;
let ana: { user: SessionUser; cookie: string };

beforeEach(async () => {
  deps = createTestDeps();
  app = createApi(deps);
  ana = await createTestUser(deps, { email: "ana@example.test", name: "Ana" });
});

function call(method: string, path: string, cookie?: string, body?: unknown) {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (cookie) headers.cookie = cookie;
  return app.handle(new Request(`http://localhost/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }));
}
const json = async <T>(res: Promise<Response>) => (await (await res).json()) as T;
const sessionCount = (userId: string) => deps.db.query<{ n: number }, [string]>(`SELECT COUNT(*) AS n FROM "session" WHERE userId = ?`).get(userId)?.n;

describe("GET /api/me", () => {
  test("tanpa sesi / cookie palsu → 401; bersesi → SessionUser lengkap", async () => {
    expect((await call("GET", "/me")).status).toBe(401);
    expect((await call("GET", "/me", "better-auth.session_token=palsu.sig")).status).toBe(401);
    const { user } = await json<UserResponse>(call("GET", "/me", ana.cookie));
    expect(user).toEqual({ id: ana.user.id, name: "Ana", email: "ana@example.test", image: null, role: "user" });
  });
});

describe("PATCH /api/me", () => {
  test("ubah nama (trim) + image https; image null kembali kosong", async () => {
    const res = await call("PATCH", "/me", ana.cookie, { name: "  Ana Baru  ", image: "https://cdn.example.test/a.png" });
    expect(res.status).toBe(200);
    expect((await res.json()) as UserResponse).toMatchObject({ user: { name: "Ana Baru", image: "https://cdn.example.test/a.png" } });
    expect((await json<UserResponse>(call("PATCH", "/me", ana.cookie, { image: null }))).user.image).toBeNull();
    expect((await json<UserResponse>(call("GET", "/me", ana.cookie))).user.name).toBe("Ana Baru");
  });

  test.each([
    [{ name: "   " }, "/name"],
    [{ name: "a".repeat(61) }, "/name"],
    [{ image: "http://cdn.example.test/a.png" }, "/image"],
    [{ image: "javascript:alert(1)" }, "/image"],
    [{ image: "bukan url" }, "/image"],
  ])("input invalid %o → 400 invalid_input path %s", async (body, path) => {
    const res = await call("PATCH", "/me", ana.cookie, body);
    expect(res.status).toBe(400);
    expect((await res.json()) as ApiError).toMatchObject({ code: "invalid_input", path });
  });

  test("tidak bisa mengubah role/email lewat body; tanpa sesi → 401", async () => {
    const res = await call("PATCH", "/me", ana.cookie, { role: "super_admin", email: "x@y.test" });
    expect((await res.json()) as UserResponse).toMatchObject({ user: { role: "user", email: "ana@example.test" } });
    expect((await call("PATCH", "/me", undefined, { name: "X" })).status).toBe(401);
  });
});

describe("/api/me/sessions", () => {
  test("list: tandai sesi sekarang; DELETE :id sesi lain → 204; id asing → 404; DELETE semua selain current", async () => {
    const second = await createTestUser(deps, { email: "ana@example.test" });
    await createTestUser(deps, { email: "ana@example.test" });
    const { items } = await json<{ items: MySession[] }>(call("GET", "/me/sessions", ana.cookie));
    expect(items).toHaveLength(3);
    expect(items.filter((s) => s.current)).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: expect.any(String), createdAt: expect.any(Number), expiresAt: expect.any(Number) });

    const secondId = (await json<{ items: MySession[] }>(call("GET", "/me/sessions", second.cookie))).items.find((s) => s.current)!.id;
    expect((await call("DELETE", `/me/sessions/${secondId}`, ana.cookie)).status).toBe(204);
    expect((await call("GET", "/me", second.cookie)).status).toBe(401);

    const bob = await createTestUser(deps, { email: "bob@example.test" });
    const bobSession = (await json<{ items: MySession[] }>(call("GET", "/me/sessions", bob.cookie))).items[0]!.id;
    expect((await call("DELETE", `/me/sessions/${bobSession}`, ana.cookie)).status).toBe(404);
    expect((await call("GET", "/me", bob.cookie)).status).toBe(200);

    expect((await call("DELETE", "/me/sessions", ana.cookie)).status).toBe(204);
    expect(sessionCount(ana.user.id)).toBe(1);
    expect((await call("GET", "/me", ana.cookie)).status).toBe(200);
  });
});

describe("DELETE /api/me", () => {
  test("user → 204, akun + sesi + membership terhapus, room buatannya tetap", async () => {
    deps.db.run("INSERT INTO rooms (id, title, created_by, created_at) VALUES ('r1', 'R1', ?, 0)", [ana.user.id]);
    deps.db.run("INSERT INTO room_members (room_id, user_id, role) VALUES ('r1', ?, 'host')", [ana.user.id]);
    expect((await call("DELETE", "/me", ana.cookie)).status).toBe(204);
    expect((await call("GET", "/me", ana.cookie)).status).toBe(401);
    expect(deps.db.query(`SELECT 1 FROM "user" WHERE id = ?`).get(ana.user.id)).toBeNull();
    expect(sessionCount(ana.user.id)).toBe(0);
    expect(deps.db.query("SELECT created_by FROM rooms WHERE id = 'r1'").get()).toEqual({ created_by: null });
  });

  test("super_admin → 403 insufficient_role", async () => {
    const root = await createTestUser(deps, { email: TEST_SUPER_ADMIN_EMAIL });
    const res = await call("DELETE", "/me", root.cookie);
    expect(res.status).toBe(403);
    expect(((await res.json()) as ApiError).code).toBe("insufficient_role");
  });
});
