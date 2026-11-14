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
/**
 * Build SPA project prod ke folder sementara (bukan dist/web): server produksi lain yang sedang jalan dari repo ini
 * membaca daftar file dist sekali saat start, jadi menimpa dist/web membuat index.html-nya merujuk chunk yang terhapus.
 */
const PROD_WEB_DIR = join(process.env.E2E_DB_DIR, "web");
const LIVEKIT_URL = process.env.E2E_LIVEKIT_URL ?? "ws://127.0.0.1:7880";
/**
 * Env bersama server e2e. SEMUA variabel config.ts diset eksplisit: `bunx --bun playwright` memuat `.env` repo ke
 * proses Playwright dan webServer mewarisi process.env, jadi tanpa ini server e2e memakai LiveKit/secret/URL dari
 * `.env` developer (pernah: PUBLIC_LIVEKIT_URL produksi → semua join "Server sedang bermasalah"). Nilai test-only.
 */
const BASE_ENV = {
  HOST: "0.0.0.0",
  LIVEKIT_URL,
  PUBLIC_LIVEKIT_URL: LIVEKIT_URL,
  // LiveKit dev lokal (--dev): devkey/secret.
  LIVEKIT_API_KEY: "devkey", // test-only
  LIVEKIT_API_SECRET: "secret", // test-only
  BETTER_AUTH_SECRET: "e2e-better-auth-secret-0123456789abcdef", // test-only
  BETTER_AUTH_URL: "", // kosong → ikut PUBLIC_APP_URL (A14)
  SUPER_ADMIN_EMAILS: "root@e2e.test", // test-only, = SUPER_ADMIN_EMAIL di e2e/fixtures.ts
  // POST /api/test/login (A12); production mengabaikannya (prod.spec.ts membuktikan 404).
  ZOOMIN_TEST_AUTH: "1",
  // Tamu e2e mengirim X-Forwarded-For unik (e2e/fixtures.ts) agar rate limit per-IP berlaku per tamu.
  TRUST_PROXY: "true",
  TLS_CERT_PATH: "",
  TLS_KEY_PATH: "",
  WEB_DIST_DIR: "",
};

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
    // --no-env-file: lapis kedua, server tidak memuat .env sendiri.
    command: "bun --no-env-file src/server/main.ts",
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      ...BASE_ENV,
      NODE_ENV: "development",
      PORT: String(PORT),
      DB_PATH: join(process.env.E2E_DB_DIR, "zoomin.sqlite"),
      PUBLIC_APP_URL: BASE_URL,
      // Dev tanpa Google: tombol login tetap tampil (A12: e2e tidak memanggil Google).
      GOOGLE_CLIENT_ID: "",
      GOOGLE_CLIENT_SECRET: "",
    },
  }, {
    // Build dulu ke PROD_WEB_DIR agar sesuai source (tanpa menyentuh dist/web); lalu start seperti `bun run start`.
    command: `bun --no-env-file scripts/build.web.ts --outdir "${PROD_WEB_DIR}" && bun --no-env-file src/server/main.ts`,
    url: `${PROD_BASE_URL}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...BASE_ENV,
      NODE_ENV: "production",
      PORT: String(PROD_PORT),
      DB_PATH: join(process.env.E2E_DB_DIR, "zoomin-prod.sqlite"),
      WEB_DIST_DIR: PROD_WEB_DIR,
      WEB_OUT_DIR: PROD_WEB_DIR,
      PUBLIC_APP_URL: PROD_BASE_URL,
      // Wajib di production; Google tidak pernah dipanggil e2e.
      GOOGLE_CLIENT_ID: "e2e-client-id.apps.googleusercontent.com", // test-only
      GOOGLE_CLIENT_SECRET: "e2e-client-secret", // test-only
    },
  }],
});
