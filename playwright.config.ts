/**
 * Config e2e browser (Playwright). Jalankan: `bun run test:e2e` (= `bunx --bun playwright test`).
 * Server app dinyalakan sendiri di port khusus dengan DB sementara; butuh LiveKit dev di ws://127.0.0.1:7880.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3101);
const BASE_URL = `http://localhost:${PORT}`;
/** Server kedua mode produksi (dist hasil `bun run build`), untuk regresi yang tak tampak di dev server. */
const PROD_PORT = Number(process.env.E2E_PROD_PORT ?? 3102);
const PROD_BASE_URL = `http://localhost:${PROD_PORT}`;
// Config dievaluasi ulang di tiap worker; env diwariskan dari proses utama, jadi folder DB sama untuk semua.
process.env.E2E_DB_DIR ??= mkdtempSync(join(tmpdir(), "zoomin-e2e-"));
/** Password admin test-only, hanya dipakai server e2e lokal. */
process.env.E2E_ADMIN_PASSWORD ??= "e2e-admin-password"; // test-only

export default defineConfig({
  testDir: "e2e",
  outputDir: "e2e/.artifacts/results",
  globalTeardown: "./e2e/global.teardown.ts",
  fullyParallel: true,
  // Tiap test membuka 2-3 klien WebRTC; 2 worker cukup cepat tanpa membuat LiveKit/CPU lokal jadi sumber flaky.
  workers: Number(process.env.E2E_WORKERS ?? 2),
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { outputFolder: "e2e/.artifacts/report", open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    permissions: ["camera", "microphone"],
  },
  projects: [
    {
      name: "chromium",
      testIgnore: "prod.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          // Kamera/mic palsu (pola uji Chromium) + auto-izin. Dengan kedua flag ini getDisplayMedia juga langsung
          // mengembalikan layar palsu tanpa picker, berulang kali (diverifikasi di Chromium 159 headless shell).
          args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
        },
      },
    },
    {
      name: "prod",
      testMatch: "prod.spec.ts",
      use: { ...devices["Desktop Chrome"], baseURL: PROD_BASE_URL },
    },
  ],
  webServer: [{
    command: "bun src/server/main.ts",
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      NODE_ENV: "development",
      PORT: String(PORT),
      DB_PATH: join(process.env.E2E_DB_DIR, "zoomin.sqlite"),
      ADMIN_PASSWORD: process.env.E2E_ADMIN_PASSWORD,
      PUBLIC_APP_URL: BASE_URL,
      // Tamu e2e mengirim X-Forwarded-For unik (e2e/fixtures.ts) agar rate limit per-IP berlaku per tamu.
      TRUST_PROXY: "true",
      LIVEKIT_URL: process.env.LIVEKIT_URL ?? "ws://127.0.0.1:7880",
    },
  }, {
    // Build dulu agar dist/web sesuai source; lalu start seperti `bun run start`.
    command: "bun run build && bun src/server/main.ts",
    url: `${PROD_BASE_URL}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NODE_ENV: "production",
      PORT: String(PROD_PORT),
      DB_PATH: join(process.env.E2E_DB_DIR, "zoomin-prod.sqlite"),
      ADMIN_PASSWORD: process.env.E2E_ADMIN_PASSWORD,
      PUBLIC_APP_URL: PROD_BASE_URL,
      TRUST_PROXY: "true",
      LIVEKIT_URL: process.env.LIVEKIT_URL ?? "ws://127.0.0.1:7880",
      // Secret wajib produksi; nilai test-only untuk LiveKit dev lokal (--dev: devkey/secret).
      LIVEKIT_API_KEY: "devkey", // test-only
      LIVEKIT_API_SECRET: "secret", // test-only
      SESSION_SECRET: "e2e-prod-session-secret-0123456789abcdef", // test-only
    },
  }],
});
