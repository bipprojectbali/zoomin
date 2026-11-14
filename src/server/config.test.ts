import { describe, expect, test } from "bun:test";
import { loadConfig } from "./config";

const PROD_SECRETS = {
  NODE_ENV: "production",
  LIVEKIT_API_KEY: "k", // test-only
  LIVEKIT_API_SECRET: "s", // test-only
  SESSION_SECRET: "x".repeat(32), // test-only
  ADMIN_PASSWORD: "p", // test-only
};

describe("loadConfig", () => {
  test("production tanpa secret LiveKit → throw", () => {
    expect(() => loadConfig({ NODE_ENV: "production" })).toThrow("LIVEKIT_API_KEY");
    expect(() => loadConfig({ ...PROD_SECRETS, LIVEKIT_API_SECRET: "" })).toThrow("LIVEKIT_API_SECRET");
  });

  test("production tanpa SESSION_SECRET / ADMIN_PASSWORD → throw", () => {
    expect(() => loadConfig({ ...PROD_SECRETS, SESSION_SECRET: undefined })).toThrow("SESSION_SECRET");
    expect(() => loadConfig({ ...PROD_SECRETS, SESSION_SECRET: "pendek" })).toThrow("minimal 32");
    expect(() => loadConfig({ ...PROD_SECRETS, ADMIN_PASSWORD: "  " })).toThrow("ADMIN_PASSWORD");
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
    expect(c.sessionSecret.length).toBeGreaterThanOrEqual(32);
  });

  test("override env terbaca", () => {
    const c = loadConfig({
      PORT: "0",
      DB_PATH: ":memory:",
      LIVEKIT_URL: "ws://lk:7880",
      PUBLIC_LIVEKIT_URL: "wss://lk.example.test",
      PUBLIC_APP_URL: "https://app.example.test",
      ADMIN_PASSWORD: "rahasia", // test-only
    });
    expect(c).toMatchObject({
      port: 0,
      dbPath: ":memory:",
      livekitUrl: "ws://lk:7880",
      publicLivekitUrl: "wss://lk.example.test",
      publicAppUrl: "https://app.example.test",
      adminPassword: "rahasia",
    });
  });

  test("PORT invalid → throw", () => {
    expect(() => loadConfig({ PORT: "abc" })).toThrow("PORT");
  });
});
