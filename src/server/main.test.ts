import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { t } from "elysia";
import { RoomServiceClient } from "livekit-server-sdk";
import { createApi } from "./api";
import type { ApiDeps } from "./api.deps";
import { loadConfig } from "./config";
import { openDb } from "./db";
import { createServer, toHttpUrl } from "./main";

const config = loadConfig({ DB_PATH: ":memory:" });
const deps: ApiDeps = {
  db: openDb(":memory:"),
  config,
  // Tidak dipanggil di test ini; hanya memenuhi tipe.
  roomService: new RoomServiceClient(toHttpUrl(config.livekitUrl), config.livekitApiKey, config.livekitApiSecret),
};
const server = createServer(deps, 0);
afterAll(() => server.stop(true));

describe("main server", () => {
  test("GET /api/health → 200", async () => {
    const res = await fetch(new URL("/api/health", server.url));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  test("GET /rooms/abc → HTML SPA (client-side routing)", async () => {
    const res = await fetch(new URL("/rooms/abc", server.url));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain('<div id="root">');
  });

  test("GET /api/tidak-ada → 404, bukan HTML", async () => {
    const res = await fetch(new URL("/api/tidak-ada", server.url));
    expect(res.status).toBe(404);
  });
});

describe("createApi onError", () => {
  test("validasi Elysia 422 → 400 {error, path}", async () => {
    const app = createApi(deps).post("/echo", ({ body }) => body, { body: t.Object({ id: t.String() }) });
    const res = await app.handle(
      new Request("http://localhost/api/echo", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; path?: string };
    expect(body.path).toBe("/id");
    expect(typeof body.error).toBe("string");
  });

  test("toHttpUrl", () => {
    expect(toHttpUrl("ws://127.0.0.1:7880")).toBe("http://127.0.0.1:7880");
    expect(toHttpUrl("wss://lk.example.test")).toBe("https://lk.example.test");
  });
});

// Butuh `openssl` untuk membuat sertifikat self-signed sementara; tanpa itu test TLS dilewati.
const hasOpenssl = Bun.which("openssl") !== null;

describe("main server TLS", () => {
  test.skipIf(!hasOpenssl)("TLS_CERT_PATH + TLS_KEY_PATH → HTTPS /api/health 200", async () => {
    const dir = mkdtempSync(join(tmpdir(), "zoomin-tls-"));
    try {
      const certPath = join(dir, "cert.pem");
      const keyPath = join(dir, "key.pem");
      const gen = Bun.spawnSync(
        ["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=localhost",
          "-keyout", keyPath, "-out", certPath],
        { stderr: "pipe" },
      );
      if (gen.exitCode !== 0) throw new Error(`openssl gagal membuat sertifikat: ${gen.stderr.toString()}`);
      const tlsServer = createServer({ ...deps, config: { ...config, tls: { certPath, keyPath } } }, 0);
      try {
        const res = await fetch(`https://localhost:${tlsServer.port}/api/health`, { tls: { rejectUnauthorized: false } });
        expect(res.status).toBe(200);
      } finally {
        tlsServer.stop(true);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("file sertifikat tidak ada → throw saat start", () => {
    const missing = { certPath: "/tidak/ada/cert.pem", keyPath: "/tidak/ada/key.pem" };
    expect(() => createServer({ ...deps, config: { ...config, tls: missing } }, 0)).toThrow("TLS_CERT_PATH tidak ditemukan");
  });
});
