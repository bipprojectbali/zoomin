/** Fixture & helper e2e: admin login via API, room unik per test, tamu di browser context terpisah. */
import { test as base, expect, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import type { CreateInviteResponse, Role } from "../src/shared/api.types";

export { expect };

export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "e2e-admin-password"; // test-only
/** Nama tampilan admin global (ADMIN_NAME di src/server/auth.route.ts). */
export const ADMIN_NAME = "Admin";

/** Label tile stage: `${nama} · ${jenis}` (StageTile.tsx + stage.labels.ts). */
export const KIND = { camera: "kamera", screen: (n: number) => `layar ${n}` };

type Fixtures = {
  /** Id room unik per test (aman untuk SAFE_ID_PATTERN). */
  roomId: string;
  /** Page admin global yang sudah login dan room `roomId` sudah dibuat (via API). */
  admin: Page;
  /** Buka link undangan `role` di context baru, isi nama, tunggu terhubung. */
  joinAs: (role: Role, name: string) => Promise<Page>;
};

async function apiOk<T>(res: Awaited<ReturnType<APIRequestContext["post"]>>, operation: string): Promise<T> {
  if (!res.ok()) throw new Error(`${operation}: HTTP ${res.status()} ${await res.text()}`);
  return (await res.json()) as T;
}

/** Login admin lewat API; cookie masuk ke context pemilik `request`. */
export async function loginAdmin(request: APIRequestContext): Promise<void> {
  await apiOk(await request.post("/api/auth/admin-login", { data: { password: ADMIN_PASSWORD } }), "admin-login");
}

export async function createRoom(request: APIRequestContext, id: string, title = `Room ${id}`): Promise<void> {
  await apiOk(await request.post("/api/rooms", { data: { id, title } }), `create room ${id}`);
}

export async function createInvite(request: APIRequestContext, roomId: string, role: Role): Promise<string> {
  const res = await apiOk<CreateInviteResponse>(
    await request.post(`/api/rooms/${roomId}/invites`, { data: { role } }),
    `create invite ${role} room ${roomId}`,
  );
  return res.url;
}

/** Badge status koneksi di header room. */
export const connectionStatus = (page: Page) => page.locator("header").getByRole("status");

/** Buka room dan tunggu status "Terhubung". */
export async function openRoom(page: Page, roomId: string): Promise<void> {
  await page.goto(`/rooms/${roomId}`);
  await expect(connectionStatus(page)).toHaveText("Terhubung");
}

/** Tile stage milik `name` berjenis `kind` (kamera / layar N). */
export const tile = (page: Page, name: string, kind: string): Locator =>
  page.locator("main").locator(`[aria-label="${name} · ${kind}"]`);

/** Tunggu video di tile benar-benar menerima frame (videoWidth > 0). */
export async function expectVideoFlowing(t: Locator): Promise<void> {
  const video = t.locator("video");
  await expect(video).toHaveCount(1);
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.videoWidth)).toBeGreaterThan(0);
}

/** Urutan label tile di slot layout (di luar strip "Lainnya"), sesuai urutan DOM = urutan slot. */
export function stageOrder(page: Page): Promise<string[]> {
  return page
    .locator('main [aria-label*=" · "]:not(section[aria-label="Lainnya"] *)')
    .evaluateAll((els) => els.map((el) => el.getAttribute("aria-label") ?? ""));
}

/**
 * IP klien palsu per tamu (rentang benchmark 198.18.0.0/15). Server e2e jalan dengan TRUST_PROXY=true, jadi tiap
 * tamu = klien berbeda seperti di produksi; tanpa ini semua tamu berbagi kuota rate limit 127.0.0.1
 * (INVITE_ACCEPT_MAX per jam) dan run berulang (`--repeat-each`) kena 429.
 */
const fakeClientIp = () => `198.18.${Math.floor(Math.random() * 256)}.${1 + Math.floor(Math.random() * 254)}`;

export const test = base.extend<Fixtures>({
  roomId: async ({}, use, testInfo) => {
    const rand = Math.random().toString(36).slice(2, 8);
    await use(`e2e-w${testInfo.workerIndex}-${Date.now().toString(36)}-${rand}`);
  },
  admin: async ({ page, roomId }, use) => {
    await loginAdmin(page.request);
    await createRoom(page.request, roomId);
    await use(page);
  },
  joinAs: async ({ browser, admin, roomId, permissions }, use) => {
    const contexts: Awaited<ReturnType<typeof browser.newContext>>[] = [];
    await use(async (role, name) => {
      const url = await createInvite(admin.request, roomId, role);
      const context = await browser.newContext({ permissions, extraHTTPHeaders: { "x-forwarded-for": fakeClientIp() } });
      contexts.push(context);
      const page = await context.newPage();
      await page.goto(url);
      await page.getByLabel("Nama tampilan").fill(name);
      await page.getByRole("button", { name: "Gabung" }).click();
      await expect(page).toHaveURL(new RegExp(`/rooms/${roomId}$`));
      await expect(connectionStatus(page)).toHaveText("Terhubung");
      return page;
    });
    await Promise.all(contexts.map((c) => c.close()));
  },
});
