import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestDeps } from "../../test/auth.helpers";
import type { ApiDeps } from "./api.deps";
import { createServer } from "./main";
import { DEFAULT_WEB_DIR, resolveWebDir, staticRoutes, WEB_DIST_DIR } from "./static.serve";

// Dist palsu (test-only): meniru output scripts/build.web.ts.
const dist = mkdtempSync(join(tmpdir(), "zoomin-dist-"));
writeFileSync(join(dist, "index.html"), '<!doctype html><div id="root"></div><script type="module" src="/index-abc123.js"></script>');
writeFileSync(join(dist, "index-abc123.js"), "console.log(1)");
writeFileSync(join(dist, "index-def456.css"), "body{}");
writeFileSync(join(dist, "index-abc123.js.map"), '{"sources":["secret.tsx"]}');
mkdirSync(join(dist, "sub"));
writeFileSync(join(dist, "sub", "logo-aa11.svg"), "<svg/>");

const base = createTestDeps();
const deps: ApiDeps = { ...base, config: { ...base.config, nodeEnv: "production" } };
const server = createServer(deps, 0, dist);
afterAll(() => {
  server.stop(true);
  rmSync(dist, { recursive: true, force: true });
});

const get = (path: string, init?: RequestInit) => fetch(new URL(path, server.url), init);
/** Header navigasi browser (pindah halaman / reload). */
const NAV = { headers: { accept: "text/html,application/xhtml+xml,*/*;q=0.8" } };

async function expectIndex(res: Response): Promise<void> {
  expect(res.status).toBe(200);
  expect(res.headers.get("cache-control")).toBe("no-cache");
  expect(await res.text()).toContain('<div id="root">');
}

describe("produksi: SPA statis dari dist", () => {
  test("asset ber-hash → 200, content-type benar, cache immutable", async () => {
    for (const [path, type] of [["/index-abc123.js", "javascript"], ["/index-def456.css", "text/css"], ["/sub/logo-aa11.svg", "image/svg"]] as const) {
      const res = await get(path);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain(type);
      expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    }
  });

  test("/ dan route SPA → index.html no-cache", async () => {
    for (const path of ["/", "/login", "/rooms/abc", "/invite/tok"]) {
      const res = await get(path);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/html");
      expect(res.headers.get("cache-control")).toBe("no-cache");
      expect(await res.text()).toContain('<div id="root">');
    }
  });

  test("regresi: /invite/<token bertitik> (navigasi) → index.html, bukan 404", async () => {
    // Token undangan = base64url(payload).signature; dulu segmen bertitik dianggap aset → 404.
    for (const path of ["/invite/eyJyIjoiYWJjIn0.c2lnbmF0dXJl", "/invite/a.b.js", "/rooms/x.y"]) await expectIndex(await get(path, NAV));
  });

  test("non-navigasi, segmen bertitik tanpa ekstensi aset dikenal → index.html", async () => {
    for (const path of ["/invite/eyJyIjoiYWJjIn0.c2lnbmF0dXJl", "/rooms/v1.2"]) await expectIndex(await get(path));
  });

  test("HEAD navigasi → index.html", async () => {
    const res = await get("/invite/a.b", { method: "HEAD", ...NAV });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-cache");
  });

  test("/api tetap ke Elysia walau Accept text/html", async () => {
    expect((await get("/api/health", NAV)).status).toBe(200);
    expect((await get("/api/tidak.ada", NAV)).status).toBe(404);
  });

  test("asset tidak dikenal → 404, bukan HTML", async () => {
    expect((await get("/missing.js")).status).toBe(404);
    expect((await get("/fonts/x.WOFF2")).status).toBe(404);
    const res = await get("/index-zzz.js");
    expect(res.status).toBe(404);
  });

  test("sourcemap .map tidak disajikan → 404", async () => {
    expect((await get("/x.js.map")).status).toBe(404);
    const res = await get("/index-abc123.js.map");
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain("secret.tsx");
  });

  test("path traversal tidak pernah membaca file di luar dist", async () => {
    // Raw request lewat socket: fetch() menormalisasi ".." sebelum dikirim. Bun juga menormalisasi path di server,
    // jadi hasilnya 404 (segmen berekstensi) atau index.html SPA, tidak pernah isi file /etc/passwd.
    for (const path of ["/../../etc/passwd", "/%2e%2e/%2e%2e/etc/passwd", "/sub/..%2f..%2fetc%2fpasswd", "/../../etc/hosts.txt"]) {
      const head = await rawGet(path);
      expect(head).not.toContain("root:");
      expect(head).toMatch(/^HTTP\/1\.1 (400|404)|<div id="root">/);
    }
  });

  test("/api tetap ke Elysia", async () => {
    expect((await get("/api/health")).status).toBe(200);
    expect((await get("/api/tidak-ada")).status).toBe(404);
  });
});

describe("aset di-resolve per request (rebuild saat server jalan)", () => {
  // Layout test-only: <tmp>/web = dist, <tmp>/secret.txt + <tmp>/web-evil/x.js di luar dist.
  const tmp = mkdtempSync(join(tmpdir(), "zoomin-rebuild-"));
  const web = join(tmp, "web");
  mkdirSync(web);
  mkdirSync(join(tmp, "web-evil"));
  writeFileSync(join(web, "index.html"), '<div id="root"></div>');
  writeFileSync(join(tmp, "secret.txt"), "TOP-SECRET");
  writeFileSync(join(tmp, "web-evil", "x.js"), "TOP-SECRET");
  const handler = staticRoutes(web)["/*"]!;
  const call = (path: string, init?: RequestInit) => handler(new Request(`http://localhost${path}`, init));
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  test("file yang ditambah SETELAH handler dibuat → 200 immutable; yang dihapus → 404", async () => {
    expect(call("/index-new999.js").status).toBe(404);
    writeFileSync(join(web, "index-new999.js"), "console.log('new')");
    const res = call("/index-new999.js");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(await res.text()).toBe("console.log('new')");
    rmSync(join(web, "index-new999.js"));
    expect(call("/index-new999.js").status).toBe(404);
  });

  test("index.html yang ditulis ulang langsung tersaji", async () => {
    writeFileSync(join(web, "index.html"), '<div id="root">v2</div>');
    expect(await call("/", NAV).text()).toContain("v2");
  });

  test("traversal / encoded / di luar dist → tidak pernah membaca file luar", async () => {
    for (const path of ["/../secret.txt", "/%2e%2e/secret.txt", "/..%2fsecret.txt", "/sub/..%2f..%2fsecret.txt", "/%2e%2e%2fsecret.txt", "/..%5csecret.txt", "/../web-evil/x.js", "/%2e%2e/web-evil/x.js", "/x%00.js", "/%E0%A4%A.js"]) {
      for (const init of [undefined, NAV]) {
        const res = call(path, init);
        const body = await res.text();
        expect(body).not.toContain("TOP-SECRET");
        if (!init && path.endsWith(".js")) expect(res.status).toBe(404);
      }
    }
  });

  test("direktori dan index.html bukan aset", async () => {
    mkdirSync(join(web, "dir.js"));
    expect(call("/dir.js").status).toBe(404);
    expect(call("/index.html").headers.get("cache-control")).toBe("no-cache");
  });
});

test("dari source (bukan binary) SPA dibaca dari dist/web relatif cwd", () => {
  expect(DEFAULT_WEB_DIR).toBe(process.env.WEB_DIST_DIR?.trim() || WEB_DIST_DIR);
  expect(resolveWebDir({}, false)).toBe(WEB_DIST_DIR);
});

test("WEB_DIST_DIR menimpa direktori SPA (source & binary); kosong → default", () => {
  expect(resolveWebDir({ WEB_DIST_DIR: " /tmp/e2e/web " }, false)).toBe("/tmp/e2e/web");
  expect(resolveWebDir({ WEB_DIST_DIR: "/tmp/e2e/web" }, true)).toBe("/tmp/e2e/web");
  expect(resolveWebDir({ WEB_DIST_DIR: "  " }, false)).toBe(WEB_DIST_DIR);
  expect(resolveWebDir({}, true)).toEndWith("/web");
});

test("produksi tanpa dist → throw dengan petunjuk build", () => {
  expect(() => staticRoutes(join(dist, "tidak-ada"))).toThrow("jalankan `bun run build`");
  expect(() => createServer(deps, 0, join(dist, "tidak-ada"))).toThrow("index.html tidak ada");
});

/** GET dengan path apa adanya (tanpa normalisasi URL), kembalikan respons mentah. */
async function rawGet(path: string): Promise<string> {
  const { promise, resolve } = Promise.withResolvers<string>();
  let buf = "";
  await Bun.connect({
    hostname: "127.0.0.1",
    port: server.port!,
    socket: {
      open: (s) => void s.write(`GET ${path} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n`),
      data: (_s, chunk) => void (buf += chunk.toString()),
      close: () => resolve(buf),
    },
  });
  return promise;
}
