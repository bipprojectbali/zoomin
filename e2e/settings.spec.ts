import { expect, loginAs, newIdentity, test, toast } from "./fixtures";

test("settings: ubah nama tersimpan dan tampil di menu akun AppShell", async ({ page }) => {
  const who = newIdentity("Nama Lama");
  await loginAs(page, who);
  await page.goto("/settings");
  const name = page.getByTestId("settings-name");
  await expect(name).toHaveValue("Nama Lama");
  await name.fill("  Nama Baru E2E  ");
  await page.getByTestId("settings-profile").getByTestId("settings-save").click();
  await expect(toast(page, "Profile saved")).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("settings-name")).toHaveValue("Nama Baru E2E");
  await page.getByTestId("user-menu").click();
  const menu = page.getByRole("menu");
  await expect(menu).toContainText("Nama Baru E2E");
  await expect(menu).toContainText(who.email);
});

test("settings: sesi aktif tampil; cabut sesi lain → context kedua 401", async ({ page, newGuestPage }) => {
  const who = newIdentity("Dua Perangkat");
  await loginAs(page, who);
  const other = await newGuestPage();
  await loginAs(other, who);
  expect((await other.request.get("/api/me")).status()).toBe(200);

  await page.goto("/settings");
  const rows = page.getByTestId("session-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText("This device");
  await page.getByTestId("session-revoke-others").click();
  await expect(toast(page, "Signed out of all other devices")).toBeVisible();
  await expect(rows).toHaveCount(1);
  await expect(page.getByText("This device")).toBeVisible();

  expect((await other.request.get("/api/me")).status()).toBe(401);
  expect((await page.request.get("/api/me")).status()).toBe(200);
  await other.goto("/app");
  await expect(other).toHaveURL(/\/login$/);
});
