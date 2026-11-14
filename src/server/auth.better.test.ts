import { describe, expect, test } from "bun:test";
import { createTestDeps, createTestUser, TEST_SUPER_ADMIN_EMAIL } from "../../test/auth.helpers";
import type { ApiError } from "../shared/api.types";
import { createApi } from "./api";
import type { ApiDeps } from "./api.deps";
import { ALLOWED_EMAIL_DOMAINS_KEY, createAuth, getAllowedEmailDomains, isEmailDomainAllowed, syncedRole } from "./auth.better";

/** Simulasi tabel app_settings milik migrasi 0003 (gelombang 2) dengan kontrak kolom dari spec. */
function setAllowedDomains(deps: ApiDeps, valueJson: string) {
  deps.db.run("CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at INTEGER, updated_by TEXT)");
  deps.db.run("INSERT OR REPLACE INTO app_settings (key, value_json) VALUES (?, ?)", [ALLOWED_EMAIL_DOMAINS_KEY, valueJson]);
}

const me = (deps: ApiDeps, cookie: string) => createApi(deps).handle(new Request("http://localhost/api/me", { headers: { cookie } }));
const roleInDb = (deps: ApiDeps, email: string) =>
  deps.db.query<{ role: string }, [string]>(`SELECT role FROM "user" WHERE email = ?`).get(email)?.role;

describe("aturan murni", () => {
  test("syncedRole: email di daftar → super_admin; super_admin dicabut → user; admin tetap; null/asing → user", () => {
    expect(syncedRole("Root@Example.test", "user", ["root@example.test"])).toBe("super_admin");
    expect(syncedRole("old@example.test", "super_admin", ["root@example.test"])).toBe("user");
    expect(syncedRole("a@example.test", "admin", [])).toBe("admin");
    expect(syncedRole("a@example.test", null, [])).toBe("user");
    expect(syncedRole("a@example.test", "owner", [])).toBe("user");
  });

  test("isEmailDomainAllowed: daftar kosong = semua; cocok domain persis (case-insensitive), bukan subdomain/akhiran", () => {
    expect(isEmailDomainAllowed("a@x.test", [])).toBe(true);
    expect(isEmailDomainAllowed("a@Kantor.test", ["kantor.test"])).toBe(true);
    expect(isEmailDomainAllowed("a@evilkantor.test", ["kantor.test"])).toBe(false);
    expect(isEmailDomainAllowed("a@sub.kantor.test", ["kantor.test"])).toBe(false);
  });

  test("getAllowedEmailDomains defensif: tabel belum ada / baris kosong / JSON rusak / bukan array → []", () => {
    const deps = createTestDeps();
    expect(getAllowedEmailDomains(deps.db)).toEqual([]);
    deps.db.run("CREATE TABLE app_settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at INTEGER, updated_by TEXT)");
    expect(getAllowedEmailDomains(deps.db)).toEqual([]);
    const warn = console.warn;
    console.warn = () => {};
    setAllowedDomains(deps, "{rusak");
    expect(getAllowedEmailDomains(deps.db)).toEqual([]);
    console.warn = warn;
    setAllowedDomains(deps, '{"a":1}');
    expect(getAllowedEmailDomains(deps.db)).toEqual([]);
    setAllowedDomains(deps, '[" Kantor.test ", 5, ""]');
    expect(getAllowedEmailDomains(deps.db)).toEqual(["kantor.test"]);
  });
});

describe("hook Better Auth", () => {
  test("A4: email SUPER_ADMIN_EMAILS jadi super_admin saat dibuat; dicabut dari env → turun ke user saat sesi berikutnya", async () => {
    const deps = createTestDeps();
    const root = await createTestUser(deps, { email: TEST_SUPER_ADMIN_EMAIL });
    expect(root.user.role).toBe("super_admin");
    // Env baru tanpa email ini, DB yang sama (simulasi restart dengan SUPER_ADMIN_EMAILS diubah).
    const { config } = createTestDeps({ SUPER_ADMIN_EMAILS: "" });
    const after = { ...deps, config, auth: createAuth({ db: deps.db, config }) };
    const again = await createTestUser(after, { email: TEST_SUPER_ADMIN_EMAIL });
    expect(again.user.role).toBe("user");
    expect(roleInDb(deps, TEST_SUPER_ADMIN_EMAIL)).toBe("user");
  });

  test("A4: user lama yang emailnya ditambahkan ke daftar → super_admin saat login berikutnya; admin tetap admin", async () => {
    const deps = createTestDeps({ SUPER_ADMIN_EMAILS: "" });
    await createTestUser(deps, { email: "later@example.test" });
    await createTestUser(deps, { email: "adm@example.test", role: "admin" });
    const { config } = createTestDeps({ SUPER_ADMIN_EMAILS: "LATER@example.test" });
    const next = { ...deps, config, auth: createAuth({ db: deps.db, config }) };
    expect((await createTestUser(next, { email: "later@example.test" })).user.role).toBe("super_admin");
    expect((await createTestUser(next, { email: "adm@example.test" })).user.role).toBe("admin");
  });

  test("A9: domain tak diizinkan → user baru & login user lama ditolak (email_domain_not_allowed); super_admin dikecualikan", async () => {
    const deps = createTestDeps();
    const old = await createTestUser(deps, { email: "lama@luar.test" });
    setAllowedDomains(deps, '["kantor.test"]');
    await expect(createTestUser(deps, { email: "baru@luar.test" })).rejects.toMatchObject({ body: { code: "email_domain_not_allowed" } });
    await expect(createTestUser(deps, { email: "lama@luar.test" })).rejects.toMatchObject({ body: { code: "email_domain_not_allowed" } });
    expect(deps.db.query(`SELECT 1 FROM "user" WHERE email = 'baru@luar.test'`).get()).toBeNull();
    expect((await createTestUser(deps, { email: "ok@kantor.test" })).user.role).toBe("user");
    expect((await createTestUser(deps, { email: TEST_SUPER_ADMIN_EMAIL })).user.role).toBe("super_admin");
    // Sesi lama yang sudah ada tetap berlaku sampai habis/dicabut (aturan hanya saat login).
    expect((await me(deps, old.cookie)).status).toBe(200);
  });

  test("A6: user di-ban → sesi baru ditolak plugin admin (BANNED_USER); sesi lama → 403 banned; ban kedaluwarsa → boleh lagi", async () => {
    const deps = createTestDeps();
    const u = await createTestUser(deps, { email: "nakal@example.test" });
    deps.db.query(`UPDATE "user" SET banned = 1, banReason = 'spam' WHERE id = ?`).run(u.user.id);
    await expect(createTestUser(deps, { email: "nakal@example.test" })).rejects.toMatchObject({ body: { code: "BANNED_USER" } });
    const res = await me(deps, u.cookie);
    expect(res.status).toBe(403);
    expect(((await res.json()) as ApiError).code).toBe("banned");

    deps.db.query(`UPDATE "user" SET banExpires = ? WHERE id = ?`).run(new Date(Date.now() - 1000).toISOString(), u.user.id);
    expect((await me(deps, u.cookie)).status).toBe(200);
    expect((await createTestUser(deps, { email: "nakal@example.test" })).user.id).toBe(u.user.id);
    expect(deps.db.query<{ banned: number }, [string]>(`SELECT banned FROM "user" WHERE id = ?`).get(u.user.id)?.banned).toBe(0);
  });
});
