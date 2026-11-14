import { beforeEach, describe, expect, test } from "bun:test";
import { createTestDeps, createTestUser, TEST_SUPER_ADMIN_EMAIL } from "../../test/auth.helpers";
import type { AdminUser, ApiError, AppSettings, AuditEntry, Page, SessionUser, SystemHealth, UserResponse } from "../shared/api.types";
import { createApi } from "./api";
import type { ApiDeps } from "./api.deps";
import { recordAudit } from "./audit.repository";

type TestUser = { user: SessionUser; cookie: string };
let deps: ApiDeps;
let app: ReturnType<typeof createApi>;
let ana: TestUser;
let budi: TestUser;
let root: TestUser;

function setup(env: Record<string, string> = {}) {
  deps = createTestDeps(env);
  app = createApi(deps);
}

beforeEach(async () => {
  setup();
  ana = await createTestUser(deps, { email: "ana@example.test", name: "Ana" });
  budi = await createTestUser(deps, { email: "budi@example.test", name: "Budi", role: "admin" });
  root = await createTestUser(deps, { email: TEST_SUPER_ADMIN_EMAIL, name: "Root" });
});

function call(method: string, path: string, cookie?: string, body?: unknown) {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (cookie) headers.cookie = cookie;
  return app.handle(new Request(`http://localhost/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }));
}
const json = async <T>(res: Promise<Response>) => (await (await res).json()) as T;

// Body selalu eksplisit (undefined untuk GET): bun test.each menganggap parameter callback melebihi isi baris sebagai
// callback `done`, sehingga baris 2 elemen dengan callback 3 parameter menunggu done selamanya (timeout).
const ENDPOINTS: [string, string, unknown][] = [
  ["GET", "/dev/health", undefined],
  ["GET", "/dev/audit", undefined],
  ["GET", "/dev/settings", undefined],
  ["PUT", "/dev/settings", { allowedEmailDomains: [] }],
  ["GET", "/dev/config", undefined],
  ["PUT", "/dev/users/x/role", { role: "admin" }],
];

describe("akses /api/dev/*", () => {
  test.each(ENDPOINTS)("%s %s: tanpa sesi 401; user & admin 403 insufficient_role", async (method, path, body) => {
    expect((await call(method, path, undefined, body)).status).toBe(401);
    for (const who of [ana, budi]) {
      const res = await call(method, path, who.cookie, body);
      expect(res.status).toBe(403);
      expect(((await res.json()) as ApiError).code).toBe("insufficient_role");
    }
  });

  test("super_admin → 200 di endpoint baca", async () => {
    expect(root.user.role).toBe("super_admin");
    for (const path of ["/dev/health", "/dev/audit", "/dev/settings", "/dev/config"]) expect((await call("GET", path, root.cookie)).status).toBe(200);
  });
});

describe("GET /api/dev/health", () => {
  test("LiveKit dev lokal hidup → ok; hitungan DB dari user test", async () => {
    const health = await json<SystemHealth>(call("GET", "/dev/health", root.cookie));
    expect(health.livekit.ok).toBe(true);
    expect(health.db.users).toBe(3);
    expect(health.superAdminEmailsConfigured).toBe(1);
  });
});

describe("GET /api/dev/config", () => {
  test("tidak memuat nilai secret maupun email super admin", async () => {
    const secrets = {
      LIVEKIT_API_KEY: "lk-key-unik-7f3a9c", // test-only
      LIVEKIT_API_SECRET: "lk-secret-unik-91be42", // test-only
      BETTER_AUTH_SECRET: "auth-secret-unik-0123456789abcdef0123", // test-only
      GOOGLE_CLIENT_ID: "gid-unik-55aa.apps.googleusercontent.com", // test-only
      GOOGLE_CLIENT_SECRET: "gsecret-unik-c0ffee", // test-only
    };
    setup({ ...secrets, SUPER_ADMIN_EMAILS: `${TEST_SUPER_ADMIN_EMAIL},rahasia@example.test` });
    root = await createTestUser(deps, { email: TEST_SUPER_ADMIN_EMAIL });
    const res = await call("GET", "/dev/config", root.cookie);
    expect(res.status).toBe(200);
    const text = await res.text();
    for (const value of [...Object.values(secrets), "rahasia@example.test", TEST_SUPER_ADMIN_EMAIL]) expect(text).not.toContain(value);
    expect(JSON.parse(text)).toMatchObject({ LIVEKIT_API_SECRET: "diset", BETTER_AUTH_SECRET: "diset", SUPER_ADMIN_EMAILS: "2 email" });
  });
});

describe("/api/dev/settings", () => {
  test("PUT invalid → 400 invalid_input; valid → tersimpan + audit setting.update", async () => {
    const bad = await call("PUT", "/dev/settings", root.cookie, { allowedEmailDomains: ["bukan domain"] });
    expect(bad.status).toBe(400);
    expect((await bad.json()) as ApiError).toMatchObject({ code: "invalid_input", path: "/allowedEmailDomains/0" });
    expect((await call("PUT", "/dev/settings", root.cookie, { allowedEmailDomains: "contoh.id" })).status).toBe(400);

    const saved = await json<AppSettings>(call("PUT", "/dev/settings", root.cookie, { allowedEmailDomains: [" Contoh.ID "] }));
    expect(saved).toEqual({ allowedEmailDomains: ["contoh.id"] });
    expect(await json<AppSettings>(call("GET", "/dev/settings", root.cookie))).toEqual(saved);
    const audit = await json<Page<AuditEntry>>(call("GET", "/dev/audit?action=setting.update", root.cookie));
    expect(audit.items).toHaveLength(1);
    expect(audit.items[0]).toMatchObject({ actorId: root.user.id, targetType: "setting", detail: { before: [], after: ["contoh.id"] } });
  });
});

describe("PUT /api/dev/users/:id/role", () => {
  test("promote user→admin: admin bisa /api/admin/users; demote kembali → 403; audit user.role", async () => {
    const up = await call("PUT", `/dev/users/${ana.user.id}/role`, root.cookie, { role: "admin" });
    expect(up.status).toBe(200);
    expect(((await up.json()) as { user: AdminUser }).user).toMatchObject({ id: ana.user.id, role: "admin" });
    expect((await json<UserResponse>(call("GET", "/me", ana.cookie))).user.role).toBe("admin");
    expect((await call("GET", "/admin/users", ana.cookie)).status).toBe(200);

    expect((await json<{ user: AdminUser }>(call("PUT", `/dev/users/${ana.user.id}/role`, root.cookie, { role: "user" }))).user.role).toBe("user");
    expect((await json<UserResponse>(call("GET", "/me", ana.cookie))).user.role).toBe("user");
    expect((await call("GET", "/admin/users", ana.cookie)).status).toBe(403);

    const audit = await json<Page<AuditEntry>>(call("GET", `/dev/audit?action=user.role&actorId=${root.user.id}`, root.cookie));
    expect(audit.items.map((e) => e.detail)).toEqual([{ from: "admin", to: "user" }, { from: "user", to: "admin" }]);
  });

  test("body super_admin / role asing → 400; target super_admin lain → 403; diri sendiri → 403; tidak ada → 404", async () => {
    for (const role of ["super_admin", "root"]) {
      const res = await call("PUT", `/dev/users/${ana.user.id}/role`, root.cookie, { role });
      expect(res.status).toBe(400);
      expect(((await res.json()) as ApiError).code).toBe("invalid_input");
    }
    deps.db.query(`UPDATE "user" SET role = 'super_admin' WHERE id = ?`).run(budi.user.id);
    const other = await call("PUT", `/dev/users/${budi.user.id}/role`, root.cookie, { role: "user" });
    expect(other.status).toBe(403);
    expect(((await other.json()) as ApiError).code).toBe("insufficient_role");
    const self = await call("PUT", `/dev/users/${root.user.id}/role`, root.cookie, { role: "user" });
    expect(self.status).toBe(403);
    expect(((await self.json()) as ApiError).code).toBe("cannot_modify_self");
    const missing = await call("PUT", "/dev/users/tidak-ada/role", root.cookie, { role: "admin" });
    expect(missing.status).toBe(404);
    expect(((await missing.json()) as ApiError).code).toBe("user_not_found");
  });
});

describe("GET /api/dev/audit", () => {
  test("paginasi cursor tanpa duplikat; action asing / cursor rusak → 400", async () => {
    for (let i = 0; i < 5; i++) {
      recordAudit(deps.db, { actorId: root.user.id, actorEmail: TEST_SUPER_ADMIN_EMAIL, action: "room.create", targetType: "room", targetId: `r${i}`, detail: {} });
    }
    const first = await json<Page<AuditEntry>>(call("GET", "/dev/audit?limit=2", root.cookie));
    expect(first.items).toHaveLength(2);
    const second = await json<Page<AuditEntry>>(call("GET", `/dev/audit?limit=2&cursor=${first.nextCursor}`, root.cookie));
    const third = await json<Page<AuditEntry>>(call("GET", `/dev/audit?limit=2&cursor=${second.nextCursor}`, root.cookie));
    expect(third.nextCursor).toBeNull();
    const ids = [...first.items, ...second.items, ...third.items].map((e) => e.targetId);
    expect(new Set(ids).size).toBe(5);

    expect(((await json<ApiError>(call("GET", "/dev/audit?action=user.hack", root.cookie))) as ApiError).code).toBe("invalid_input");
    expect((await call("GET", "/dev/audit?action=user.hack", root.cookie)).status).toBe(400);
    expect((await call("GET", "/dev/audit?cursor=rusak", root.cookie)).status).toBe(400);
    expect((await call("GET", "/dev/audit?limit=0", root.cookie)).status).toBe(400);
  });
});
