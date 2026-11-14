import { expect, expectConnected, openRoom, test, toast } from "./fixtures";

test("leave: keluar → konfirmasi → layar 'keluar' → Gabung lagi terhubung kembali", async ({ host, roomId, joinAs }) => {
  await openRoom(host, roomId);
  const guest = await joinAs("participant", "Peserta Pamit");
  // Pastikan host sudah melihat tamu: LiveKit tidak menyiarkan peserta yang keluar sebelum aktif bagi yang lain.
  await expect(toast(host, "Peserta Pamit")).toContainText("bergabung");

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
  await expect(toast(host, /Peserta Pamit keluar/)).toBeVisible();

  await screen.getByRole("button", { name: "Gabung lagi" }).click();
  await expectConnected(guest);
  await expect(guest.getByTestId("room-status-screen")).toHaveCount(0);
  await expect(guest.getByTestId("leave-room")).toBeVisible();
});

test("sesi ganda: akun sama buka room di tab kedua → tab pertama terputus dengan pesan sesi ganda", async ({ host, roomId }) => {
  await openRoom(host, roomId);
  const second = await host.context().newPage();
  await openRoom(second, roomId);

  const screen = host.getByTestId("room-status-screen");
  await expect(screen).toHaveAttribute("data-kind", "disconnected");
  await expect(screen.getByRole("heading", { name: "Room dibuka di tab lain" })).toBeVisible();
  await expect(screen).toContainText("Anda bergabung dari tab atau perangkat lain dengan akun yang sama. Hanya satu sesi yang bisa aktif.");
  await expect(host.getByTestId("connection-status")).toHaveAttribute("data-status", "disconnected");

  // "Gunakan di tab ini" merebut kembali sesi; tab kedua yang sekarang terputus.
  await screen.getByRole("button", { name: "Gunakan di tab ini" }).click();
  await expectConnected(host);
  await expect(second.getByTestId("room-status-screen")).toHaveAttribute("data-kind", "disconnected");
});
