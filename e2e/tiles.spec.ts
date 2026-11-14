import { ADMIN_ID, expect, expectVideoFlowing, identityOf, openRoom, test, tile } from "./fixtures";

test("avatar: admin & peserta tanpa kamera punya tile avatar, penonton tidak (QA-01)", async ({ admin, roomId, joinAs }) => {
  await openRoom(admin, roomId);
  const guest = await joinAs("participant", "Budi Santoso", { camera: false });
  const viewer = await joinAs("viewer", "Penonton Avatar");
  const [guestId, viewerId] = await Promise.all([identityOf(guest), identityOf(viewer)]);

  for (const page of [admin, guest, viewer]) {
    for (const id of [ADMIN_ID, guestId]) {
      const t = tile(page, id, "camera");
      await expect(t).toBeVisible();
      await expect(t).toHaveAttribute("data-state", "inactive");
      await expect(t.locator("video")).toHaveCount(0);
    }
    await expect(page.locator(`[data-testid="stage-tile"][data-identity="${viewerId}"]`)).toHaveCount(0);
  }
  await expect(tile(admin, guestId, "camera")).toContainText("BS");

  // Kamera dinyalakan → tile yang sama berganti video.
  await guest.getByTestId("toggle-camera").click();
  await expectVideoFlowing(tile(admin, guestId, "camera"));
  await expect(tile(admin, guestId, "camera")).toHaveAttribute("data-state", "active");
});

test("layar sendiri: pemilik melihat own-screen-notice, penonton melihat video (QA-02)", async ({ joinAs }) => {
  const sharer = await joinAs("participant", "Penyaji Cermin");
  const id = await identityOf(sharer);
  const viewer = await joinAs("viewer", "Penonton Cermin");
  await sharer.getByTestId("add-screen").click();
  await expect(sharer.getByTestId("add-screen")).toHaveAccessibleName("Bagikan layar (1 aktif)");

  await expectVideoFlowing(tile(viewer, id, "screen-1"));
  await expect(tile(viewer, id, "screen-1").getByTestId("own-screen-notice")).toHaveCount(0);

  const own = tile(sharer, id, "screen-1");
  await expect(own.getByTestId("own-screen-notice")).toBeVisible();
  await expect(own.locator("video")).toHaveCount(0);
});
