import { expect, loginAdmin, test } from "./fixtures";

test("lobby: buat room cukup judul, muncul di daftar, buat link undangan peserta & penonton", async ({ page, roomId }) => {
  await loginAdmin(page.request);
  await page.goto("/");
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

test("lobby: tamu logout wajib konfirmasi", async ({ roomId, joinAs }) => {
  const guest = await joinAs("participant", "Tamu Logout");
  await guest.goto("/");
  await expect(guest.locator(`[data-testid="room-item"][data-room-id="${roomId}"]`)).toBeVisible();
  // Tamu bukan admin global: tidak ada form buat room.
  await expect(guest.getByTestId("create-room-form")).toHaveCount(0);
  await guest.getByTestId("logout").click();
  const dialog = guest.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Batal" }).click();
  // Tunggu animasi tutup selesai (lihat E2E-01 di e2e/BUGS.md / dialog.spec.ts).
  await expect(dialog).toHaveCount(0);
  await expect(guest).toHaveURL(/\/$/);
  await guest.getByTestId("logout").click();
  // Tombol aksi = tombol terakhir di footer AlertDialog (setelah Batal); labelnya sedang diganti, jadi tanpa teks.
  await guest.getByRole("alertdialog").getByRole("button").last().click();
  await expect(guest).toHaveURL(/\/login$/);
});
