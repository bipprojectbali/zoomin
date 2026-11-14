import { ADMIN_PASSWORD, expect, test } from "./fixtures";

const RATE_LIMITED_TEXT = "Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.";
/** = ADMIN_LOGIN_MAX_FAILURES (src/server/auth.route.ts). */
const LOGIN_MAX_FAILURES = 5;

test.describe("auth admin", () => {
  test("password salah: pesan Indonesia, tetap di /login", async ({ page, allowConsole }) => {
    // LoginPage mencatat kegagalan login via console.error (dengan konteks) sebelum menampilkan pesan.
    allowConsole(/^login: admin-login gagal/);
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel("Password admin").fill("salah-total");
    await page.getByRole("button", { name: "Masuk" }).click();
    await expect(page.getByRole("alert")).toHaveText("Password salah. Periksa lalu coba lagi.");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("password benar masuk lobby, lalu logout kembali ke /login", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Password admin").fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Masuk" }).click();
    await expect(page.getByTestId("create-room-form")).toBeVisible();

    // Admin tidak butuh konfirmasi logout (bisa login ulang sendiri).
    await page.getByTestId("logout").click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("rate limit: gagal login berulang → 429 dengan pesan Indonesia", async ({ page, allowConsole }) => {
    // Tiap kegagalan dicatat console.error oleh LoginPage; 429 juga dicatat Chromium sebagai resource gagal.
    allowConsole(/^login: admin-login gagal/, /status of 429/);
    await page.goto("/login");
    const password = page.getByLabel("Password admin");
    const submit = page.getByRole("button", { name: "Masuk" });
    for (let i = 0; i < LOGIN_MAX_FAILURES; i++) {
      const res = page.waitForResponse("**/api/auth/admin-login");
      await password.fill(`salah-${i}`);
      await submit.click();
      expect((await res).status()).toBe(401);
    }
    const res = page.waitForResponse("**/api/auth/admin-login");
    // Password benar pun ditolak selama jendela rate limit.
    await password.fill(ADMIN_PASSWORD);
    await submit.click();
    expect((await res).status()).toBe(429);
    await expect(page.getByRole("alert")).toHaveText(RATE_LIMITED_TEXT);
    await expect(page).toHaveURL(/\/login$/);
  });
});

test("404: route tak dikenal menampilkan halaman tidak ditemukan dengan jalan pulang", async ({ page }) => {
  await page.goto("/tidak/ada/halaman-ini");
  await expect(page.getByRole("heading", { name: "Halaman tidak ditemukan" })).toBeVisible();
  await page.getByRole("link", { name: "Ke daftar room" }).click();
  // Tanpa sesi lobby mengarah ke login.
  await expect(page).toHaveURL(/\/login$/);
});
