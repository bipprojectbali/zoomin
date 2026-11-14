import { ADMIN_NAME, connectionStatus, expect, expectVideoFlowing, KIND, openRoom, test, tile } from "./fixtures";

test("join: tamu membuka link undangan, isi nama, masuk room dan terhubung", async ({ admin, roomId, joinAs }) => {
  await openRoom(admin, roomId);
  const guest = await joinAs("participant", "Tamu Satu");
  await expect(guest.getByRole("heading", { name: roomId })).toBeVisible();
  await expect(guest.locator("header").getByText("Peserta", { exact: true })).toBeVisible();
  await expect(connectionStatus(guest)).toHaveText("Terhubung");
});

test("media: admin & peserta nyalakan kamera+mic, saling melihat video", async ({ admin, roomId, joinAs }) => {
  await openRoom(admin, roomId);
  const guest = await joinAs("participant", "Peserta Media");

  for (const page of [admin, guest]) {
    for (const device of ["Kamera", "Mikrofon"]) {
      const button = page.getByRole("button", { name: device, exact: true });
      await button.click();
      await expect(button).toHaveAttribute("aria-pressed", "true");
    }
  }

  await expectVideoFlowing(tile(admin, "Peserta Media", KIND.camera));
  await expectVideoFlowing(tile(guest, ADMIN_NAME, KIND.camera));
});

test("multi share: peserta tambah 2 layar, penonton melihat 2 tile; stop satu tinggal 1", async ({ roomId, joinAs }) => {
  const sharer = await joinAs("participant", "Penyaji");
  const viewer = await joinAs("viewer", "Penonton Share");

  const add = sharer.getByRole("button", { name: "Tambah layar" });
  for (const n of [1, 2]) {
    await add.click();
    await expect(sharer.getByRole("button", { name: `Hentikan screen-${n}` })).toBeVisible();
  }

  const screen1 = tile(viewer, "Penyaji", KIND.screen(1));
  const screen2 = tile(viewer, "Penyaji", KIND.screen(2));
  await expectVideoFlowing(screen1);
  await expectVideoFlowing(screen2);

  await sharer.getByRole("button", { name: "Hentikan screen-2" }).click();
  await expect(screen2).toHaveCount(0);
  await expect(screen1).toHaveCount(1);
  await expectVideoFlowing(screen1);
});

test("viewer: tidak ada tombol kamera, mikrofon, atau layar", async ({ admin, roomId, joinAs }) => {
  await openRoom(admin, roomId);
  const viewer = await joinAs("viewer", "Penonton Pasif");
  await expect(viewer.locator("header").getByText("Penonton", { exact: true })).toBeVisible();
  // Kontrol admin terlihat → halaman room sudah selesai render, jadi ketiadaan di viewer bermakna.
  await expect(admin.getByRole("button", { name: "Tambah layar" })).toBeVisible();
  for (const name of ["Kamera", "Mikrofon", "Tambah layar"]) {
    await expect(viewer.getByRole("button", { name, exact: true })).toHaveCount(0);
  }
  await expect(viewer.getByRole("toolbar", { name: "Template layout" })).toHaveCount(0);
});
