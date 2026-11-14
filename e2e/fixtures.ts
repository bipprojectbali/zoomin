/** Fixture & helper e2e: admin login via API, room unik per test, tamu di context terpisah, penjaga konsol. */
import { test as base, expect, type APIRequestContext, type Browser, type BrowserContextOptions, type Locator, type Page } from "@playwright/test";
import type { CreateInviteResponse, Role, UserResponse } from "../src/shared/api.types";

export { expect };

export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "e2e-admin-password"; // test-only
/** Identity & nama admin global (ADMIN_USER_ID / ADMIN_NAME di src/server/auth.route.ts). */
export const ADMIN_ID = "admin";
export const ADMIN_NAME = "Admin";

/** Pilihan pre-join; default semua mati (DEFAULT_MEDIA_PREFERENCES). */
export type MediaChoice = { mic?: boolean; camera?: boolean };

type Fixtures = {
  /** Id room unik per test (aman untuk SAFE_ID_PATTERN). */
  roomId: string;
  /** Page admin global yang sudah login dan room `roomId` sudah dibuat (via API). */
  admin: Page;
  /** Buka link undangan `role` di context baru, lewati pre-join, tunggu terhubung. */
  joinAs: (role: Role, name: string, media?: MediaChoice & { viewport?: BrowserContextOptions["viewport"] }) => Promise<Page>;
  /** Context tamu baru (IP palsu unik, penjaga konsol terpasang) untuk alur manual. */
  newGuestPage: (options?: BrowserContextOptions) => Promise<Page>;
  /** Izinkan pesan konsol error yang cocok untuk test ini (wajib beri alasan di pemanggil). */
  allowConsole: (...patterns: RegExp[]) => void;
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

/** Identity LiveKit user sesi page ini (= id user, lihat token.route.ts). */
export async function identityOf(page: Page): Promise<string> {
  const res = await page.request.get("/api/me");
  if (!res.ok()) throw new Error(`identityOf: GET /api/me HTTP ${res.status()}`);
  return ((await res.json()) as UserResponse).user.id;
}

/** Status koneksi mesin-terbaca (sr-only, data-status) di RoomPage. */
export const connectionStatus = (page: Page) => page.getByTestId("connection-status");

export async function expectConnected(page: Page): Promise<void> {
  await expect(connectionStatus(page)).toHaveAttribute("data-status", "connected");
}

/** Atur toggle pre-join (aria-pressed) lalu klik gabung. */
export async function passPreJoin(page: Page, media: MediaChoice = {}, name?: string): Promise<void> {
  await expect(page.getByTestId("prejoin")).toBeVisible();
  if (name !== undefined) await page.getByTestId("prejoin-name").fill(name);
  for (const [kind, want] of [["mic", media.mic], ["camera", media.camera]] as const) {
    if (want === undefined) continue;
    const toggle = page.getByTestId(`prejoin-toggle-${kind}`);
    if ((await toggle.getAttribute("aria-pressed")) !== String(want)) await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", String(want));
  }
  await page.getByTestId("prejoin-join").click();
}

/** Buka /rooms/:id langsung (admin) → pre-join → terhubung. */
export async function openRoom(page: Page, roomId: string, media: MediaChoice = {}): Promise<void> {
  await page.goto(`/rooms/${roomId}`);
  await passPreJoin(page, media);
  await expectConnected(page);
}

/** Root stage (`data-template` = template aktif). */
export const stage = (page: Page): Locator => page.getByTestId("stage");

/** Tile stage milik `identity` dengan nama track `trackName` (camera / screen-N; peserta tanpa kamera = avatar "camera"). */
export const tile = (scope: Page | Locator, identity: string, trackName: string): Locator =>
  scope.locator(`[data-testid="stage-tile"][data-identity="${identity}"][data-track-name="${trackName}"]`);

/** Tunggu video di tile benar-benar menerima frame (videoWidth > 0). */
export async function expectVideoFlowing(t: Locator): Promise<void> {
  const video = t.locator("video");
  await expect(video).toHaveCount(1);
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.videoWidth)).toBeGreaterThan(0);
}

/** Urutan tile di slot layout (`identity/trackName`, urut slot index); strip "Lainnya" tidak ikut. */
export function stageOrder(page: Page): Promise<string[]> {
  return page.locator('[data-testid="stage-tile"]:not([data-slot-index=""])').evaluateAll((els) =>
    els
      .map((el) => ({ i: Number(el.getAttribute("data-slot-index")), key: `${el.getAttribute("data-identity")}/${el.getAttribute("data-track-name")}` }))
      .sort((a, b) => a.i - b.i)
      .map((x) => x.key),
  );
}

/** Toast sonner yang memuat `text` (mis. nama peserta), tanpa bergantung pada kalimat lengkapnya. */
export const toast = (page: Page, text: string | RegExp): Locator => page.locator("[data-sonner-toast]").filter({ hasText: text });

/** Pilih item menu tile (⋯) berdasarkan label. */
export async function tileMenuAction(page: Page, t: Locator, label: string): Promise<void> {
  await t.hover();
  await t.getByTestId("tile-menu").click();
  await page.getByRole("menuitem", { name: label, exact: true }).click();
}

/**
 * IP klien palsu per context (rentang benchmark 198.18.0.0/15). Server e2e jalan dengan TRUST_PROXY=true, jadi tiap
 * context = klien berbeda; tanpa ini semua berbagi kuota rate limit 127.0.0.1 (login gagal, terima undangan).
 */
export const fakeClientIp = () => `198.18.${Math.floor(Math.random() * 256)}.${1 + Math.floor(Math.random() * 254)}`;

/**
 * Pesan konsol yang wajar di semua test.
 * - "Failed to load resource": Chromium otomatis mencatat respons non-2xx (mis. GET /api/me 401 = belum login,
 *   kondisi normal yang ditangani UI). Error API sendiri dicek lewat UI di tiap test.
 */
const GLOBAL_CONSOLE_ALLOW: RegExp[] = [/^Failed to load resource: the server responded with a status of (401|403|404)\b/];

/** Kumpulkan console.error + pageerror dari page app. */
function watchConsole(page: Page, sink: string[]): void {
  const where = () => page.url().replace(/^https?:\/\/[^/]+/, "");
  page.on("console", (msg) => {
    if (msg.type() === "error") sink.push(`[console.error ${where()}] ${msg.text()}`);
  });
  page.on("pageerror", (err) => sink.push(`[pageerror ${where()}] ${err.message}`));
}

async function newWatchedPage(browser: Browser, sink: string[], contexts: { close(): Promise<void> }[], options: BrowserContextOptions): Promise<Page> {
  const context = await browser.newContext({ ...options, extraHTTPHeaders: { "x-forwarded-for": fakeClientIp(), ...options.extraHTTPHeaders } });
  contexts.push(context);
  context.on("page", (p) => watchConsole(p, sink));
  return context.newPage();
}

type ConsoleGuard = { sink: string[]; allow: RegExp[] };

export const test = base.extend<Fixtures & { _consoleGuard: ConsoleGuard }>({
  // Context bawaan juga dapat IP unik: test login gagal tidak saling menghabiskan kuota.
  extraHTTPHeaders: async ({}, use) => use({ "x-forwarded-for": fakeClientIp() }),
  // Auto + dibuat paling awal → di-teardown paling akhir, setelah semua page/context ditutup.
  _consoleGuard: [
    async ({}, use, testInfo) => {
      const guard: ConsoleGuard = { sink: [], allow: [] };
      await use(guard);
      const allow = [...GLOBAL_CONSOLE_ALLOW, ...guard.allow];
      const unexpected = guard.sink.filter((line) => !allow.some((re) => re.test(line.replace(/^\[[^\]]*\] /, ""))));
      if (unexpected.length > 0) await testInfo.attach("console-errors", { body: unexpected.join("\n") });
      // Test yang sudah gagal tidak ditimpa error konsol (pesan aslinya lebih berguna); lampiran tetap ada.
      if (testInfo.status === testInfo.expectedStatus) expect(unexpected, "console.error/pageerror tak terduga").toEqual([]);
    },
    { auto: true },
  ],
  allowConsole: async ({ _consoleGuard }, use) => {
    await use((...p) => _consoleGuard.allow.push(...p));
  },
  context: async ({ context, _consoleGuard }, use) => {
    context.on("page", (p) => watchConsole(p, _consoleGuard.sink));
    await use(context);
  },
  roomId: async ({}, use, testInfo) => {
    const rand = Math.random().toString(36).slice(2, 8);
    await use(`e2e-w${testInfo.workerIndex}-${Date.now().toString(36)}-${rand}`);
  },
  admin: async ({ page, roomId }, use) => {
    await loginAdmin(page.request);
    await createRoom(page.request, roomId);
    await use(page);
  },
  newGuestPage: async ({ browser, permissions, _consoleGuard }, use) => {
    const contexts: { close(): Promise<void> }[] = [];
    await use((options = {}) => newWatchedPage(browser, _consoleGuard.sink, contexts, { permissions, ...options }));
    await Promise.all(contexts.map((c) => c.close()));
  },
  joinAs: async ({ admin, roomId, newGuestPage }, use) => {
    await use(async (role, name, media = {}) => {
      const url = await createInvite(admin.request, roomId, role);
      const { viewport, ...choice } = media;
      const page = await newGuestPage(viewport ? { viewport } : {});
      await page.goto(url);
      await passPreJoin(page, choice, name);
      await expect(page).toHaveURL(new RegExp(`/rooms/${roomId}$`));
      await expectConnected(page);
      return page;
    });
  },
});
