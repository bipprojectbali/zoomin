/**
 * Room public ber-password (RND/plan/08-room-password.md): buat lewat form, gabung lewat ID + password, undangan +
 * password, rate limit, ganti/hapus password, dan room tanpa password / private lewat ID (tanpa form password).
 */
import type { Page } from "@playwright/test";
import { createInvite, expect, expectConnected, loginAdmin, loginAs, newIdentity, openRoom, passPreJoin, test } from "./fixtures";

const PASSWORD = "rahasia-e2e"; // test-only
const WRONG = "salah-total"; // test-only

/** Pesan UI (= CODE_TEXT di src/web/error.message.ts / TEXT room.connection.ts). */
const MSG = {
  invalid: "Wrong room password",
  rateLimited: /^Too many attempts\. Try again in \d+ (seconds?|minutes?)\.$/,
  notMember: "You're not a member of this room",
};

const card = (page: Page, roomId: string) => page.locator(`[data-testid="room-item"][data-room-id="${roomId}"]`);
const gate = (page: Page) => page.getByTestId("password-gate");

/** Jadikan room fixture (public) room password lewat API (alur form diuji di test pertama). */
async function setPassword(host: Page, roomId: string, password = PASSWORD): Promise<void> {
  const res = await host.request.patch(`/api/rooms/${roomId}`, { data: { visibility: "password", password } });
  expect(res.status(), await res.text()).toBe(200);
}

/** Context baru + user baru (bukan anggota). */
async function newUser(newGuestPage: () => Promise<Page>, name: string): Promise<Page> {
  const page = await newGuestPage();
  await loginAs(page, newIdentity(name, "guest"));
  return page;
}

/** Lobby → kolom "Join with room ID". */
async function joinById(page: Page, roomId: string): Promise<void> {
  await page.goto("/app");
  await page.getByTestId("join-by-id-input").fill(roomId);
  await page.getByTestId("join-by-id-submit").click();
  await expect(page).toHaveURL(new RegExp(`/rooms/${roomId}$`));
}

/** Isi gate lalu tunggu respons POST (join / accept) selesai; kembalikan status HTTP. */
async function submitGate(page: Page, password: string): Promise<number> {
  const response = page.waitForResponse((r) => r.request().method() === "POST" && /\/api\/(rooms\/[^/]+\/join|invites?\/)/.test(r.url()));
  await page.getByTestId("password-gate-input").fill(password);
  await page.getByTestId("password-gate-submit").click();
  return (await response).status();
}

async function openSettings(page: Page, roomId: string) {
  await page.goto("/app");
  await card(page, roomId).getByTestId("room-menu").click();
  await page.getByTestId("room-menu-settings").click();
  const dialog = page.getByTestId("room-settings-dialog");
  await dialog.getByTestId("room-settings-tab-general").click();
  return dialog;
}

test("buat room Password lewat form: password tampil sekali, kartu berbadge Password", async ({ page, root, roomId }) => {
  await loginAdmin(page, root);
  await page.goto("/app");
  const form = page.getByTestId("create-room-form");
  await form.getByLabel("Room title").fill(`Password ${roomId}`);
  await form.locator('[data-testid="visibility-option"][data-value="password"]').click();
  await form.getByTestId("password-field-generate").click();
  const generated = await form.getByTestId("password-field-input").inputValue();
  expect(generated).toHaveLength(10);
  await form.getByText("Advanced options").click();
  await form.getByLabel("Room ID").fill(roomId);
  await form.getByRole("button", { name: "Create room" }).click();

  const once = page.getByTestId("password-once-dialog");
  await expect(once.getByTestId("password-once-value")).toHaveText(generated);
  await once.getByRole("button", { name: "I've saved it" }).click();
  await expect(once).toHaveCount(0);
  await expect(card(page, roomId).getByTestId("room-badge-password")).toBeVisible();
  // Hash/password tidak pernah keluar lewat API (W7).
  expect(JSON.stringify(await (await page.request.get(`/api/rooms/${roomId}`)).json())).not.toContain(generated);
});

test("gabung lewat ID: gate, password salah ditolak, benar masuk; reload tanpa gate (sudah anggota)", async ({ host, roomId, newGuestPage }) => {
  await setPassword(host, roomId);
  const guest = await newUser(newGuestPage, "Tamu Password");
  await joinById(guest, roomId);
  await expect(gate(guest)).toBeVisible();

  expect(await submitGate(guest, WRONG)).toBe(403);
  await expect(guest.getByTestId("password-gate-error")).toContainText(MSG.invalid);

  expect(await submitGate(guest, PASSWORD)).toBe(200);
  await passPreJoin(guest);
  await expectConnected(guest);

  await guest.reload();
  await passPreJoin(guest);
  await expectConnected(guest);
  await expect(gate(guest)).toHaveCount(0);
});

test("undangan ke room password: gate di halaman undangan, password benar → diterima dan masuk", async ({ host, roomId, newGuestPage }) => {
  await setPassword(host, roomId);
  const url = await createInvite(host.request, roomId, "participant");
  const guest = await newUser(newGuestPage, "Tamu Undangan");
  await guest.goto(url);
  await expect(gate(guest)).toBeVisible();

  expect(await submitGate(guest, WRONG)).toBe(403);
  await expect(guest.getByTestId("password-gate-error")).toContainText(MSG.invalid);
  expect(await submitGate(guest, PASSWORD)).toBe(200);

  await passPreJoin(guest);
  await expect(guest).toHaveURL(new RegExp(`/rooms/${roomId}$`));
  await expectConnected(guest);
});

test("rate limit: 5 password salah, percobaan ke-6 dibatasi dan tombol dikunci", async ({ host, roomId, newGuestPage, allowConsole }) => {
  // Chromium mencatat respons 429 sebagai "Failed to load resource"; itu efek yang diuji.
  allowConsole(/status of 429/);
  await setPassword(host, roomId);
  const guest = await newUser(newGuestPage, "Tamu Penebak");
  await guest.goto(`/rooms/${roomId}`);
  await expect(gate(guest)).toBeVisible();

  for (let i = 0; i < 5; i++) expect(await submitGate(guest, `${WRONG}-${i}`)).toBe(403);
  expect(await submitGate(guest, PASSWORD)).toBe(429);
  await expect(guest.getByTestId("password-gate-error")).toHaveText(MSG.rateLimited);
  await expect(guest.getByTestId("password-gate-submit")).toBeDisabled();
});

test("ganti password: anggota lama tetap masuk tanpa gate, user baru butuh password baru", async ({ host, roomId, newGuestPage }) => {
  await setPassword(host, roomId);
  const old = await newUser(newGuestPage, "Anggota Lama");
  await old.goto(`/rooms/${roomId}`);
  expect(await submitGate(old, PASSWORD)).toBe(200);
  await expect(old.getByTestId("prejoin")).toBeVisible();

  const dialog = await openSettings(host, roomId);
  await dialog.getByTestId("change-password").click();
  await dialog.getByTestId("password-field-generate").click();
  const next = await dialog.getByTestId("password-field-input").inputValue();
  await dialog.getByTestId("room-settings-save").click();
  await expect(host.getByTestId("password-once-value")).toHaveText(next);

  await openRoom(old, roomId);
  await expect(gate(old)).toHaveCount(0);

  const fresh = await newUser(newGuestPage, "User Baru");
  await fresh.goto(`/rooms/${roomId}`);
  expect(await submitGate(fresh, PASSWORD)).toBe(403);
  await expect(fresh.getByTestId("password-gate-error")).toContainText(MSG.invalid);
  expect(await submitGate(fresh, next)).toBe(200);
  await passPreJoin(fresh);
  await expectConnected(fresh);
});

test("Password → Public: badge hilang, non-anggota lewat ID ditolak tanpa form password", async ({ host, roomId, newGuestPage }) => {
  await setPassword(host, roomId);
  const dialog = await openSettings(host, roomId);
  await dialog.locator('[data-testid="visibility-option"][data-value="public"]').click();
  await dialog.getByTestId("room-settings-save").click();
  await host.getByTestId("password-clear-confirm").click();
  await expect(card(host, roomId).getByTestId("room-badge-password")).toHaveCount(0);

  const guest = await newUser(newGuestPage, "Tamu Public");
  await joinById(guest, roomId);
  await expect(guest.getByTestId("room-status-screen")).toContainText(MSG.notMember);
  await expect(gate(guest)).toHaveCount(0);
  // Server juga menolak join password di room tanpa password (W5).
  expect((await guest.request.post(`/api/rooms/${roomId}/join`, { data: { password: PASSWORD } })).status()).toBe(403);
});

test("room private lewat ID: non-anggota ditolak tanpa form password", async ({ host, roomId, newGuestPage }) => {
  expect((await host.request.patch(`/api/rooms/${roomId}`, { data: { visibility: "private" } })).status()).toBe(200);
  const guest = await newUser(newGuestPage, "Tamu Private");
  await joinById(guest, roomId);
  await expect(guest.getByTestId("room-status-screen")).toContainText(MSG.notMember);
  await expect(gate(guest)).toHaveCount(0);
  const res = await guest.request.post(`/api/rooms/${roomId}/join`, { data: { password: PASSWORD } });
  expect(res.status()).toBe(403);
  expect(((await res.json()) as { code: string }).code).toBe("room_private");
});
