import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestDeps, createTestUser, TEST_SUPER_ADMIN_EMAIL } from "../../test/auth.helpers";
import { MIGRATIONS } from "./db";
import { createServerHooks, resolveEnv } from "./server.hooks";

const dir = mkdtempSync(join(tmpdir(), "zoomin-hooks-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const PROD = {
  NODE_ENV: "production",
  LIVEKIT_API_KEY: "k", // test-only
  LIVEKIT_API_SECRET: "hooks-secret-value", // test-only
  BETTER_AUTH_SECRET: "s".repeat(32), // test-only
  GOOGLE_CLIENT_ID: "gid", // test-only
  GOOGLE_CLIENT_SECRET: "google-secret-value", // test-only
};

describe("resolveEnv", () => {
  test("prioritas: flag CLI > env proses > --env-file", () => {
    const file = join(dir, "a.env");
    writeFileSync(file, "PORT=4000\nHOST=10.0.0.1\nGOOGLE_CLIENT_ID=dari-file\n");
    const env = resolveEnv({ envFile: file, host: "127.0.0.1", dbPath: "/tmp/x.sqlite" }, { GOOGLE_CLIENT_ID: "dari-env" }, false);
    expect(env).toMatchObject({ PORT: "4000", HOST: "127.0.0.1", DB_PATH: "/tmp/x.sqlite", GOOGLE_CLIENT_ID: "dari-env" });
    expect(resolveEnv({ port: 5000 }, { PORT: "1" }, false).PORT).toBe("5000");
  });

  test("--env-file tidak ada → throw dengan path", () => {
    expect(() => resolveEnv({ envFile: join(dir, "tidak-ada.env") }, {}, false)).toThrow("file env tidak ditemukan");
  });

  test("binary: NODE_ENV default production, tetap bisa dioverride eksplisit", () => {
    expect(resolveEnv({}, {}, true).NODE_ENV).toBe("production");
    expect(resolveEnv({}, { NODE_ENV: "development" }, true).NODE_ENV).toBe("development");
    expect(resolveEnv({}, {}, false).NODE_ENV).toBeUndefined();
  });

  test("tidak memutasi env asal", () => {
    const env = { PORT: "1" };
    resolveEnv({ port: 2 }, env, true);
    expect(env).toEqual({ PORT: "1" });
  });
});

describe("hooks", () => {
  test("check valid → ok + summary tanpa nilai secret", async () => {
    const result = await createServerHooks(PROD, false).check({});
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).not.toContain(PROD.LIVEKIT_API_SECRET);
    expect(JSON.stringify(result)).not.toContain(PROD.GOOGLE_CLIENT_SECRET);
  });

  test("check binary tanpa secret → error berisi petunjuk `zoomin env > .env`", async () => {
    const result = await createServerHooks({}, true).check({});
    expect(result).toEqual({ ok: false, errors: [expect.stringContaining("zoomin env > .env")] });
  });

  test("check: file TLS tidak ada → error", async () => {
    const result = await createServerHooks({ ...PROD, TLS_CERT_PATH: "/tidak/ada.pem", TLS_KEY_PATH: "/tidak/ada.key" }, false).check({});
    expect(result).toEqual({ ok: false, errors: [expect.stringContaining("TLS_CERT_PATH tidak ditemukan")] });
  });

  test("migrate: menerapkan lalu kosong; tidak butuh secret produksi", async () => {
    const hooks = createServerHooks({}, true);
    const dbPath = join(dir, "m.sqlite");
    expect(await hooks.migrate({ dbPath })).toEqual({ applied: MIGRATIONS.map((m) => m.name) });
    expect(await hooks.migrate({ dbPath })).toEqual({ applied: [] });
  });
});

describe("hooks.user (A11)", () => {
  test("list → promote admin/user → unban; super_admin & email tak dikenal ditolak", async () => {
    // Siapkan DB file berisi user Better Auth asli, lalu jalankan hooks seperti binary (tanpa secret produksi).
    const dbPath = join(dir, "users.sqlite");
    const deps = createTestDeps({ DB_PATH: dbPath });
    const ana = await createTestUser(deps, { email: "ana@example.test", name: "Ana" });
    await createTestUser(deps, { email: TEST_SUPER_ADMIN_EMAIL });
    deps.db.query(`UPDATE "user" SET banned = 1, banReason = 'spam' WHERE id = ?`).run(ana.user.id);
    deps.db.close();

    const hooks = createServerHooks({}, true);
    const list = await hooks.user({ dbPath }, { action: "list" });
    expect(list.map((u) => [u.email, u.role, u.banned]).sort()).toEqual([
      ["ana@example.test", "user", true],
      [TEST_SUPER_ADMIN_EMAIL, "super_admin", false],
    ]);
    expect(await hooks.user({ dbPath }, { action: "promote", email: "ANA@example.test", role: "admin" })).toMatchObject([{ role: "admin" }]);
    expect(await hooks.user({ dbPath }, { action: "promote", email: "ana@example.test", role: "user" })).toMatchObject([{ role: "user" }]);
    expect(await hooks.user({ dbPath }, { action: "unban", email: "ana@example.test" })).toMatchObject([{ banned: false }]);
    expect((await hooks.user({ dbPath }, { action: "list" })).find((u) => u.email === "ana@example.test")?.banned).toBe(false);
    await expect(hooks.user({ dbPath }, { action: "promote", email: TEST_SUPER_ADMIN_EMAIL, role: "user" })).rejects.toThrow("super_admin");
    await expect(hooks.user({ dbPath }, { action: "unban", email: "nope@example.test" })).rejects.toThrow("tidak ditemukan");
  });
});
