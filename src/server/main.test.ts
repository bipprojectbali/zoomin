import { afterAll, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { t } from "elysia";
import { RoomServiceClient } from "livekit-server-sdk";
import { createApi } from "./api";
import type { ApiDeps } from "./api.deps";
import { loadConfig } from "./config";
import { openDb } from "./db";
import { createServer, displayUrl, installShutdown, shutdown, toHttpUrl } from "./main";

const config = loadConfig({ DB_PATH: ":memory:", HOST: "127.0.0.1" });
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

  test("displayUrl: bind semua interface → localhost (secure context), selainnya apa adanya", () => {
    expect(displayUrl("0.0.0.0", 3000, false)).toBe("http://localhost:3000/");
    expect(displayUrl("::", 3000, true)).toBe("https://localhost:3000/");
    expect(displayUrl("127.0.0.1", 8080, false)).toBe("http://127.0.0.1:8080/");
    expect(displayUrl("100.64.0.1", 3000, true)).toBe("https://100.64.0.1:3000/");
    expect(displayUrl("::1", 3000, false)).toBe("http://[::1]:3000/");
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

describe("HOST + graceful shutdown", () => {
  test("Bun.serve listen di config.host", () => {
    expect(server.hostname).toBe("127.0.0.1");
  });

  test("shutdown: server.stop() dulu (tunggu), baru db.close()", async () => {
    const calls: string[] = [];
    const fakeServer = { stop: async () => void calls.push("stop") };
    const fakeDb = { close: () => void calls.push("close") };
    await shutdown(fakeServer, fakeDb, "SIGTERM");
    expect(calls).toEqual(["stop", "close"]);
  });

  test("installShutdown memasang SIGTERM & SIGINT; sinyal → shutdown lalu exit(0)", async () => {
    const listeners = new Map<string, () => void>();
    const exit = mock((_code?: number) => undefined as never);
    const close = mock(() => {});
    installShutdown({ stop: async () => {} }, { close }, { once: (s, l) => listeners.set(s, l), exit });
    expect([...listeners.keys()].sort()).toEqual(["SIGINT", "SIGTERM"]);
    listeners.get("SIGTERM")?.();
    await Bun.sleep(0);
    expect(close).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  test("stop gagal → exit(1), error tidak ditelan", async () => {
    const listeners = new Map<string, () => void>();
    const exit = mock((_code?: number) => undefined as never);
    const errorLog = console.error;
    console.error = () => {};
    installShutdown({ stop: async () => { throw new Error("boom"); } }, { close() {} }, { once: (s, l) => listeners.set(s, l), exit });
    listeners.get("SIGINT")?.();
    await Bun.sleep(0);
    console.error = errorLog;
    expect(exit).toHaveBeenCalledWith(1);
  });
});
