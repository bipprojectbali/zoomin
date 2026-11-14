import { expect, loginAdmin, loginAs, newIdentity, test } from "./fixtures";

test("lobby: admin buat room cukup judul, muncul di daftar, buat link undangan peserta & penonton", async ({ page, root, roomId }) => {
  await loginAdmin(page, root);
  await page.goto("/app");
  const form = page.getByTestId("create-room-form");
  const title = `Judul ${roomId}`;
  await form.getByLabel("Judul room").fill(title);
  // ID otomatis dari judul (Opsi lanjutan); ditimpa agar unik & bisa dicari.
  await form.getByText("Opsi lanjutan").click();
  await expect(form.getByLabel("ID room")).toHaveValue(/^judul-e2e-/);
  await form.getByLabel("ID room").fill(roomId);
  await form.getByRole("button", { name: "Buat room" }).click();

  const item = page.locator(`[data-testid="room-item"][data-room-id="${roomId}"]`);
  await expect(item).toBeVisible();
  await expect(item.getByRole("heading", { name: title })).toBeVisible();
  // Form direset setelah sukses.
  await expect(form.getByLabel("Judul room")).toHaveValue("");

  // Panel undangan per kartu collapsed sampai invite-toggle diklik.
  const toggle = item.getByTestId("invite-toggle");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(item.getByTestId("create-invite")).toBeHidden();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const urls: string[] = [];
  for (const role of ["participant", "viewer"] as const) {
    await item.locator(`[data-testid="invite-role"][data-role="${role}"]`).click();
    await item.getByTestId("create-invite").click();
    const input = item.locator(`[data-testid="invite-url"][data-role="${role}"]`);
    await expect(input).toHaveValue(/^http:\/\/localhost:\d+\/invite\/.+/);
    urls.push(await input.inputValue());
  }
  expect(urls[0]).not.toBe(urls[1]);

  await page.reload();
  await expect(page.locator(`[data-testid="room-item"][data-room-id="${roomId}"]`)).toBeVisible();
});

test("lobby: user biasa tanpa undangan → rooms-empty, tanpa form buat room", async ({ page }) => {
  await loginAs(page, newIdentity("User Biasa"));
  await page.goto("/app");
  await expect(page.getByTestId("rooms-empty")).toBeVisible();
  await expect(page.getByTestId("create-room-form")).toHaveCount(0);
  // Server juga menolak (bukan hanya UI menyembunyikan form).
  const res = await page.request.post("/api/rooms", { data: { id: `x-${Date.now()}`, title: "Tidak boleh" } });
  expect(res.status()).toBe(403);
  expect((await res.json()).code).toBe("insufficient_role");
});

test("lobby: tamu yang menerima undangan melihat room-nya, lalu Keluar akun → /login", async ({ roomId, joinAs }) => {
  const guest = await joinAs("participant", "Tamu Logout");
  await guest.goto("/app");
  await expect(guest.locator(`[data-testid="room-item"][data-room-id="${roomId}"]`)).toBeVisible();
  await expect(guest.getByTestId("create-room-form")).toHaveCount(0);
  await guest.getByTestId("user-menu").click();
  await guest.getByTestId("logout").click();
  await expect(guest).toHaveURL(/\/login$/);
  await guest.goto("/app");
  await expect(guest).toHaveURL(/\/login$/);
});
