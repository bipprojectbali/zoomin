/**
 * Akses room (RND/plan/06-room-access.md): public/private, anggota per email (pending), aktif/nonaktif, kadaluarsa,
 * hapus, menu pengelola, dan panel /admin. Tombol Undang di dalam meeting sengaja tidak diuji di sini.
 */
import type { APIRequestContext, Page } from "@playwright/test";
import type { RoomRole, RoomVisibility } from "../src/shared/api.types";
import { createInvite, expect, expectConnected, loginAdmin, loginAs, newIdentity, openRoom, passPreJoin, test, toast } from "./fixtures";

/** Pesan Indonesia (= CODE_TEXT di src/web/error.message.ts). */
const MSG = {
  private: "Room ini privat",
  inactive: "Room ini sedang dinonaktifkan",
  lastHost: "Room harus punya minimal satu host",
};

const card = (page: Page, roomId: string) => page.locator(`[data-testid="room-item"][data-room-id="${roomId}"]`);
const memberRow = (page: Page, email: string) => page.locator(`[data-testid="member-row"][data-email="${email}"]`);

/** POST /api/rooms dengan tipe (setup cepat; alur form diuji di test pertama). */
async function apiCreateRoom(request: APIRequestContext, id: string, visibility: RoomVisibility = "public"): Promise<void> {
  const res = await request.post("/api/rooms", { data: { id, title: `Room ${id}`, visibility } });
  expect(res.status(), await res.text()).toBe(200);
}

async function apiAddMember(request: APIRequestContext, roomId: string, email: string, role: RoomRole): Promise<void> {
  const res = await request.post(`/api/rooms/${roomId}/members`, { data: { email, role } });
  expect(res.status(), await res.text()).toBe(201);
}

/** Lobby → menu ⋯ kartu → Pengaturan → tab `tab`; kembalikan dialog. */
async function openSettings(page: Page, roomId: string, tab: "general" | "members" | "status" | "danger") {
  if (!page.url().endsWith("/app")) await page.goto("/app");
  await card(page, roomId).getByTestId("room-menu").click();
  await page.getByTestId("room-menu-settings").click();
  const dialog = page.getByTestId("room-settings-dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByTestId(`room-settings-tab-${tab}`).click();
  return dialog;
}

async function pickRole(page: Page, trigger: ReturnType<Page["locator"]>, label: string): Promise<void> {
  await trigger.click();
  await page.getByRole("option", { name: label, exact: true }).click();
}

test("room private: buat lewat form, tambah email belum terdaftar (pending), user itu login lalu bisa masuk", async ({ page, root, roomId, newGuestPage }) => {
  await loginAdmin(page, root);
  await page.goto("/app");
  const form = page.getByTestId("create-room-form");
  await form.getByLabel("Judul room").fill(`Private ${roomId}`);
  await form.locator('[data-testid="visibility-option"][data-value="private"]').click();
  await form.getByText("Opsi lanjutan").click();
  await form.getByLabel("ID room").fill(roomId);
  await form.getByRole("button", { name: "Buat room" }).click();
  await expect(card(page, roomId).getByTestId("room-badge-private")).toBeVisible();

  const invitee = newIdentity("Calon Anggota", "pending");
  const dialog = await openSettings(page, roomId, "members");
  await dialog.getByTestId("member-email-input").fill(invitee.email);
  await dialog.getByTestId("member-add").click();
  await expect(toast(page, `${invitee.email} ditambahkan`)).toBeVisible();
  await expect(memberRow(page, invitee.email)).toHaveAttribute("data-kind", "pending");

  // Login pertama mengklaim undangan pending (R2) → room muncul di lobby dan token terbit.
  const guest = await newGuestPage();
  await loginAs(guest, invitee);
  await guest.goto("/app");
  await expect(card(guest, roomId).getByTestId("room-badge-private")).toBeVisible();
  await card(guest, roomId).getByTestId("room-enter").click();
  await passPreJoin(guest);
  await expectConnected(guest);

  // Di daftar pengelola baris itu kini member (bukan pending).
  await page.reload();
  const again = await openSettings(page, roomId, "members");
  await expect(again.locator(`[data-testid="member-row"][data-email="${invitee.email}"]`)).toHaveAttribute("data-kind", "member");
});

test("room public → private: link undangan lama ditolak untuk user lain", async ({ host, roomId, newGuestPage, allowConsole }) => {
  // InvitePage mencatat preview yang ditolak (403 room_private) sebagai console.error; itu efek yang diuji.
  allowConsole(/^invite: preview gagal/);
  const url = await createInvite(host.request, roomId, "participant");

  const dialog = await openSettings(host, roomId, "general");
  await dialog.locator('[data-testid="visibility-option"][data-value="private"]').click();
  await dialog.getByTestId("room-settings-save").click();
  await host.getByTestId("visibility-private-confirm").click();
  await expect(toast(host, "Pengaturan disimpan")).toBeVisible();
  await expect(card(host, roomId).getByTestId("room-badge-private")).toBeVisible();

  const other = await newGuestPage();
  await loginAs(other, newIdentity("Pemegang Link Lama", "guest"));
  await other.goto(url);
  await expect(other.getByTestId("invite-error")).toContainText(MSG.private);
});

test("nonaktifkan room: badge Nonaktif, Masuk disabled, anggota ditolak; aktifkan lagi bisa masuk", async ({ host, roomId, newGuestPage }) => {
  const member = await newGuestPage();
  const who = newIdentity("Anggota Status", "guest");
  await loginAs(member, who);
  await apiAddMember(host.request, roomId, who.email, "participant");

  const dialog = await openSettings(host, roomId, "status");
  await dialog.getByTestId("room-active-switch").click();
  await expect(toast(host, "Room dinonaktifkan")).toBeVisible();
  await expect(dialog.getByTestId("room-active-switch")).toHaveAttribute("aria-checked", "false");
  await host.keyboard.press("Escape");
  await expect(card(host, roomId).getByTestId("room-badge-status")).toHaveAttribute("data-status", "inactive");
  await expect(card(host, roomId).getByTestId("room-enter")).toBeDisabled();

  await member.goto("/app");
  await expect(card(member, roomId).getByTestId("room-enter")).toBeDisabled();
  await member.goto(`/rooms/${roomId}`);
  await passPreJoin(member);
  // Pesan spesifik "dinonaktifkan" diuji terpisah (E2E-03); di sini cukup: ditolak, tidak terhubung.
  await expect(member.getByTestId("room-status-screen")).toHaveAttribute("data-kind", "error");

  const again = await openSettings(host, roomId, "status");
  await again.getByTestId("room-active-switch").click();
  await expect(toast(host, "Room diaktifkan")).toBeVisible();
  await host.keyboard.press("Escape");
  await expect(card(host, roomId).getByTestId("room-badge-status")).toHaveCount(0);
  await expect(card(host, roomId).getByTestId("room-enter")).toBeEnabled();
  await openRoom(member, roomId);
});

test("nonaktif: anggota yang membuka /rooms/:id mendapat pesan room dinonaktifkan", async ({ host, roomId, newGuestPage }) => {
  const member = await newGuestPage();
  const who = newIdentity("Anggota Nonaktif", "guest");
  await loginAs(member, who);
  await apiAddMember(host.request, roomId, who.email, "participant");
  expect((await host.request.patch(`/api/rooms/${roomId}`, { data: { enabled: false } })).status()).toBe(200);

  await member.goto(`/rooms/${roomId}`);
  await passPreJoin(member);
  await expect(member.getByTestId("room-status-screen")).toContainText(MSG.inactive, { timeout: 5_000 });
});

test("kadaluarsa: +7 hari menampilkan tanggal berakhir, Tanpa batas menghapusnya", async ({ host, roomId }) => {
  const dialog = await openSettings(host, roomId, "status");
  await expect(dialog.getByTestId("expiry-current")).toHaveText("Tanpa batas");
  await dialog.locator('[data-testid="expiry-extend"][data-days="7"]').click();
  await expect(dialog.getByTestId("expiry-current")).toHaveText(/^Berakhir \S.*\d/);
  await expect(card(host, roomId).getByTestId("room-expires")).toBeVisible();

  await dialog.getByTestId("expiry-none").click();
  await expect(dialog.getByTestId("expiry-current")).toHaveText("Tanpa batas");
  await expect(card(host, roomId).getByTestId("room-expires")).toHaveCount(0);
});

test("anggota: ubah peran, keluarkan, batalkan pending; host terakhir tidak bisa diturunkan/dikeluarkan", async ({ host, roomId, newGuestPage, allowConsole }) => {
  // Penolakan last_host (409) dicatat MemberRow sebagai console.error + resource gagal; itu efek yang diuji.
  allowConsole(/status of 409/, /^room-settings: (ubah peran|hapus anggota) room .* gagal/);
  const hostEmail = ((await (await host.request.get("/api/me")).json()) as { user: { email: string } }).user.email;
  const member = await newGuestPage();
  const who = newIdentity("Anggota Diatur", "guest");
  await loginAs(member, who);

  const dialog = await openSettings(host, roomId, "members");
  await dialog.getByTestId("member-email-input").fill(who.email);
  await dialog.getByTestId("member-add").click();
  const row = memberRow(host, who.email);
  await expect(row).toHaveAttribute("data-kind", "member");
  await expect(row.getByTestId("member-row-role")).toHaveText("Peserta");

  await pickRole(host, row.getByTestId("member-row-role"), "Penonton");
  await expect(toast(host, "Peran diperbarui")).toBeVisible();
  await expect(row.getByTestId("member-row-role")).toHaveText("Penonton");
  const roles = (await (await host.request.get(`/api/rooms/${roomId}/members`)).json()) as { items: { email: string; role: string }[] };
  expect(roles.items.find((m) => m.email === who.email)?.role).toBe("viewer");

  await row.getByTestId("member-remove").click();
  await expect(toast(host, "Anggota Diatur dikeluarkan")).toBeVisible();
  await expect(row).toHaveCount(0);

  const pendingEmail = newIdentity("Pending Batal", "pending").email;
  await dialog.getByTestId("member-email-input").fill(pendingEmail);
  await dialog.getByTestId("member-add").click();
  await expect(memberRow(host, pendingEmail)).toHaveAttribute("data-kind", "pending");
  await memberRow(host, pendingEmail).getByTestId("member-remove").click();
  await expect(toast(host, `Undangan ${pendingEmail} dibatalkan`)).toBeVisible();
  await expect(memberRow(host, pendingEmail)).toHaveCount(0);

  // Host satu-satunya: turunkan & keluarkan → 409 last_host, baris tetap Host.
  const self = memberRow(host, hostEmail);
  const rejected = (method: string) =>
    host.waitForResponse((r) => r.request().method() === method && r.url().includes(`/api/rooms/${roomId}/members/`) && r.status() === 409);
  const demote = rejected("PATCH");
  await pickRole(host, self.getByTestId("member-row-role"), "Peserta");
  await demote;
  await expect(toast(host, MSG.lastHost).first()).toBeVisible();
  await expect(self.getByTestId("member-row-role")).toHaveText("Host");
  const removal = rejected("DELETE");
  await self.getByTestId("member-remove").click();
  await removal;
  await expect(self).toHaveAttribute("data-kind", "member");
});

test("hapus room lewat Zona bahaya: ketik ID → kartu hilang", async ({ host, roomId }) => {
  const dialog = await openSettings(host, roomId, "danger");
  await dialog.getByTestId("room-delete-open").click();
  const confirm = host.getByTestId("delete-confirm");
  await expect(confirm).toBeDisabled();
  await host.getByTestId("delete-confirm-input").fill(roomId);
  await confirm.click();
  await expect(toast(host, `Room "Room ${roomId}" dihapus`)).toBeVisible();
  await expect(card(host, roomId)).toHaveCount(0);
  expect((await host.request.get(`/api/rooms/${roomId}`)).status()).toBe(404);
});

test("peserta (bukan pengelola) tidak punya menu ⋯ dan PATCH ditolak", async ({ host, roomId, newGuestPage }) => {
  const member = await newGuestPage();
  const who = newIdentity("Peserta Biasa", "guest");
  await loginAs(member, who);
  await apiAddMember(host.request, roomId, who.email, "participant");

  await member.goto("/app");
  await expect(card(member, roomId).getByTestId("room-enter")).toBeEnabled();
  await expect(card(member, roomId).getByTestId("room-menu")).toHaveCount(0);
  await expect(card(member, roomId).getByTestId("invite-toggle")).toHaveCount(0);
  const res = await member.request.patch(`/api/rooms/${roomId}`, { data: { enabled: false } });
  expect(res.status()).toBe(403);
});

test("/admin: kolom Tipe & Status, Pengaturan membuka dialog yang sama", async ({ page, root, roomId }) => {
  await loginAdmin(page, root);
  await apiCreateRoom(page.request, roomId, "private");
  await page.goto("/admin?tab=rooms");
  const row = page.locator(`[data-testid="room-admin-row"][data-room-id="${roomId}"]`);
  await expect(row.getByTestId("room-admin-type")).toHaveAttribute("data-value", "private");
  await expect(row.getByTestId("room-admin-status")).toHaveAttribute("data-status", "active");

  await row.getByTestId("room-actions").click();
  await page.getByTestId("room-settings").click();
  const dialog = page.getByTestId("room-settings-dialog");
  await dialog.getByTestId("room-settings-tab-status").click();
  await dialog.getByTestId("room-active-switch").click();
  await expect(toast(page, "Room dinonaktifkan")).toBeVisible();
  await expect(row.getByTestId("room-admin-status")).toHaveAttribute("data-status", "inactive");
});
