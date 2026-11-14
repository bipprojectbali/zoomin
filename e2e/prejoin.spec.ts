import { ADMIN_ID, createInvite, expect, expectConnected, expectVideoFlowing, identityOf, openRoom, passPreJoin, test, tile } from "./fixtures";

test("prejoin: mic & kamera dinyalakan sebelum join → setelah masuk keduanya aktif dan video terkirim", async ({ admin, roomId, joinAs }) => {
  await openRoom(admin, roomId);
  const guest = await joinAs("participant", "Peserta Siap", { mic: true, camera: true });
  await expect(guest.getByTestId("toggle-mic")).toHaveAttribute("aria-pressed", "true");
  await expect(guest.getByTestId("toggle-camera")).toHaveAttribute("aria-pressed", "true");
  await expectVideoFlowing(tile(admin, await identityOf(guest), "camera"));
});

test("prejoin: semua dimatikan → setelah masuk mic & kamera mati, tile tampil avatar", async ({ admin, roomId, joinAs }) => {
  await openRoom(admin, roomId);
  const guest = await joinAs("participant", "Peserta Senyap", { mic: false, camera: false });
  await expect(guest.getByTestId("toggle-mic")).toHaveAttribute("aria-pressed", "false");
  await expect(guest.getByTestId("toggle-camera")).toHaveAttribute("aria-pressed", "false");
  // Tanpa track kamera tidak ada video kamera tamu di stage admin (tile boleh absen atau tampil avatar).
  await expect(admin.locator(`[data-testid="stage-tile"][data-identity="${await identityOf(guest)}"] video`)).toHaveCount(0);
});

test("prejoin: admin buka /rooms/:id langsung → pre-join dulu, kamera nyala terbawa ke room", async ({ admin, roomId, newGuestPage }) => {
  await openRoom(admin, roomId, { camera: true, mic: false });
  await expect(admin.getByTestId("toggle-camera")).toHaveAttribute("aria-pressed", "true");
  await expect(admin.getByTestId("toggle-mic")).toHaveAttribute("aria-pressed", "false");
  // Penonton memverifikasi video admin benar-benar terkirim.
  const viewer = await newGuestPage();
  await viewer.goto(await createInvite(admin.request, roomId, "viewer"));
  await passPreJoin(viewer, {}, "Penonton Cek");
  await expectConnected(viewer);
  await expectVideoFlowing(tile(viewer, ADMIN_ID, "camera"));
});

test("prejoin: tamu tanpa sesi wajib isi nama sebelum bisa gabung", async ({ admin, roomId, newGuestPage }) => {
  const guest = await newGuestPage();
  await guest.goto(await createInvite(admin.request, roomId, "participant"));
  await expect(guest.getByTestId("prejoin")).toBeVisible();
  const join = guest.getByTestId("prejoin-join");
  const name = guest.getByTestId("prejoin-name");
  await expect(join).toBeDisabled();
  await name.fill("   ");
  await expect(join).toBeDisabled();
  await name.fill("Nama Wajib");
  await expect(join).toBeEnabled();
  await join.click();
  await expectConnected(guest);
});

test("prejoin: penonton tanpa toggle mic/kamera, tetap isi nama", async ({ admin, roomId, newGuestPage }) => {
  const viewer = await newGuestPage();
  await viewer.goto(await createInvite(admin.request, roomId, "viewer"));
  await expect(viewer.getByTestId("prejoin")).toBeVisible();
  await expect(viewer.getByText("Anda masuk sebagai penonton. Kamera dan mikrofon tidak digunakan.")).toBeVisible();
  await expect(viewer.getByTestId("prejoin-toggle-mic")).toHaveCount(0);
  await expect(viewer.getByTestId("prejoin-toggle-camera")).toHaveCount(0);
  await expect(viewer.getByTestId("prejoin-name")).toBeVisible();
  await passPreJoin(viewer, {}, "Penonton Prejoin");
  await expectConnected(viewer);
  await expect(viewer.getByTestId("toggle-mic")).toHaveCount(0);
});

test("undangan rusak → invite-error, tanpa pre-join", async ({ page, allowConsole }) => {
  // InvitePage mencatat preview gagal (400 invite_invalid) via console.error; Chromium juga mencatat respons 400.
  allowConsole(/^invite: preview gagal/, /status of 400/);
  await page.goto("/invite/ini-bukan-undangan-valid");
  const error = page.getByTestId("invite-error");
  await expect(error).toBeVisible();
  await expect(error.getByRole("heading", { name: "Undangan tidak dapat dipakai" })).toBeVisible();
  await expect(error).toContainText("Link undangan tidak valid atau sudah kedaluwarsa");
  await expect(page.getByTestId("prejoin")).toHaveCount(0);
});
