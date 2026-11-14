import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Build binary host ke tmpdir lalu jalankan dari cwd tmpdir KOSONG dengan env minimal: bukti binary tidak butuh
// dist/, migrations/, node_modules, atau file repo lain. LiveKit tidak dibutuhkan (tidak ada panggilan ke LiveKit).
const ROOT = join(import.meta.dir, "..");
const work = mkdtempSync(join(tmpdir(), "zoomin-bin-"));
const outdir = join(work, "out");
const cwd = join(work, "empty");
const host = `${process.platform === "win32" ? "windows" : process.platform}-${process.arch}`;
const binary = join(outdir, `zoomin-${host}${process.platform === "win32" ? ".exe" : ""}`);

const SECRETS = {
  LIVEKIT_API_KEY: "bin-test-key", // test-only
  LIVEKIT_API_SECRET: "bin-test-secret-value", // test-only
  BETTER_AUTH_SECRET: "bin-test-auth-secret-0123456789abcdef", // test-only
  GOOGLE_CLIENT_ID: "bin-test-google-id", // test-only
  GOOGLE_CLIENT_SECRET: "bin-test-google-secret", // test-only
};
const BASE_ENV = { PATH: process.env.PATH ?? "", HOME: cwd, NO_COLOR: "1" };

beforeAll(() => {
  const build = Bun.spawnSync([process.execPath, "scripts/build.binary.ts", "--outdir", outdir], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
  if (build.exitCode !== 0) throw new Error(`build.binary gagal (exit ${build.exitCode}): ${build.stderr.toString()}`);
  mkdirSync(cwd);
}, 180_000);
afterAll(() => rmSync(work, { recursive: true, force: true }));

function run(args: string[], env: Record<string, string> = {}) {
  const r = Bun.spawnSync([binary, ...args], { cwd, env: { ...BASE_ENV, ...env }, stdout: "pipe", stderr: "pipe" });
  return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
}

describe("single binary", () => {
  test("binary terbentuk", () => {
    expect(existsSync(binary)).toBe(true);
  });

  test("--version, --help, --docs list, env", () => {
    expect(run(["--version"])).toMatchObject({ code: 0, out: expect.stringContaining("zoomin 0.1.0") });
    expect(run(["--help"])).toMatchObject({ code: 0, out: expect.stringContaining("migrate") });
    expect(run(["--docs", "list"])).toMatchObject({ code: 0, out: expect.stringContaining("deploy") });
    expect(run(["env"])).toMatchObject({ code: 0, out: expect.stringContaining("BETTER_AUTH_SECRET=") });
  });

  test("check: env valid → exit 0, secret tidak dicetak", () => {
    const r = run(["check"], SECRETS);
    expect(r.code).toBe(0);
    expect(r.out).toContain("production");
    for (const value of Object.values(SECRETS)) expect(r.out + r.err).not.toContain(value);
  });

  test("check: tanpa secret produksi → exit 1 + petunjuk, nilai yang ada tidak bocor", () => {
    const r = run(["check"], { BETTER_AUTH_SECRET: SECRETS.BETTER_AUTH_SECRET });
    expect(r.code).toBe(1);
    expect(r.err).toContain("LIVEKIT_API_KEY wajib diset");
    expect(r.err).toContain("zoomin env > .env");
    expect(r.out + r.err).not.toContain(SECRETS.BETTER_AUTH_SECRET);
  });

  test("migrate --db: pertama menerapkan 0001+0002, kedua sudah terbaru (tanpa secret)", () => {
    const db = join(work, "migrate.sqlite");
    const first = run(["migrate", "--db", db]);
    expect(first.code).toBe(0);
    for (const name of ["0001_init.sql", "0002_auth.sql"]) expect(first.out).toContain(name);
    expect(run(["migrate", "--db", db])).toMatchObject({ code: 0, out: expect.stringContaining("sudah terbaru") });
  });

  test("serve: SPA tertanam + API, header cache benar, SIGTERM → exit 0", async () => {
    const port = freePort();
    const proc = Bun.spawn([binary, "--port", String(port), "--host", "127.0.0.1", "--db", join(work, "serve.sqlite")], {
      cwd,
      env: { ...BASE_ENV, ...SECRETS },
      stdout: "pipe",
      stderr: "pipe",
    });
    try {
      const base = `http://127.0.0.1:${port}`;
      await waitFor(`${base}/api/health`);
      expect((await fetch(`${base}/api/health`)).status).toBe(200);
      // Better Auth (adapter bun:sqlite) jalan di binary hasil compile.
      expect(await (await fetch(`${base}/api/auth/ok`)).json()).toEqual({ ok: true });

      const index = await fetch(`${base}/`);
      expect(index.status).toBe(200);
      expect(index.headers.get("cache-control")).toBe("no-cache");
      const html = await index.text();
      const assets = [...html.matchAll(/(?:src|href)="(\/[^"]+\.(?:js|css))"/g)].map((m) => m[1] ?? "");
      expect(assets.some((a) => a.endsWith(".js"))).toBe(true);
      expect(assets.some((a) => a.endsWith(".css"))).toBe(true);
      for (const asset of assets) {
        const res = await fetch(base + asset);
        expect(res.status).toBe(200);
        expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
      }
      const js = assets.find((a) => a.endsWith(".js"));
      expect((await fetch(`${base}${js}.map`)).status).toBe(404);
      expect((await fetch(`${base}/x.js.map`)).status).toBe(404);
      expect((await fetch(`${base}/rooms/abc`)).headers.get("content-type")).toContain("text/html");

      proc.kill("SIGTERM");
      expect(await proc.exited).toBe(0);
      expect(await new Response(proc.stdout).text()).toContain(`http://127.0.0.1:${port}/`);
    } finally {
      proc.kill("SIGKILL");
    }
  }, 30_000);
});

/** Port bebas: bind port 0 sebentar lalu lepas. */
function freePort(): number {
  const s = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response() });
  const port = s.port!;
  s.stop(true);
  return port;
}

async function waitFor(url: string, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last: unknown;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return;
    } catch (cause) {
      last = cause;
    }
    await Bun.sleep(100);
  }
  throw new Error(`waitFor: ${url} tidak siap dalam ${timeoutMs} ms`, { cause: last });
}
