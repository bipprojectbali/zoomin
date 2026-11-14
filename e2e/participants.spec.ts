import { ADMIN_ID, expect, identityOf, openRoom, test } from "./fixtures";

test("participants: viewer & peserta tanpa kamera terdaftar, Anda dulu, badge peran", async ({ admin, roomId, joinAs }) => {
  await openRoom(admin, roomId);
  const guest = await joinAs("participant", "Peserta Tanpa Kamera", { camera: false, mic: false });
  const viewer = await joinAs("viewer", "Penonton Daftar");
  const [guestId, viewerId] = await Promise.all([identityOf(guest), identityOf(viewer)]);

  // Sudut pandang penonton: dirinya dulu meski peran terendah, lalu admin, peserta.
  await viewer.getByTestId("open-participants").click();
  const panel = viewer.getByTestId("participants-panel");
  await expect(panel).toBeVisible();
  const rows = panel.getByTestId("participant-row");
  await expect(rows).toHaveCount(3);
  await expect.poll(() => rows.evaluateAll((els) => els.map((e) => [e.getAttribute("data-identity"), e.getAttribute("data-role")]))).toEqual([
    [viewerId, "viewer"],
    [ADMIN_ID, "admin"],
    [guestId, "participant"],
  ]);
  const badge = (i: number) => rows.nth(i).locator('[data-slot="badge"]');
  await expect(rows.nth(0)).toContainText("Penonton Daftar (Anda)");
  await expect(badge(0)).toHaveText("Penonton");
  await expect(badge(1)).toHaveText("Admin");
  await expect(rows.nth(2)).toContainText("Peserta Tanpa Kamera");
  await expect(badge(2)).toHaveText("Peserta");
  await expect(rows.nth(2)).toContainText("Mikrofon mati");
  await expect(panel.getByRole("heading", { name: "Peserta (3)" })).toBeVisible();

  // Sudut pandang admin: Anda dulu.
  await admin.getByTestId("open-participants").click();
  const adminRows = admin.getByTestId("participants-panel").getByTestId("participant-row");
  await expect(adminRows).toHaveCount(3);
  await expect(adminRows.nth(0)).toHaveAttribute("data-identity", ADMIN_ID);
  await expect(adminRows.nth(0)).toContainText("(Anda)");
});
