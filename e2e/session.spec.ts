import { expect, expectConnected, openRoom, test, toast } from "./fixtures";

test("leave: keluar → konfirmasi → layar 'keluar' → Gabung lagi terhubung kembali", async ({ admin, roomId, joinAs }) => {
  await openRoom(admin, roomId);
  const guest = await joinAs("participant", "Peserta Pamit");
  // Pastikan admin sudah melihat tamu: LiveKit tidak menyiarkan peserta yang keluar sebelum aktif bagi yang lain.
  await expect(toast(admin, "Peserta Pamit")).toContainText("bergabung");

  // Batal di dialog = tetap di room.
  await guest.getByTestId("leave-room").click();
  await guest.getByRole("alertdialog").getByRole("button", { name: "Batal" }).click();
  await expect(guest.getByRole("alertdialog")).toHaveCount(0);
  await expectConnected(guest);

  await guest.getByTestId("leave-room").click();
  await guest.getByTestId("leave-confirm").click();
  const screen = guest.getByTestId("room-status-screen");
  await expect(screen).toHaveAttribute("data-kind", "left");
  await expect(guest.getByTestId("connection-status")).toHaveAttribute("data-status", "left");
  await expect(toast(admin, /Peserta Pamit keluar/)).toBeVisible();

  await screen.getByRole("button", { name: "Gabung lagi" }).click();
  await expectConnected(guest);
  await expect(guest.getByTestId("room-status-screen")).toHaveCount(0);
  await expect(guest.getByTestId("leave-room")).toBeVisible();
});

test("sesi ganda: akun sama buka room di tab kedua → tab pertama terputus dengan pesan sesi ganda", async ({ admin, roomId }) => {
  await openRoom(admin, roomId);
  const second = await admin.context().newPage();
  await openRoom(second, roomId);

  const screen = admin.getByTestId("room-status-screen");
  await expect(screen).toHaveAttribute("data-kind", "disconnected");
  await expect(screen).toContainText("Anda membuka room ini di tab/perangkat lain");
  await expect(admin.getByTestId("connection-status")).toHaveAttribute("data-status", "disconnected");

  // "Pakai di tab ini" merebut kembali sesi; tab kedua yang sekarang terputus.
  await screen.getByRole("button", { name: "Pakai di tab ini" }).click();
  await expectConnected(admin);
  await expect(second.getByTestId("room-status-screen")).toHaveAttribute("data-kind", "disconnected");
});
