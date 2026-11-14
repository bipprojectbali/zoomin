import type { Page } from "@playwright/test";
import { expect, loginAs, newIdentity, SUPER_ADMIN_EMAIL, test, testLogin, toast } from "./fixtures";

/** Page super admin (root) di /dev, tab `tab` terbuka. */
async function openDev(page: Page, tab: "roles" | "audit" | "settings"): Promise<void> {
  await loginAs(page, { email: SUPER_ADMIN_EMAIL, name: "Root E2E" });
  await page.goto("/dev");
  await expect(page.getByTestId("dev-page")).toBeVisible();
  await page.getByTestId(`dev-tab-${tab}`).click();
}

test("dev: super admin promote user → admin; user itu melihat menu Admin; audit log mencatatnya", async ({ page, newGuestPage }) => {
  const userPage = await newGuestPage();
  const target = await loginAs(userPage, newIdentity("Calon Admin"));
  await userPage.goto("/app");
  await expect(userPage.getByTestId("user-menu")).toBeVisible();
  await expect(userPage.getByRole("link", { name: "Admin", exact: true })).toHaveCount(0);

  await openDev(page, "roles");
  await page.getByRole("searchbox", { name: "Cari pengguna" }).fill(target.email);
  const row = page.locator(`[data-testid="role-row"][data-user-id="${target.id}"]`);
  await expect(row).toHaveAttribute("data-role", "user");
  await row.getByTestId("promote-admin").click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Jadikan admin" }).click();
  await expect(toast(page, `${target.name} sekarang admin`)).toBeVisible();
  await expect(row).toHaveAttribute("data-role", "admin");

  // Peran dibaca dari DB tiap request (tanpa cookieCache): reload cukup.
  await userPage.reload();
  const adminLink = userPage.getByRole("navigation", { name: "Navigasi aplikasi" }).getByRole("link", { name: "Admin", exact: true });
  await expect(adminLink).toBeVisible();
  await adminLink.click();
  await expect(userPage.getByTestId("admin-page")).toBeVisible();

  await page.getByTestId("dev-tab-audit").click();
  const entry = page.locator('[data-testid="audit-row"][data-action="user.role"]').filter({ hasText: target.id });
  await expect(entry).toHaveCount(1);
  await expect(entry).toContainText(SUPER_ADMIN_EMAIL);
});

test("dev: domain email diizinkan → domain lain ditolak, super admin tetap bisa; hapus domain lagi", async ({ page, playwright, baseURL, root }) => {
  // USER_DOMAIN (contoh.test) = domain user e2e lain, jadi test paralel tetap bisa login selama pembatasan aktif.
  const fresh = await playwright.request.newContext({ baseURL });
  try {
    await openDev(page, "settings");
    await page.getByTestId("settings-domain-input").fill("contoh.test");
    await page.getByTestId("settings-domain-input").press("Enter");
    await expect(page.getByTestId("settings-domain-chip")).toHaveText(["contoh.test"]);
    await page.getByTestId("settings-save").click();
    await expect(toast(page, "Pengaturan disimpan")).toBeVisible();

    const outsider = `luar-${Date.now().toString(36)}@lain.test`;
    const denied = await testLogin(fresh, { email: outsider });
    expect(denied.status()).toBe(403);
    expect(((await denied.json()) as { code?: string }).code).toBe("email_domain_not_allowed");
    expect((await testLogin(fresh, { email: SUPER_ADMIN_EMAIL })).status()).toBe(200);
    expect((await testLogin(fresh, newIdentity("Orang Dalam"))).status()).toBe(200);

    await page.getByRole("button", { name: "Hapus domain contoh.test" }).click();
    await expect(page.getByTestId("settings-domain-chip")).toHaveCount(0);
    await page.getByTestId("settings-save").click();
    // Toast simpan pertama bisa masih tampil → dua toast cocok; ambil yang terbaru.
    await expect(toast(page, "Pengaturan disimpan").last()).toBeVisible();
    expect((await testLogin(fresh, { email: outsider })).status()).toBe(200);
  } finally {
    // Jaring pengaman: jangan tinggalkan pembatasan domain untuk test lain.
    await root.put("/api/dev/settings", { data: { allowedEmailDomains: [] } });
    await fresh.dispose();
  }
});
