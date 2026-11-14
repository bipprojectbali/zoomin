import { connectionStatus, expect, expectVideoFlowing, identityOf, openRoom, test, tile, toast } from "./fixtures";

test("join: tamu membuka link undangan, pre-join, masuk room dan terhubung", async ({ host, roomId, joinAs }) => {
  await openRoom(host, roomId);
  const guest = await joinAs("participant", "Tamu Satu");
  await expect(guest.locator("header").getByRole("heading", { name: `Room ${roomId}` })).toBeVisible();
  await expect(guest.locator("header").getByText("Participant", { exact: true })).toBeVisible();
  await expect(connectionStatus(guest)).toHaveText("Connected");
});

test("media: host & peserta nyalakan kamera+mic di room, saling melihat video", async ({ host, hostId, roomId, joinAs }) => {
  await openRoom(host, roomId);
  const guest = await joinAs("participant", "Peserta Media");

  for (const page of [host, guest]) {
    for (const id of ["toggle-camera", "toggle-mic"]) {
      const button = page.getByTestId(id);
      await expect(button).toHaveAttribute("aria-pressed", "false");
      await button.click();
      await expect(button).toHaveAttribute("aria-pressed", "true");
    }
  }

  await expectVideoFlowing(tile(host, await identityOf(guest), "camera"));
  await expectVideoFlowing(tile(guest, hostId, "camera"));
});

test("multi share: peserta tambah 2 layar, penonton melihat 2 tile; stop satu tinggal 1", async ({ joinAs }) => {
  const sharer = await joinAs("participant", "Penyaji");
  const sharerId = await identityOf(sharer);
  const viewer = await joinAs("viewer", "Penonton Share");

  const add = sharer.getByTestId("add-screen");
  for (const n of [1, 2]) {
    await add.click();
    await expect(add).toHaveAccessibleName(`Share screen (${n} active)`);
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
  await expect(add).toHaveAccessibleName("Share screen (1 active)");
  await expect(screen2).toHaveCount(0);
  await expect(screen1).toHaveCount(1);
  await expectVideoFlowing(screen1);
});

test("viewer: tidak ada tombol kamera, mikrofon, layar, atau toolbar layout", async ({ host, roomId, joinAs }) => {
  await openRoom(host, roomId);
  const viewer = await joinAs("viewer", "Penonton Pasif");
  await expect(viewer.locator("header").getByText("Viewer", { exact: true })).toBeVisible();
  // Kontrol host terlihat → room sudah selesai render, jadi ketiadaan di viewer bermakna.
  await expect(host.getByTestId("add-screen")).toBeVisible();
  await expect(host.getByTestId("layout-toolbar")).toBeVisible();
  await expect(viewer.getByTestId("leave-room")).toBeVisible();
  for (const id of ["toggle-mic", "toggle-camera", "add-screen", "layout-toolbar", "open-invite"]) {
    await expect(viewer.getByTestId(id)).toHaveCount(0);
  }
});

test("toast: peserta lain bergabung → host melihat notifikasi nama", async ({ host, roomId, joinAs }) => {
  await openRoom(host, roomId);
  await joinAs("participant", "Tamu Toast");
  // room.toasts.ts: agregasi 1,5 dtk lalu "<name> joined".
  await expect(toast(host, "Tamu Toast")).toContainText("joined");
});
