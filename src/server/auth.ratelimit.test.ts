import { afterAll, afterEach, describe, expect, setSystemTime, test } from "bun:test";
import { createTestDeps, createTestUser } from "../../test/auth.helpers";
import { createApi } from "./api";
import { createInvite } from "./auth.invite";
import { INVITE_ACCEPT_MAX, INVITE_ACCEPT_WINDOW_MS } from "./auth.invite.route";
import { CLIENT_IP_HEADER, clientIp, createRateLimiter } from "./auth.ratelimit";
import { createServer } from "./main";

const T0 = new Date("2026-01-01T00:00:00Z").getTime(); // test-only
afterEach(() => setSystemTime());

async function makeApp(trustProxy = false) {
  const deps = createTestDeps({ TRUST_PROXY: String(trustProxy) });
  const owner = await createTestUser(deps, { email: "owner@example.test", role: "admin" });
  deps.db.run("INSERT INTO rooms (id, title, created_by, created_at) VALUES ('r1', 'Room 1', ?, 0)", [owner.user.id]);
  return { app: createApi(deps), deps };
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
/** Batas Better Auth bawaan untuk /sign-in/* (aturan khusus: 3 per 10 detik). */
const SIGN_IN_MAX = 3;
const signIn = { provider: "google", callbackURL: "/app" };

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

describe("rate limit Better Auth (/api/auth/*)", () => {
  test("sign-in berulang dari satu IP → 429; IP lain terpisah; TRUST_PROXY false → XFF palsu tidak memisahkan", async () => {
    const { app } = await makeApp(false);
    for (let i = 0; i < SIGN_IN_MAX; i++) {
      await post(app, "/auth/sign-in/social", signIn, { ...ip("1.1.1.1"), "x-forwarded-for": `9.9.9.${i}` });
    }
    const blocked = await post(app, "/auth/sign-in/social", signIn, { ...ip("1.1.1.1"), "x-forwarded-for": "9.9.9.99" });
    expect(blocked.status).toBe(429);
    expect((await post(app, "/auth/sign-in/social", signIn, ip("2.2.2.2"))).status).not.toBe(429);
  });

  test("TRUST_PROXY true → entri XFF paling kanan jadi kunci", async () => {
    const { app } = await makeApp(true);
    const from = (xff: string) => ({ ...ip("127.0.0.1"), "x-forwarded-for": xff });
    for (let i = 0; i < SIGN_IN_MAX; i++) await post(app, "/auth/sign-in/social", signIn, from("5.5.5.5"));
    expect((await post(app, "/auth/sign-in/social", signIn, from("6.6.6.6"))).status).not.toBe(429);
    expect((await post(app, "/auth/sign-in/social", signIn, from("5.5.5.5"))).status).toBe(429);
  });
});

describe("POST /invites/accept rate limit", () => {
  test(`> ${INVITE_ACCEPT_MAX}/jam per IP → 429 + Retry-After; jendela berlalu → boleh lagi`, async () => {
    setSystemTime(T0);
    const { app, deps } = await makeApp();
    // setSystemTime sebelum membuat sesi: sesi Better Auth kedaluwarsa relatif ke jam palsu ini.
    const { cookie } = await createTestUser(deps, { email: "guest@example.test" });
    const invite = createInvite({ roomId: "r1", role: "viewer", ttlSeconds: 7 * 24 * 3600 }, deps.config.authSecret);
    const accept = (addr: string) => post(app, "/invites/accept", { invite }, { ...ip(addr), cookie });
    for (let i = 0; i < INVITE_ACCEPT_MAX; i++) expect((await accept("7.7.7.7")).status).toBe(200);
    const blocked = await accept("7.7.7.7");
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBe(String(INVITE_ACCEPT_WINDOW_MS / 1000));
    expect((await accept("8.8.8.8")).status).toBe(200);
    setSystemTime(T0 + INVITE_ACCEPT_WINDOW_MS);
    expect((await accept("7.7.7.7")).status).toBe(200);
  });
});

describe("main.ts meneruskan IP peer", () => {
  const server = createServer(createTestDeps(), 0);
  afterAll(() => server.stop(true));

  test("header internal kiriman klien ditimpa IP TCP asli (rate limit Better Auth tidak bisa diakali)", async () => {
    // Store rate limit memory Better Auth global per proses (kunci = IP + path). Path /sign-in/email (aturan /sign-in/*
    // yang sama) dipakai agar bucket 127.0.0.1 untuk /sign-in/social di main.test.ts tidak ikut habis.
    const signInVia = (fake: string) =>
      fetch(new URL("/api/auth/sign-in/email", server.url), {
        method: "POST",
        headers: { "content-type": "application/json", [CLIENT_IP_HEADER]: fake },
        body: JSON.stringify({ email: "a@example.test", password: "x" }),
      });
    for (let i = 0; i < SIGN_IN_MAX; i++) await signInVia(`9.9.9.${i}`);
    expect((await signInVia("9.9.9.99")).status).toBe(429);
  });
});
