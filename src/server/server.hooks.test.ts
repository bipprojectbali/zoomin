import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServerHooks, resolveEnv } from "./server.hooks";

const dir = mkdtempSync(join(tmpdir(), "zoomin-hooks-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const PROD = {
  NODE_ENV: "production",
  LIVEKIT_API_KEY: "k", // test-only
  LIVEKIT_API_SECRET: "hooks-secret-value", // test-only
  SESSION_SECRET: "s".repeat(32), // test-only
  ADMIN_PASSWORD: "p", // test-only
};

describe("resolveEnv", () => {
  test("prioritas: flag CLI > env proses > --env-file", () => {
    const file = join(dir, "a.env");
    writeFileSync(file, "PORT=4000\nHOST=10.0.0.1\nADMIN_PASSWORD=dari-file\n");
    const env = resolveEnv({ envFile: file, host: "127.0.0.1", dbPath: "/tmp/x.sqlite" }, { ADMIN_PASSWORD: "dari-env" }, false);
    expect(env).toMatchObject({ PORT: "4000", HOST: "127.0.0.1", DB_PATH: "/tmp/x.sqlite", ADMIN_PASSWORD: "dari-env" });
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
    expect(await hooks.migrate({ dbPath })).toEqual({ applied: ["0001_init.sql"] });
    expect(await hooks.migrate({ dbPath })).toEqual({ applied: [] });
  });
});
