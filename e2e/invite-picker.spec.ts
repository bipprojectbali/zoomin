/**
 * Pemilih undangan (RND/plan/07 P1–P6 + 09 M1–M6): dropdown multi-select ber-checkbox, email manual tersimpan, tempel, form buat
 * room Private, tab Anggota (banyak sekaligus), Escape bertingkat di dialog, user banned tidak disarankan.
 */
import type { Locator, Page } from "@playwright/test";
import type { CreateRoomBody, RoomMemberItem } from "../src/shared/api.types";
import { expect, loginAdmin, loginAs, newIdentity, test, toast } from "./fixtures";

const card = (page: Page, roomId: string) => page.locator(`[data-testid="room-item"][data-room-id="${roomId}"]`);
const chip = (scope: Locator, email: string) => scope.locator(`[data-testid="invite-chip"][data-email="${email}"]`);
const option = (scope: Locator | Page, email: string) => scope.locator(`[data-testid="invite-picker-option"][data-email="${email}"]`);
/** Token unik per test di nama user agar pencarian (substring nama) tidak menemukan user test paralel. */
const tag = () => Math.random().toString(36).slice(2, 8);

/** Tempel teks ke input lewat ClipboardEvent sintetis (onPaste InvitePicker membaca clipboardData). */
async function paste(input: Locator, text: string): Promise<void> {
  await input.evaluate((el, value) => {
    const data = new DataTransfer();
    data.setData("text", value);
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, text);
}

/** Lobby → menu ⋯ kartu → Pengaturan → tab Anggota. */
async function openMembers(page: Page, roomId: string): Promise<Locator> {
  await page.goto("/app");
  await card(page, roomId).getByTestId("room-menu").click();
  await page.getByTestId("room-menu-settings").click();
  const dialog = page.getByTestId("room-settings-dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByTestId("room-settings-tab-members").click();
  return dialog;
}

/** Lobby → form buat room, mode Private, ID room diisi. */
async function privateForm(page: Page, roomId: string): Promise<Locator> {
  await page.goto("/app");
  const form = page.getByTestId("create-room-form");
  await form.getByLabel("Judul room").fill(`Picker ${roomId}`);
  await form.locator('[data-testid="visibility-option"][data-value="private"]').click();
  await form.getByText("Opsi lanjutan").click();
  await form.getByLabel("ID room").fill(roomId);
  return form;
}

test("buat room Private: centang beberapa akun, Tambah email manual, tempel (invalid & sisa kata cari tidak dikirim)", async ({ page, root, roomId, newGuestPage }) => {
  const t = tag();
  const registered = newIdentity(`Rina Picker ${t}`, "picker");
  const second = newIdentity(`Rudi Picker ${t}`, "picker");
  const registeredPage = await newGuestPage();
  await loginAs(registeredPage, registered);
  await loginAs(await newGuestPage(), second);
  const later = newIdentity(`Belum Login ${t}`, "later");
  const pastedA = newIdentity("Tempel A", "paste");
  const pastedB = newIdentity("Tempel B", "paste");

  await loginAdmin(page, root);
  const form = await privateForm(page, roomId);
  const input = form.getByTestId("invite-picker-input");

  // M1: fokus tanpa mengetik → dropdown terbuka berisi akun terdaftar.
  await input.click();
  await expect(input).toHaveAttribute("aria-expanded", "true");
  await expect(form.getByTestId("invite-picker-option").first()).toBeVisible();

  // M2: satu pencarian, centang dua akun; teks cari & dropdown tetap setelah toggle.
  const query = `picker ${t}`;
  await input.fill(query);
  await option(form, registered.email).click();
  await expect(input).toHaveValue(query);
  await expect(input).toHaveAttribute("aria-expanded", "true");
  await expect(option(form, registered.email)).toHaveAttribute("aria-selected", "true");
  await option(form, second.email).click();
  await expect(option(form, second.email)).toHaveAttribute("aria-selected", "true");
  await expect(input).toHaveValue(query);
  for (const who of [registered, second]) await expect(chip(form, who.email)).toBeVisible();
  // Hapus centang = hapus chip; centang lagi.
  await option(form, second.email).click();
  await expect(chip(form, second.email)).toHaveCount(0);
  await option(form, second.email).click();
  await expect(chip(form, second.email)).toBeVisible();

  // M3: email belum terdaftar → "Tambah <email>" → tercentang + masuk daftar tersimpan, input dikosongkan.
  await input.fill(later.email);
  await expect(form.getByTestId("invite-picker-manual")).toHaveText(`Tambah ${later.email}`);
  await form.getByTestId("invite-picker-manual").click();
  await expect(input).toHaveValue("");
  await expect(chip(form, later.email)).toHaveAttribute("data-invalid", "false");
  await expect(form.locator(`[data-testid="invite-picker-saved"][data-email="${later.email}"]`)).toHaveAttribute("aria-selected", "true");

  // Tempel banyak email (koma/spasi/baris baru) termasuk satu tidak valid dan satu duplikat.
  await paste(input, `${pastedA.email}, bukan-email\n${pastedB.email} ${later.email.toUpperCase()}`);
  await expect(chip(form, pastedA.email)).toHaveAttribute("data-invalid", "false");
  await expect(chip(form, pastedB.email)).toHaveAttribute("data-invalid", "false");
  await expect(chip(form, "bukan-email")).toHaveAttribute("data-invalid", "true");
  await expect(form.getByTestId("invite-chip")).toHaveCount(6);
  await expect(form.getByText("1 email tidak valid tidak akan dikirim.")).toBeVisible();

  // Sisa kata cari (tanpa "@") saat submit dibuang, bukan jadi chip tidak valid.
  await input.fill(query);
  const sent = page.waitForRequest((r) => r.method() === "POST" && r.url().endsWith("/api/rooms"));
  await form.getByRole("button", { name: "Buat room" }).click();
  const body = (await sent).postDataJSON() as CreateRoomBody;
  const expected = [registered.email, second.email, later.email, pastedA.email, pastedB.email];
  expect(body.members?.map((m) => m.email).sort()).toEqual(expected.sort());
  expect(body.members?.every((m) => m.role === "participant")).toBe(true);
  await expect(card(page, roomId).getByTestId("room-badge-private")).toBeVisible();

  const res = await page.request.get(`/api/rooms/${roomId}/members`);
  expect(res.status()).toBe(200);
  const items = ((await res.json()) as { items: RoomMemberItem[] }).items;
  for (const who of [registered, second]) expect(items.find((i) => i.email === who.email)?.kind).toBe("member");
  expect(items.find((i) => i.email === later.email)?.kind).toBe("pending");
  expect(items.some((i) => i.email === "bukan-email" || i.email.includes("picker "))).toBe(false);

  // User terdaftar langsung melihat room; email yang belum terdaftar melihatnya setelah login pertama (klaim R2).
  await registeredPage.goto("/app");
  await expect(card(registeredPage, roomId).getByTestId("room-badge-private")).toBeVisible();
  const laterPage = await newGuestPage();
  await loginAs(laterPage, later);
  await laterPage.goto("/app");
  await expect(card(laterPage, roomId).getByTestId("room-badge-private")).toBeVisible();
});

test("email manual tersimpan bertahan setelah reload dan bisa dihapus (sekaligus hapus centang)", async ({ page, root, roomId }) => {
  const manual = newIdentity("Manual Simpan", "saved");
  await loginAdmin(page, root);
  let form = await privateForm(page, roomId);
  let input = form.getByTestId("invite-picker-input");
  await input.fill(manual.email);
  await form.getByTestId("invite-picker-manual").click();
  await expect(chip(form, manual.email)).toBeVisible();

  await page.reload();
  form = await privateForm(page, roomId);
  input = form.getByTestId("invite-picker-input");
  await expect(form.getByTestId("invite-chip")).toHaveCount(0);
  await input.click();
  const saved = form.locator(`[data-testid="invite-picker-saved"][data-email="${manual.email}"]`);
  await expect(saved).toHaveAttribute("aria-selected", "false");
  await expect(saved).toContainText("Manual");
  await saved.click();
  await expect(saved).toHaveAttribute("aria-selected", "true");
  await expect(chip(form, manual.email)).toBeVisible();

  await saved.getByTestId("invite-picker-saved-remove").click();
  await expect(saved).toHaveCount(0);
  await expect(chip(form, manual.email)).toHaveCount(0);
  await page.reload();
  form = await privateForm(page, roomId);
  await form.getByTestId("invite-picker-input").click();
  await expect(form.locator(`[data-testid="invite-picker-saved"][data-email="${manual.email}"]`)).toHaveCount(0);
});

test("tab Anggota: tambah dua orang sekaligus → toast ringkasan", async ({ host, roomId }) => {
  const a = newIdentity("Dua A", "multi");
  const b = newIdentity("Dua B", "multi");
  const dialog = await openMembers(host, roomId);
  await paste(dialog.getByTestId("invite-picker-input"), `${a.email} ${b.email}`);
  await expect(dialog.getByTestId("invite-chip")).toHaveCount(2);
  await dialog.getByTestId("member-add").click();
  await expect(toast(host, "2 ditambahkan")).toBeVisible();
  await expect(dialog.getByTestId("invite-chip")).toHaveCount(0);
  for (const who of [a, b]) {
    await expect(dialog.locator(`[data-testid="member-row"][data-email="${who.email}"]`)).toHaveAttribute("data-kind", "pending");
  }
});

test("Escape: pertama menutup saran, kedua menutup dialog", async ({ host, roomId }) => {
  const dialog = await openMembers(host, roomId);
  const input = dialog.getByTestId("invite-picker-input");
  await input.fill("orang@contoh.test");
  await expect(input).toHaveAttribute("aria-expanded", "true");
  await expect(host.getByRole("listbox")).toBeVisible();

  await input.press("Escape");
  await expect(input).toHaveAttribute("aria-expanded", "false");
  await expect(host.getByRole("listbox")).toHaveCount(0);
  await expect(dialog).toBeVisible();

  await input.press("Escape");
  await expect(dialog).toBeHidden();
});

test("pencarian: user banned tidak disarankan; user biasa (bukan host) ditolak 403", async ({ host, root, roomId, playwright, baseURL }) => {
  const t = tag();
  const active = newIdentity(`Aktif Saran ${t}`, "active");
  const banned = newIdentity(`Banned Saran ${t}`, "banned");
  const plain = await playwright.request.newContext({ baseURL });
  const bannedCtx = await playwright.request.newContext({ baseURL });
  const bannedUser = await loginAs(bannedCtx, banned);
  await loginAs(plain, active);
  const ban = await root.post(`/api/admin/users/${bannedUser.id}/ban`, { data: { reason: "Uji saran e2e" } });
  expect(ban.status(), await ban.text()).toBe(200);

  const dialog = await openMembers(host, roomId);
  await dialog.getByTestId("invite-picker-input").fill(`saran ${t}`);
  await expect(option(dialog, active.email)).toBeVisible();
  await expect(option(dialog, banned.email)).toHaveCount(0);

  // UI picker hanya muncul untuk pengelola room (host → boleh cari) dan admin, jadi 403 tidak tercapai lewat UI;
  // kontrak API-nya tetap dicek di sini (useUserSearch mematikan saran bila 403).
  const res = await plain.get(`/api/users/search?q=${encodeURIComponent(`saran ${t}`)}`);
  expect(res.status()).toBe(403);
  expect(((await res.json()) as { code: string }).code).toBe("insufficient_role");
  await Promise.all([plain.dispose(), bannedCtx.dispose()]);
});
