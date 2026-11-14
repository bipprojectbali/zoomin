import { ADMIN_PASSWORD, expect, test } from "./fixtures";

test.describe("auth admin", () => {
  test("password salah menampilkan error, tetap di /login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel("Password admin").fill("salah-total");
    await page.getByRole("button", { name: "Masuk" }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("password benar masuk lobby, lalu logout kembali ke /login", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Password admin").fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Masuk" }).click();
    await expect(page.getByRole("heading", { name: "Daftar room" })).toBeVisible();
    await expect(page.getByText("Masuk sebagai Admin")).toBeVisible();

    await page.getByRole("button", { name: "Keluar" }).click();
    await expect(page).toHaveURL(/\/login$/);
    // Sesi benar-benar dihapus: buka lobby lagi → diarahkan ke login.
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
  });
});
