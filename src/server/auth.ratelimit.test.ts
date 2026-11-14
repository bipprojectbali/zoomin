import { afterAll, afterEach, describe, expect, setSystemTime, test } from "bun:test";
import { RoomServiceClient } from "livekit-server-sdk";
import { createApi } from "./api";
import type { ApiDeps } from "./api.deps";
import { createInvite } from "./auth.invite";
import { INVITE_ACCEPT_MAX, INVITE_ACCEPT_WINDOW_MS } from "./auth.invite.route";
import { CLIENT_IP_HEADER, clientIp, createRateLimiter } from "./auth.ratelimit";
import { ADMIN_LOGIN_MAX_FAILURES, ADMIN_LOGIN_WINDOW_MS } from "./auth.route";
import { loadConfig } from "./config";
import { openDb } from "./db";
import { createServer } from "./main";

const T0 = new Date("2026-01-01T00:00:00Z").getTime(); // test-only
afterEach(() => setSystemTime());

function makeApp(trustProxy = false) {
  const config = { ...loadConfig({ DB_PATH: ":memory:" }), trustProxy }; // test-only
  const deps: ApiDeps = {
    db: openDb(":memory:"),
    config,
    roomService: new RoomServiceClient("http://127.0.0.1:7880", config.livekitApiKey, config.livekitApiSecret),
  };
  deps.db.run("INSERT INTO users (id, name, is_admin, created_at) VALUES ('owner', 'Owner', 0, 0)");
  deps.db.run("INSERT INTO rooms (id, title, created_by, created_at) VALUES ('r1', 'Room 1', 'owner', 0)");
  return { app: createApi(deps), config };
}

const post = (app: ReturnType<typeof createApi>, path: string, body: unknown, headers: Record<string, string> = {}) =>
  app.handle(
    new Request(`http://localhost/api${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
  );
const ip = (addr: string) => ({ [CLIENT_IP_HEADER]: addr });

describe("createRateLimiter", () => {
  test("batas → retryAfter > 0; jendela berlalu → 0; entri kedaluwarsa dibersihkan", () => {
    setSystemTime(T0);
    const rl = createRateLimiter(2, 1000);
    rl.hit("a");
    expect(rl.retryAfter("a")).toBe(0);
    rl.hit("a");
    expect(rl.retryAfter("a")).toBe(1);
    expect(rl.retryAfter("b")).toBe(0);
    setSystemTime(T0 + 1000);
    expect(rl.retryAfter("a")).toBe(0);
    rl.hit("b"); // sweep: "a" kedaluwarsa dihapus
    expect(rl.size).toBe(1);
    rl.reset("b");
    expect(rl.size).toBe(0);
  });
});

describe("clientIp", () => {
  const req = new Request("http://x/", { headers: { "x-forwarded-for": "6.6.6.6, 1.2.3.4", ...ip("10.0.0.1") } });
  test("TRUST_PROXY false → XFF diabaikan, pakai IP peer", () => expect(clientIp(req, false)).toBe("10.0.0.1"));
  test("TRUST_PROXY true → entri XFF paling kanan", () => expect(clientIp(req, true)).toBe("1.2.3.4"));
});

describe("POST /auth/admin-login rate limit", () => {
  test("gagal berulang → 429 + Retry-After; IP lain terpisah; jendela berlalu → boleh lagi", async () => {
    setSystemTime(T0);
    const { app, config } = makeApp();
    for (let i = 0; i < ADMIN_LOGIN_MAX_FAILURES; i++) {
      expect((await post(app, "/auth/admin-login", { password: "salah" }, ip("1.1.1.1"))).status).toBe(401);
    }
    // Password benar pun ditolak saat terkunci.
    const blocked = await post(app, "/auth/admin-login", { password: config.adminPassword }, ip("1.1.1.1"));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBe(String(ADMIN_LOGIN_WINDOW_MS / 1000));
    expect(((await blocked.json()) as { error: string }).error).toContain("Coba lagi");
    expect((await post(app, "/auth/admin-login", { password: config.adminPassword }, ip("2.2.2.2"))).status).toBe(200);

    setSystemTime(T0 + ADMIN_LOGIN_WINDOW_MS);
    expect((await post(app, "/auth/admin-login", { password: config.adminPassword }, ip("1.1.1.1"))).status).toBe(200);
  });

  test("login sukses mereset hitungan gagal", async () => {
    const { app, config } = makeApp();
    for (let i = 0; i < ADMIN_LOGIN_MAX_FAILURES - 1; i++) await post(app, "/auth/admin-login", { password: "x" }, ip("3.3.3.3"));
    expect((await post(app, "/auth/admin-login", { password: config.adminPassword }, ip("3.3.3.3"))).status).toBe(200);
    for (let i = 0; i < ADMIN_LOGIN_MAX_FAILURES - 1; i++) {
      expect((await post(app, "/auth/admin-login", { password: "x" }, ip("3.3.3.3"))).status).toBe(401);
    }
  });

  test("TRUST_PROXY false: ganti XFF tidak menghindari batas; true: XFF jadi kunci", async () => {
    const strict = makeApp(false).app;
    for (let i = 0; i < ADMIN_LOGIN_MAX_FAILURES; i++) {
      await post(strict, "/auth/admin-login", { password: "x" }, { ...ip("4.4.4.4"), "x-forwarded-for": `9.9.9.${i}` });
    }
    const spoof = await post(strict, "/auth/admin-login", { password: "x" }, { ...ip("4.4.4.4"), "x-forwarded-for": "9.9.9.99" });
    expect(spoof.status).toBe(429);

    const proxied = makeApp(true).app;
    for (let i = 0; i < ADMIN_LOGIN_MAX_FAILURES; i++) {
      await post(proxied, "/auth/admin-login", { password: "x" }, { ...ip("127.0.0.1"), "x-forwarded-for": "5.5.5.5" });
    }
    const other = { ...ip("127.0.0.1"), "x-forwarded-for": "6.6.6.6" };
    expect((await post(proxied, "/auth/admin-login", { password: "x" }, other)).status).toBe(401);
    const same = { ...ip("127.0.0.1"), "x-forwarded-for": "5.5.5.5" };
    expect((await post(proxied, "/auth/admin-login", { password: "x" }, same)).status).toBe(429);
  });
});

describe("POST /invites/accept rate limit", () => {
  test(`> ${INVITE_ACCEPT_MAX}/jam per IP → 429 + Retry-After; jendela berlalu → boleh lagi`, async () => {
    setSystemTime(T0);
    const { app, config } = makeApp();
    const invite = createInvite({ roomId: "r1", role: "viewer", ttlSeconds: 7 * 24 * 3600 }, config.sessionSecret);
    for (let i = 0; i < INVITE_ACCEPT_MAX; i++) {
      expect((await post(app, "/invites/accept", { invite, name: `Tamu ${i}` }, ip("7.7.7.7"))).status).toBe(200);
    }
    const blocked = await post(app, "/invites/accept", { invite, name: "Spam" }, ip("7.7.7.7"));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBe(String(INVITE_ACCEPT_WINDOW_MS / 1000));
    expect((await post(app, "/invites/accept", { invite, name: "Lain" }, ip("8.8.8.8"))).status).toBe(200);
    setSystemTime(T0 + INVITE_ACCEPT_WINDOW_MS);
    expect((await post(app, "/invites/accept", { invite, name: "Lagi" }, ip("7.7.7.7"))).status).toBe(200);
  });
});

describe("main.ts meneruskan IP peer", () => {
  const { config } = makeApp();
  const deps: ApiDeps = {
    db: openDb(":memory:"),
    config,
    roomService: new RoomServiceClient("http://127.0.0.1:7880", config.livekitApiKey, config.livekitApiSecret),
  };
  const server = createServer(deps, 0);
  afterAll(() => server.stop(true));

  test("header internal kiriman klien ditimpa IP TCP asli", async () => {
    // Kunci login via server sungguhan: header palsu per request tidak boleh memisahkan hitungan.
    for (let i = 0; i < ADMIN_LOGIN_MAX_FAILURES; i++) {
      await fetch(new URL("/api/auth/admin-login", server.url), {
        method: "POST",
        headers: { "content-type": "application/json", [CLIENT_IP_HEADER]: `9.9.9.${i}` },
        body: JSON.stringify({ password: "x" }),
      });
    }
    const res = await fetch(new URL("/api/auth/admin-login", server.url), {
      method: "POST",
      headers: { "content-type": "application/json", [CLIENT_IP_HEADER]: "9.9.9.99" },
      body: JSON.stringify({ password: "x" }),
    });
    expect(res.status).toBe(429);
  });
});
