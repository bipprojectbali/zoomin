import { describe, expect, test } from "bun:test";
import { loadConfig, REQUIRED_IN_PRODUCTION } from "./config";

const PROD_SECRETS = {
  NODE_ENV: "production",
  LIVEKIT_API_KEY: "k", // test-only
  LIVEKIT_API_SECRET: "s", // test-only
  BETTER_AUTH_SECRET: "x".repeat(32), // test-only
  GOOGLE_CLIENT_ID: "gid", // test-only
  GOOGLE_CLIENT_SECRET: "gsecret", // test-only
};

describe("loadConfig", () => {
  test("production tanpa secret LiveKit → throw", () => {
    expect(() => loadConfig({ NODE_ENV: "production" })).toThrow("LIVEKIT_API_KEY");
    expect(() => loadConfig({ ...PROD_SECRETS, LIVEKIT_API_SECRET: "" })).toThrow("LIVEKIT_API_SECRET");
  });

  test("production tanpa BETTER_AUTH_SECRET / Google → throw; secret pendek → throw (juga di dev)", () => {
    expect(() => loadConfig({ ...PROD_SECRETS, BETTER_AUTH_SECRET: undefined })).toThrow("BETTER_AUTH_SECRET");
    expect(() => loadConfig({ ...PROD_SECRETS, BETTER_AUTH_SECRET: "pendek" })).toThrow("minimal 32");
    expect(() => loadConfig({ BETTER_AUTH_SECRET: "pendek" })).toThrow("minimal 32");
    expect(() => loadConfig({ ...PROD_SECRETS, GOOGLE_CLIENT_ID: "  " })).toThrow("GOOGLE_CLIENT_ID");
  });

  test("ADMIN_PASSWORD / SESSION_SECRET lama diabaikan (tidak ada lagi di Config)", () => {
    const c = loadConfig({ ...PROD_SECRETS, ADMIN_PASSWORD: "x", SESSION_SECRET: "y" });
    expect(Object.keys(c)).not.toContain("adminPassword");
    expect(Object.keys(c)).not.toContain("sessionSecret");
  });

  test("A14: BETTER_AUTH_URL ↔ PUBLIC_APP_URL saling mengisi bila hanya satu diset", () => {
    expect(loadConfig({ PUBLIC_APP_URL: "https://a.example.test" })).toMatchObject({ authUrl: "https://a.example.test", publicAppUrl: "https://a.example.test" });
    expect(loadConfig({ BETTER_AUTH_URL: "https://b.example.test" })).toMatchObject({ authUrl: "https://b.example.test", publicAppUrl: "https://b.example.test" });
    expect(loadConfig({ PUBLIC_APP_URL: "https://a.example.test", BETTER_AUTH_URL: "https://b.example.test" })).toMatchObject({
      authUrl: "https://b.example.test",
      publicAppUrl: "https://a.example.test",
    });
  });

  test("SUPER_ADMIN_EMAILS: koma, trim, lowercase, entri kosong dibuang", () => {
    expect(loadConfig({ SUPER_ADMIN_EMAILS: " Root@Example.test, ,b@x.test " }).superAdminEmails).toEqual(["root@example.test", "b@x.test"]);
    expect(loadConfig({}).superAdminEmails).toEqual([]);
  });

  test("ZOOMIN_TEST_AUTH: hanya '1' di non-production; production selalu nonaktif (A12)", () => {
    expect(loadConfig({}).testAuth).toBe(false);
    expect(loadConfig({ ZOOMIN_TEST_AUTH: "true" }).testAuth).toBe(false);
    expect(loadConfig({ ZOOMIN_TEST_AUTH: "1" }).testAuth).toBe(true);
    expect(loadConfig({ ...PROD_SECRETS, ZOOMIN_TEST_AUTH: "1" }).testAuth).toBe(false);
  });

  test("REQUIRED_IN_PRODUCTION sinkron: tiap nama yang hilang membuat production throw", () => {
    expect(Object.keys(PROD_SECRETS).filter((k) => k !== "NODE_ENV").sort()).toEqual([...REQUIRED_IN_PRODUCTION].sort());
    for (const name of REQUIRED_IN_PRODUCTION) {
      expect(() => loadConfig({ ...PROD_SECRETS, [name]: "" })).toThrow(`${name} wajib diset`);
    }
  });

  test("production lengkap → lolos", () => {
    const c = loadConfig(PROD_SECRETS);
    expect(c.nodeEnv).toBe("production");
    expect(c.livekitApiKey).toBe("k");
  });

  test("dev → default", () => {
    const c = loadConfig({});
    expect(c).toMatchObject({
      nodeEnv: "development",
      port: 3000,
      dbPath: "./data/zoomin.sqlite",
      livekitUrl: "ws://127.0.0.1:7880",
      publicLivekitUrl: "ws://127.0.0.1:7880",
      livekitApiKey: "devkey",
      livekitApiSecret: "secret",
      publicAppUrl: "http://localhost:3000",
    });
    expect(c.authSecret.length).toBeGreaterThanOrEqual(32);
    expect(c).toMatchObject({ authUrl: "http://localhost:3000", googleClientId: "", googleClientSecret: "", testAuth: false });
  });

  test("override env terbaca", () => {
    const c = loadConfig({
      PORT: "0",
      DB_PATH: ":memory:",
      LIVEKIT_URL: "ws://lk:7880",
      PUBLIC_LIVEKIT_URL: "wss://lk.example.test",
      PUBLIC_APP_URL: "https://app.example.test",
      GOOGLE_CLIENT_ID: "gid", // test-only
    });
    expect(c).toMatchObject({
      port: 0,
      dbPath: ":memory:",
      livekitUrl: "ws://lk:7880",
      publicLivekitUrl: "wss://lk.example.test",
      publicAppUrl: "https://app.example.test",
      googleClientId: "gid",
    });
  });

  test("PORT invalid → throw", () => {
    expect(() => loadConfig({ PORT: "abc" })).toThrow("PORT");
  });

  test("TLS: keduanya diset → aktif, tidak diset → undefined, salah satu → throw", () => {
    expect(loadConfig({ TLS_CERT_PATH: "c.pem", TLS_KEY_PATH: "k.pem" }).tls).toEqual({ certPath: "c.pem", keyPath: "k.pem" });
    expect(loadConfig({}).tls).toBeUndefined();
    expect(() => loadConfig({ TLS_CERT_PATH: "c.pem" })).toThrow("TLS_KEY_PATH");
    expect(() => loadConfig({ TLS_KEY_PATH: "k.pem", TLS_CERT_PATH: " " })).toThrow("bersamaan");
  });

  test("TRUST_PROXY default false; hanya 'true' yang mengaktifkan", () => {
    expect(loadConfig({}).trustProxy).toBe(false);
    expect(loadConfig({ TRUST_PROXY: "1" }).trustProxy).toBe(false);
    expect(loadConfig({ TRUST_PROXY: "true" }).trustProxy).toBe(true);
  });
  test("HOST: default 0.0.0.0, bisa dioverride (mis. 127.0.0.1 di belakang proxy)", () => {
    expect(loadConfig({}).host).toBe("0.0.0.0");
    expect(loadConfig({ HOST: " 127.0.0.1 " }).host).toBe("127.0.0.1");
  });
});
