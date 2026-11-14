import { expect, identityOf, openRoom, test } from "./fixtures";

test("participants: viewer & peserta tanpa kamera terdaftar, Anda dulu, badge peran", async ({ host, hostId, roomId, joinAs }) => {
  await openRoom(host, roomId);
  const guest = await joinAs("participant", "Peserta Tanpa Kamera", { camera: false, mic: false });
  const viewer = await joinAs("viewer", "Penonton Daftar");
  const [guestId, viewerId] = await Promise.all([identityOf(guest), identityOf(viewer)]);

  // Sudut pandang penonton: dirinya dulu meski peran terendah, lalu host, peserta.
  await viewer.getByTestId("open-participants").click();
  const panel = viewer.getByTestId("participants-panel");
  await expect(panel).toBeVisible();
  const rows = panel.getByTestId("participant-row");
  await expect(rows).toHaveCount(3);
  await expect.poll(() => rows.evaluateAll((els) => els.map((e) => [e.getAttribute("data-identity"), e.getAttribute("data-role")]))).toEqual([
    [viewerId, "viewer"],
    [hostId, "host"],
    [guestId, "participant"],
  ]);
  const badge = (i: number) => rows.nth(i).locator('[data-slot="badge"]');
  await expect(rows.nth(0)).toContainText("Penonton Daftar (you)");
  await expect(badge(0)).toHaveText("Viewer");
  await expect(badge(1)).toHaveText("Host");
  await expect(rows.nth(2)).toContainText("Peserta Tanpa Kamera");
  await expect(badge(2)).toHaveText("Participant");
  await expect(rows.nth(2)).toContainText("Microphone off");
  await expect(panel.getByRole("heading", { name: "Participants (3)" })).toBeVisible();

  // Sudut pandang host: Anda dulu.
  await host.getByTestId("open-participants").click();
  const hostRows = host.getByTestId("participants-panel").getByTestId("participant-row");
  await expect(hostRows).toHaveCount(3);
  await expect(hostRows.nth(0)).toHaveAttribute("data-identity", hostId);
  await expect(hostRows.nth(0)).toContainText("(you)");
});
