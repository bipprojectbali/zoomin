import { ADMIN_ID, connectionStatus, expect, expectVideoFlowing, identityOf, openRoom, test, tile, toast } from "./fixtures";

test("join: tamu membuka link undangan, pre-join, masuk room dan terhubung", async ({ admin, roomId, joinAs }) => {
  await openRoom(admin, roomId);
  const guest = await joinAs("participant", "Tamu Satu");
  await expect(guest.locator("header").getByRole("heading", { name: `Room ${roomId}` })).toBeVisible();
  await expect(guest.locator("header").getByText("Peserta", { exact: true })).toBeVisible();
  await expect(connectionStatus(guest)).toHaveText("Terhubung");
});

test("media: admin & peserta nyalakan kamera+mic di room, saling melihat video", async ({ admin, roomId, joinAs }) => {
  await openRoom(admin, roomId);
  const guest = await joinAs("participant", "Peserta Media");

  for (const page of [admin, guest]) {
    for (const id of ["toggle-camera", "toggle-mic"]) {
      const button = page.getByTestId(id);
      await expect(button).toHaveAttribute("aria-pressed", "false");
      await button.click();
      await expect(button).toHaveAttribute("aria-pressed", "true");
    }
  }

  await expectVideoFlowing(tile(admin, await identityOf(guest), "camera"));
  await expectVideoFlowing(tile(guest, ADMIN_ID, "camera"));
});

test("multi share: peserta tambah 2 layar, penonton melihat 2 tile; stop satu tinggal 1", async ({ joinAs }) => {
  const sharer = await joinAs("participant", "Penyaji");
  const sharerId = await identityOf(sharer);
  const viewer = await joinAs("viewer", "Penonton Share");

  const add = sharer.getByTestId("add-screen");
  for (const n of [1, 2]) {
    await add.click();
    await expect(add).toHaveAccessibleName(`Bagikan layar (${n} aktif)`);
  }
  await sharer.getByTestId("screen-list").click();
  await expect(sharer.getByTestId("stop-screen")).toHaveCount(2);
  await sharer.keyboard.press("Escape");
  // Tunggu animasi tutup selesai: klik trigger saat menu masih menutup diabaikan Radix.
  await expect(sharer.getByTestId("stop-screen")).toHaveCount(0);

  const screen1 = tile(viewer, sharerId, "screen-1");
  const screen2 = tile(viewer, sharerId, "screen-2");
  await expectVideoFlowing(screen1);
  await expectVideoFlowing(screen2);

  await sharer.getByTestId("screen-list").click();
  await sharer.locator('[data-testid="stop-screen"][data-track-name="screen-2"]').click();
  await expect(add).toHaveAccessibleName("Bagikan layar (1 aktif)");
  await expect(screen2).toHaveCount(0);
  await expect(screen1).toHaveCount(1);
  await expectVideoFlowing(screen1);
});

test("viewer: tidak ada tombol kamera, mikrofon, layar, atau toolbar layout", async ({ admin, roomId, joinAs }) => {
  await openRoom(admin, roomId);
  const viewer = await joinAs("viewer", "Penonton Pasif");
  await expect(viewer.locator("header").getByText("Penonton", { exact: true })).toBeVisible();
  // Kontrol admin terlihat → room sudah selesai render, jadi ketiadaan di viewer bermakna.
  await expect(admin.getByTestId("add-screen")).toBeVisible();
  await expect(admin.getByTestId("layout-toolbar")).toBeVisible();
  await expect(viewer.getByTestId("leave-room")).toBeVisible();
  for (const id of ["toggle-mic", "toggle-camera", "add-screen", "layout-toolbar", "open-invite"]) {
    await expect(viewer.getByTestId(id)).toHaveCount(0);
  }
});

test("toast: peserta lain bergabung → admin melihat notifikasi nama", async ({ admin, roomId, joinAs }) => {
  await openRoom(admin, roomId);
  await joinAs("participant", "Tamu Toast");
  // room.toasts.ts: agregasi 1,5 dtk lalu "<nama> bergabung".
  await expect(toast(admin, "Tamu Toast")).toContainText("bergabung");
});
