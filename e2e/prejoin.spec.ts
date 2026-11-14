import { createInvite, expect, expectConnected, expectVideoFlowing, identityOf, loginAs, newIdentity, openRoom, passPreJoin, test, tile } from "./fixtures";

test("prejoin: mic & kamera dinyalakan sebelum join → setelah masuk keduanya aktif dan video terkirim", async ({ host, roomId, joinAs }) => {
  await openRoom(host, roomId);
  const guest = await joinAs("participant", "Peserta Siap", { mic: true, camera: true });
  await expect(guest.getByTestId("toggle-mic")).toHaveAttribute("aria-pressed", "true");
  await expect(guest.getByTestId("toggle-camera")).toHaveAttribute("aria-pressed", "true");
  await expectVideoFlowing(tile(host, await identityOf(guest), "camera"));
});

test("prejoin: semua dimatikan → setelah masuk mic & kamera mati, tile tampil avatar", async ({ host, roomId, joinAs }) => {
  await openRoom(host, roomId);
  const guest = await joinAs("participant", "Peserta Senyap", { mic: false, camera: false });
  await expect(guest.getByTestId("toggle-mic")).toHaveAttribute("aria-pressed", "false");
  await expect(guest.getByTestId("toggle-camera")).toHaveAttribute("aria-pressed", "false");
  // Tanpa track kamera tidak ada video kamera tamu di stage host (tile boleh absen atau tampil avatar).
  await expect(host.locator(`[data-testid="stage-tile"][data-identity="${await identityOf(guest)}"] video`)).toHaveCount(0);
});

test("prejoin: host buka /rooms/:id langsung → pre-join dulu, kamera nyala terbawa ke room", async ({ host, hostId, roomId, joinAs }) => {
  await openRoom(host, roomId, { camera: true, mic: false });
  await expect(host.getByTestId("toggle-camera")).toHaveAttribute("aria-pressed", "true");
  await expect(host.getByTestId("toggle-mic")).toHaveAttribute("aria-pressed", "false");
  // Penonton memverifikasi video host benar-benar terkirim.
  const viewer = await joinAs("viewer", "Penonton Cek");
  await expectVideoFlowing(tile(viewer, hostId, "camera"));
});

test("undangan: tamu tanpa sesi wajib masuk dulu (tanpa pre-join); setelah login → pre-join tanpa isian nama", async ({ host, roomId, newGuestPage }) => {
  const url = await createInvite(host.request, roomId, "participant");
  const guest = await newGuestPage();
  await guest.goto(url);
  const signin = guest.getByTestId("invite-signin");
  await expect(signin).toBeVisible();
  await expect(signin.getByRole("heading", { name: `Room ${roomId}` })).toBeVisible();
  await expect(signin.getByTestId("invite-role")).toHaveText("Peserta");
  await expect(guest.getByTestId("invite-google")).toBeVisible();
  await expect(guest.getByTestId("prejoin")).toHaveCount(0);

  const who = newIdentity("Tamu Undangan");
  await loginAs(guest, who);
  await guest.reload();
  await expect(guest.getByTestId("prejoin")).toBeVisible();
  // Nama diambil dari akun, bukan diketik di pre-join.
  await expect(guest.getByTestId("prejoin-name")).toHaveCount(0);
  await expect(guest.getByTestId("invite-signed-in-as")).toHaveText(`Masuk sebagai ${who.name} (${who.email})`);
  await passPreJoin(guest);
  await expectConnected(guest);
});

test("prejoin: penonton tanpa toggle mic/kamera", async ({ host, roomId, newGuestPage }) => {
  const viewer = await newGuestPage();
  await loginAs(viewer, newIdentity("Penonton Prejoin"));
  await viewer.goto(await createInvite(host.request, roomId, "viewer"));
  await expect(viewer.getByTestId("prejoin")).toBeVisible();
  await expect(viewer.getByText("Anda masuk sebagai penonton. Kamera dan mikrofon tidak digunakan.")).toBeVisible();
  await expect(viewer.getByTestId("prejoin-toggle-mic")).toHaveCount(0);
  await expect(viewer.getByTestId("prejoin-toggle-camera")).toHaveCount(0);
  await passPreJoin(viewer);
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
