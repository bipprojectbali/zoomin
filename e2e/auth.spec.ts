import { expect, loginAs, newIdentity, test } from "./fixtures";

test.describe("landing", () => {
  test("anonim di / → landing dengan CTA login ke /login", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("landing")).toBeVisible();
    await expect(page.getByTestId("landing-cta-app")).toHaveCount(0);
    await page.getByTestId("landing-cta-login").click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByTestId("login-card")).toBeVisible();
  });

  test("sudah login di / → landing tetap tampil, CTA ke /app", async ({ page }) => {
    await loginAs(page, newIdentity("Pengunjung Login"));
    await page.goto("/");
    await expect(page.getByTestId("landing")).toBeVisible();
    await expect(page.getByTestId("landing-cta-login")).toHaveCount(0);
    await page.getByTestId("landing-cta-app").click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByTestId("user-menu")).toBeVisible();
  });
});

test.describe("login", () => {
  test("halaman login: satu tombol Google", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Masuk ke zoomin" })).toBeVisible();
    await expect(page.getByTestId("login-google")).toHaveText("Lanjutkan dengan Google");
    await expect(page.getByTestId("login-error")).toHaveCount(0);
  });

  test("?error=email_domain_not_allowed → pesan Indonesia", async ({ page }) => {
    await page.goto("/login?error=email_domain_not_allowed");
    await expect(page.getByTestId("login-error")).toHaveText(
      "Domain email akun Google ini tidak diizinkan. Masuk dengan akun Google kantor/organisasi Anda.",
    );
  });

  test("?next= eksternal ditolak: setelah login tetap di /app", async ({ page }) => {
    await loginAs(page, newIdentity("Korban Redirect"));
    for (const next of ["https://evil.example/curi", "//evil.example/curi", "/\\evil.example"]) {
      await page.goto(`/login?next=${encodeURIComponent(next)}`);
      await expect(page).toHaveURL(/^http:\/\/localhost:\d+\/app$/);
    }
    // Path internal tetap dihormati.
    await page.goto(`/login?next=${encodeURIComponent("/settings")}`);
    await expect(page).toHaveURL(/\/settings$/);
  });

  test("RequireSession: anonim buka /app & /settings → /login?next=<path>", async ({ page }) => {
    for (const path of ["/app", "/settings", "/rooms/apa-saja"]) {
      await page.goto(path);
      if (path === "/app") await expect(page).toHaveURL(/\/login$/);
      else await expect(page).toHaveURL(`/login?next=${encodeURIComponent(path)}`);
      await expect(page.getByTestId("login-card")).toBeVisible();
    }
    // Ada `next` → petunjuk "Masuk dulu…".
    await expect(page.getByRole("status")).toHaveText("Masuk dulu untuk melanjutkan ke halaman yang Anda buka.");
  });
});

test("user biasa buka /admin & /dev → halaman tidak punya akses, jalan pulang ke /app", async ({ page }) => {
  await loginAs(page, newIdentity("User Penasaran"));
  for (const path of ["/admin", "/dev"]) {
    await page.goto(path);
    const forbidden = page.getByTestId("forbidden");
    await expect(forbidden).toBeVisible();
    await expect(forbidden.getByRole("heading", { name: "Tidak punya akses" })).toBeVisible();
  }
  // API juga menolak.
  expect((await page.request.get("/api/admin/users")).status()).toBe(403);
  expect((await page.request.get("/api/dev/settings")).status()).toBe(403);
  await page.getByTestId("forbidden").getByRole("link", { name: "Kembali ke Room" }).click();
  await expect(page).toHaveURL(/\/app$/);
  // Menu Admin/Developer tidak muncul untuk user biasa.
  await expect(page.getByRole("navigation", { name: "Navigasi aplikasi" })).toHaveCount(0);
});

test("404: route tak dikenal menampilkan halaman tidak ditemukan dengan jalan pulang", async ({ page }) => {
  // BUG(e2e): E2E-02 — lihat e2e/BUGS.md; hapus test.fail() setelah NotFoundPage diperbaiki.
  test.fail();
  await page.goto("/tidak/ada/halaman-ini");
  await expect(page.getByRole("heading", { name: "Halaman tidak ditemukan" })).toBeVisible();
  await page.getByRole("link", { name: "Ke lobby" }).click();
  // "Ke lobby" = /app; tanpa sesi → /login. Aktual: link ke "/" (landing).
  await expect(page).toHaveURL(/\/login$/);
});
