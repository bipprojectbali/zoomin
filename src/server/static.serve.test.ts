import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RoomServiceClient } from "livekit-server-sdk";
import type { ApiDeps } from "./api.deps";
import { loadConfig } from "./config";
import { openDb } from "./db";
import { createServer, toHttpUrl } from "./main";
import { DEFAULT_WEB_DIR, staticRoutes, WEB_DIST_DIR } from "./static.serve";

// Dist palsu (test-only): meniru output scripts/build.web.ts.
const dist = mkdtempSync(join(tmpdir(), "zoomin-dist-"));
writeFileSync(join(dist, "index.html"), '<!doctype html><div id="root"></div><script type="module" src="/index-abc123.js"></script>');
writeFileSync(join(dist, "index-abc123.js"), "console.log(1)");
writeFileSync(join(dist, "index-def456.css"), "body{}");
writeFileSync(join(dist, "index-abc123.js.map"), '{"sources":["secret.tsx"]}');
mkdirSync(join(dist, "sub"));
writeFileSync(join(dist, "sub", "logo-aa11.svg"), "<svg/>");

const base = loadConfig({ DB_PATH: ":memory:", HOST: "127.0.0.1" });
const config = { ...base, nodeEnv: "production" };
const deps: ApiDeps = {
  db: openDb(":memory:"),
  config,
  roomService: new RoomServiceClient(toHttpUrl(config.livekitUrl), config.livekitApiKey, config.livekitApiSecret),
};
const server = createServer(deps, 0, dist);
afterAll(() => {
  server.stop(true);
  rmSync(dist, { recursive: true, force: true });
});

const get = (path: string) => fetch(new URL(path, server.url));

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

  test("asset tidak dikenal → 404, bukan HTML", async () => {
    const res = await get("/index-zzz.js");
    expect(res.status).toBe(404);
  });

  test("sourcemap .map tidak disajikan → 404", async () => {
    const res = await get("/index-abc123.js.map");
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain("secret.tsx");
  });

  test("path traversal tidak pernah membaca file di luar whitelist dist", async () => {
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

test("dari source (bukan binary) SPA dibaca dari dist/web relatif cwd", () => {
  expect(DEFAULT_WEB_DIR).toBe(WEB_DIST_DIR);
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
