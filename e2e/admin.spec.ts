import type { Page } from "@playwright/test";
import type { AuditEntry, Page as ApiPage, SessionUser, UserResponse } from "../src/shared/api.types";
import { expect, loginAdmin, SUPER_ADMIN_EMAIL, test, testLogin, toast } from "./fixtures";

const me = async (page: Page): Promise<SessionUser> => ((await (await page.request.get("/api/me")).json()) as UserResponse).user;

/** /admin → cari `email` → baris user itu. */
async function findUserRow(admin: Page, email: string) {
  await admin.goto("/admin");
  await expect(admin.getByTestId("admin-page")).toBeVisible();
  await admin.getByTestId("admin-search").fill(email);
  const rows = admin.getByTestId("user-row");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText(email);
  return rows.first();
}

test("admin: cari user, ban dengan alasan → user di room terputus & tak bisa login → unban", async ({ host, joinAs, playwright, baseURL, root, allowConsole }) => {
  // Setelah ban, RoomPage/sesi user itu mendapat 401/403 dari API (tercatat sebagai resource gagal) dan LiveKit
  // mencatat pemutusan (removeParticipant menutup data channel dari sisi server); keduanya memang efek yang diuji.
  allowConsole(/status of 40[13]/, /session: GET \/api\/me gagal/, /^DataChannel error on \w+: User-Initiated Abort/, /^publisher data channel '\w+' closed unexpectedly/);
  const guest = await joinAs("participant", "Calon Diblokir");
  const target = await me(guest);

  const row = await findUserRow(host, target.email);
  await expect(row).toHaveAttribute("data-banned", "false");
  await row.getByTestId("user-actions").click();
  await host.getByTestId("ban").click();
  const dialog = host.getByTestId("ban-dialog");
  await dialog.getByTestId("ban-reason").fill("Spam di room e2e");
  await dialog.getByTestId("ban-submit").click();
  await expect(dialog).toHaveCount(0);
  await expect(toast(host, `${target.name} diblokir`)).toBeVisible();
  await expect(row).toHaveAttribute("data-banned", "true");

  // Dikeluarkan dari room LiveKit aktif (A6).
  const screen = guest.getByTestId("room-status-screen");
  await expect(screen).toBeVisible();
  await expect(screen).toContainText("Anda dikeluarkan dari room");

  // Login ulang ditolak dengan kode `banned`.
  const fresh = await playwright.request.newContext({ baseURL });
  try {
    const res = await testLogin(fresh, { email: target.email });
    expect(res.status()).toBe(403);
    expect(((await res.json()) as { code?: string }).code).toBe("banned");
  } finally {
    await fresh.dispose();
  }

  // Audit mencatat ban (A8).
  const audit = (await (await root.get("/api/dev/audit?action=user.ban&limit=50")).json()) as ApiPage<AuditEntry>;
  expect(audit.items.some((e) => e.targetId === target.id && e.detail.reason === "Spam di room e2e")).toBe(true);

  await row.getByTestId("user-actions").click();
  await host.getByTestId("unban").click();
  await expect(toast(host, `Blokir ${target.name} dibuka`)).toBeVisible();
  await expect(row).toHaveAttribute("data-banned", "false");
  const again = await playwright.request.newContext({ baseURL });
  try {
    expect((await testLogin(again, { email: target.email })).status()).toBe(200);
  } finally {
    await again.dispose();
  }
});

test("admin: tidak bisa mengelola admin lain maupun super admin (aksi disabled)", async ({ page, root, newGuestPage }) => {
  await loginAdmin(page, root, "Admin Satu");
  const other = await newGuestPage();
  const otherAdmin = await loginAdmin(other, root, "Admin Dua");

  const row = await findUserRow(page, otherAdmin.email);
  await expect(row).toHaveAttribute("data-role", "admin");
  await expect(row.getByTestId("user-actions")).toBeDisabled();

  const superRow = await findUserRow(page, SUPER_ADMIN_EMAIL);
  await expect(superRow).toHaveAttribute("data-role", "super_admin");
  await expect(superRow.getByTestId("user-actions")).toBeDisabled();

  // Server juga menolak (bukan hanya UI).
  const res = await page.request.post(`/api/admin/users/${otherAdmin.id}/ban`, { data: { reason: "coba-coba" } });
  expect(res.status()).toBe(403);
});
