import { describe, expect, test } from "bun:test";
import { loadConfig } from "../server/config";
import { COMMANDS } from "./cli.args";
import { summarizeConfig } from "./cli.check";
import { DOCS_TOPICS } from "./cli.docs";
import { APP_VERSION, type CliServerHooks, runCli } from "./cli.run";

/** IO palsu yang merekam stdout/stderr. */
function fakeIo(opts: { isTTY?: boolean; env?: Record<string, string> } = {}) {
  const io = { stdout: "", stderr: "", isTTY: opts.isTTY ?? false, env: opts.env ?? {} };
  return { ...io, io: { out: (s: string) => void (io.stdout += s), err: (s: string) => void (io.stderr += s), isTTY: io.isTTY, env: io.env }, get: () => io };
}

const noopHooks: CliServerHooks = {
  serve: async () => {},
  migrate: async () => ({ applied: [] }),
  check: async () => ({ ok: true, summary: {} }),
  healthcheck: async () => "http://127.0.0.1:3000/api/health",
  user: async () => [],
};

async function run(argv: string[], hooks: CliServerHooks = noopHooks, opts?: Parameters<typeof fakeIo>[0]) {
  const f = fakeIo(opts);
  const code = await runCli(argv, f.io, hooks);
  return { code, ...f.get() };
}

describe("runCli", () => {
  test("--version: versi package.json + bun/os-arch", async () => {
    const { code, stdout } = await run(["--version"]);
    expect(code).toBe(0);
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(stdout).toBe(`zoomin ${APP_VERSION}\nbun ${Bun.version} ${process.platform}-${process.arch}\n`);
  });

  test("--help memuat semua perintah dan flag", async () => {
    const { code, stdout } = await run(["--help"]);
    expect(code).toBe(0);
    for (const c of COMMANDS) expect(stdout).toContain(`  ${c}`);
    for (const flag of ["-p, --port", "-H, --host", "--db", "--env-file", "-v, --version", "-h, --help", "-d, --docs", "Usage:", "Examples:"]) {
      expect(stdout).toContain(flag);
    }
  });

  test.each(["serve", "migrate", "check", "healthcheck", "user", "env", "docs", "help"])("bantuan per perintah: %s", async (cmd) => {
    const { code, stdout } = await run([cmd, "--help"]);
    expect(code).toBe(0);
    expect(stdout).toStartWith(`zoomin ${cmd} - `);
    if (cmd === "user") for (const flag of ["--role", "--db", "--env-file"]) expect(stdout).toContain(flag);
    if (cmd === "serve" || cmd === "check") for (const flag of ["--port", "--host", "--db", "--env-file"]) expect(stdout).toContain(flag);
  });

  test("help topik tak dikenal → exit 2", async () => {
    const { code, stderr } = await run(["help", "nope"]);
    expect(code).toBe(2);
    expect(stderr).toContain("Tidak ada bantuan");
  });

  test.each(Object.keys(DOCS_TOPICS))("--docs %s tidak kosong", async (topic) => {
    const { code, stdout } = await run(["--docs", topic]);
    expect(code).toBe(0);
    expect(stdout.trim().length).toBeGreaterThan(50);
  });

  test("isi docs: default usage, env memuat semua var, api memuat endpoint", async () => {
    expect((await run(["-d"])).stdout).toContain("Quick start");
    const env = (await run(["-d", "env"])).stdout;
    for (const v of ["PORT", "HOST", "DB_PATH", "BETTER_AUTH_SECRET", "SUPER_ADMIN_EMAILS", "TRUST_PROXY", "TLS_KEY_PATH"]) expect(env).toContain(`\`${v}\``);
    expect(env).toMatch(/`BETTER_AUTH_SECRET` \| \(kosong\) \| ya/);
    expect(env).not.toContain("ADMIN_PASSWORD");
    expect((await run(["docs", "api"])).stdout).toContain("/api/rooms/:roomId/token");
    expect((await run(["-d", "deploy"])).stdout).toContain("Caddy");
  });

  test("docs topik tak dikenal → exit 2 dengan daftar topik", async () => {
    const { code, stderr } = await run(["--docs", "nope"]);
    expect(code).toBe(2);
    for (const t of Object.keys(DOCS_TOPICS)) expect(stderr).toContain(t);
  });

  test("env mencetak .env.example", async () => {
    const { code, stdout } = await run(["env"]);
    expect(code).toBe(0);
    expect(stdout).toContain("BETTER_AUTH_SECRET=");
    expect(stdout).not.toContain("SESSION_SECRET=");
  });

  test("healthcheck: sehat → exit 0 + URL; gagal → exit 1 + alasan", async () => {
    const ok = await run(["healthcheck"]);
    expect([ok.code, ok.stdout]).toEqual([0, "OK http://127.0.0.1:3000/api/health\n"]);
    const bad = await run(["healthcheck"], { ...noopHooks, healthcheck: async () => { throw new Error("status 503"); } });
    expect(bad.code).toBe(1);
    expect(bad.stderr).toContain("zoomin healthcheck gagal: status 503");
  });

  test("argumen salah → stderr + exit 2, hooks tidak dipanggil", async () => {
    let called = false;
    const { code, stderr, stdout } = await run(["--bogus"], { ...noopHooks, serve: async () => void (called = true) });
    expect([code, called, stdout]).toEqual([2, false, ""]);
    expect(stderr).toContain("--help");
  });

  test("serve meneruskan overrides ke hooks", async () => {
    let got: unknown;
    const code = (await run(["-p", "4000", "--db", "a.sqlite"], { ...noopHooks, serve: async (o) => void (got = o) })).code;
    expect(code).toBe(0);
    expect(got).toEqual({ port: 4000, dbPath: "a.sqlite" });
  });

  test("migrate: daftar migrasi / sudah terbaru / error hook → exit 1", async () => {
    expect((await run(["migrate"], { ...noopHooks, migrate: async () => ({ applied: ["001_init.sql"] }) })).stdout).toContain("001_init.sql");
    expect((await run(["migrate"])).stdout).toContain("sudah terbaru");
    const failed = await run(["migrate"], { ...noopHooks, migrate: async () => Promise.reject(new Error("disk penuh")) });
    expect(failed.code).toBe(1);
    expect(failed.stderr).toContain("zoomin migrate gagal: disk penuh");
  });

  test("check invalid → exit 1 dengan daftar error", async () => {
    const { code, stderr } = await run(["check"], { ...noopHooks, check: async () => ({ ok: false, errors: ["BETTER_AUTH_SECRET kurang"] }) });
    expect(code).toBe(1);
    expect(stderr).toContain("BETTER_AUTH_SECRET kurang");
  });

  test("check tidak pernah mencetak nilai secret", async () => {
    const secrets = {
      LIVEKIT_API_KEY: "lkkey-UNIQ-7f3a91",
      LIVEKIT_API_SECRET: "lksec-UNIQ-b2c8d4",
      BETTER_AUTH_SECRET: "ba-UNIQ-0123456789abcdef0123456789",
      GOOGLE_CLIENT_ID: "gid-UNIQ-1a2b3c",
      GOOGLE_CLIENT_SECRET: "gsec-UNIQ-4d5e6f",
    }; // test-only
    const config = loadConfig({ NODE_ENV: "production", PORT: "3100", SUPER_ADMIN_EMAILS: "boss-UNIQ@example.test", ...secrets });
    const { code, stdout, stderr } = await run(["check"], { ...noopHooks, check: async () => ({ ok: true, summary: summarizeConfig(config) }) });
    expect(code).toBe(0);
    for (const value of Object.values(secrets)) expect(stdout + stderr).not.toContain(value);
    expect(stdout).toMatch(/BETTER_AUTH_SECRET\s+diset/);
    expect(stdout).toMatch(/SUPER_ADMIN_EMAILS\s+1 email/);
    expect(stdout).not.toContain("boss-UNIQ");
    for (const field of ["3100", "0.0.0.0", "production", "TLS", "TRUST_PROXY", "PUBLIC_APP_URL", "LIVEKIT_URL"]) expect(stdout).toContain(field);
  });

  test("user list/promote/unban: meneruskan aksi + overrides ke hooks dan mencetak hasil", async () => {
    const calls: unknown[] = [];
    const row = { id: "u1", email: "ana@example.test", name: "Ana", role: "admin", banned: false, createdAt: "2026-01-01T00:00:00.000Z" };
    const hooks: CliServerHooks = { ...noopHooks, user: async (o, a) => (calls.push([o, a]), [row]) };
    const list = await run(["user", "list", "--db", "x.sqlite"], hooks);
    expect(list.code).toBe(0);
    for (const s of ["EMAIL", "PERAN", "ana@example.test", "admin", "aktif"]) expect(list.stdout).toContain(s);
    expect((await run(["user", "promote", "ana@example.test", "--role", "admin"], hooks)).stdout).toContain("ana@example.test sekarang admin");
    expect((await run(["user", "unban", "ana@example.test"], hooks)).stdout).toContain("tidak lagi diblokir");
    expect(calls).toEqual([
      [{ dbPath: "x.sqlite" }, { action: "list" }],
      [{}, { action: "promote", email: "ana@example.test", role: "admin" }],
      [{}, { action: "unban", email: "ana@example.test" }],
    ]);
    expect((await run(["user", "list"])).stdout).toContain("Belum ada user");
    const failed = await run(["user", "unban", "x@y.test"], { ...noopHooks, user: async () => Promise.reject(new Error("user dengan email x@y.test tidak ditemukan")) });
    expect([failed.code, failed.stderr.includes("zoomin user gagal: user dengan email x@y.test tidak ditemukan")]).toEqual([1, true]);
  });

  test("warna ANSI hanya bila TTY dan NO_COLOR tidak diset", async () => {
    expect((await run(["--help"], noopHooks, { isTTY: true })).stdout).toContain("\x1b[");
    expect((await run(["--help"], noopHooks, { isTTY: true, env: { NO_COLOR: "1" } })).stdout).not.toContain("\x1b[");
    expect((await run(["--help"], noopHooks, { isTTY: false })).stdout).not.toContain("\x1b[");
  });
});
