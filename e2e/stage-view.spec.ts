/** Menu View lokal (S11) dan Follow host (S12), RND/plan/11-stage-control.md. */
import type { Page } from "@playwright/test";
import { expect, expectConnected, identityOf, openRoom, stage, test, tile } from "./fixtures";
import { pickTemplate, shareScreens } from "./stage.steps";

async function chooseView(page: Page, name: string): Promise<void> {
  await page.getByTestId("view-menu").click();
  await page.getByRole("menuitemradio", { name, exact: true }).click();
  // Tunggu menu tertutup: klik trigger saat menu masih menutup diabaikan Radix.
  await expect(page.getByRole("menu")).toHaveCount(0);
}

test("view: Gallery/Speaker/Content only hanya mengubah tampilan sendiri; strip bawah bertahan setelah reload", async ({ host, hostId, roomId, joinAs }) => {
  const guest = await joinAs("participant", "Penyaji View", { camera: true });
  const id = await identityOf(guest);
  await shareScreens(guest, 1);
  await openRoom(host, roomId);
  await expect(tile(host, id, "screen-1")).toBeVisible();

  const strip = host.getByTestId("people-strip");
  await expect(stage(host)).toHaveAttribute("data-view", "stage");
  await expect(strip).toHaveAttribute("data-position", "right");
  await expect(tile(strip, id, "camera")).toBeVisible();

  await chooseView(host, "Gallery");
  await expect(stage(host)).toHaveAttribute("data-view", "gallery");
  // Tile ada di gallery; keterlihatannya (lebar > 0) diuji terpisah di test E2E-05 di bawah.
  await expect(tile(host.getByTestId("people-gallery"), id, "camera")).toHaveCount(1);
  await expect(tile(host.getByTestId("people-gallery"), hostId, "camera")).toHaveCount(1);
  await expect(strip).toHaveCount(0);
  await expect(tile(host, id, "screen-1")).toHaveCount(0);

  await chooseView(host, "Speaker");
  await expect(stage(host)).toHaveAttribute("data-view", "speaker");
  await expect(host.getByTestId("speaker-view").getByTestId("stage-tile")).toHaveCount(1);
  await expect(strip).toBeVisible();

  await chooseView(host, "Content only");
  await expect(stage(host)).toHaveAttribute("data-view", "stage");
  await expect(tile(host, id, "screen-1")).toBeVisible();
  await expect(strip).toHaveCount(0);

  // Klien lain tidak terpengaruh.
  await expect(stage(guest)).toHaveAttribute("data-view", "stage");
  await expect(guest.getByTestId("people-strip")).toBeVisible();

  await chooseView(host, "Auto");
  await chooseView(host, "Bottom");
  await expect(strip).toHaveAttribute("data-position", "bottom");
  await expect(guest.getByTestId("people-strip")).toHaveAttribute("data-position", "right");

  await host.reload();
  await host.getByTestId("prejoin-join").click();
  await expectConnected(host);
  await expect(stage(host)).toHaveAttribute("data-view", "stage");
  await expect(host.getByTestId("people-strip")).toHaveAttribute("data-position", "bottom");

  await chooseView(host, "Hidden");
  await expect(host.getByTestId("people-strip")).toHaveCount(0);
});

// BUG(e2e): E2E-05 — Gallery merender tile selebar 0 px (panggung kosong). Hapus test.fail() setelah diperbaiki.
test("view: Gallery menampilkan kamera semua orang (E2E-05)", async ({ host, hostId, roomId, joinAs }) => {
  test.fail();
  const guest = await joinAs("participant", "Kamera Gallery", { camera: true });
  const id = await identityOf(guest);
  await openRoom(host, roomId);
  await expect(tile(host, id, "camera")).toBeVisible();
  await chooseView(host, "Gallery");
  const gallery = host.getByTestId("people-gallery");
  await expect(tile(gallery, id, "camera")).toHaveCount(1);
  await expect.poll(async () => (await gallery.boundingBox())?.width ?? 0, { timeout: 5_000 }).toBeGreaterThan(100);
  await expect(tile(gallery, id, "camera")).toBeVisible({ timeout: 5_000 });
  await expect(tile(gallery, hostId, "camera")).toBeVisible({ timeout: 5_000 });
});

test("follow host: edit lokal participant → chip; host ubah layout → chip 'changed'; Follow host kembali ke layout bersama", async ({ host, roomId, joinAs }) => {
  const guest = await joinAs("participant", "Pengikut Host");
  const id = await identityOf(guest);
  await shareScreens(guest, 2);
  await openRoom(host, roomId);
  await expect(tile(host, id, "screen-2")).toBeVisible();

  const chip = guest.getByTestId("follow-host-chip");
  await expect(chip).toHaveCount(0);
  await pickTemplate(guest, "Focus");
  await expect(stage(guest)).toHaveAttribute("data-template", "focus");
  await expect(chip).toHaveAttribute("data-changed", "false");
  await expect(chip).toContainText("Viewing your own layout");
  // Layout bersama tetap otomatis di host.
  await expect(stage(host)).toHaveAttribute("data-template", "auto");

  await pickTemplate(host, "Grid");
  await expect(stage(host)).toHaveAttribute("data-template", "grid");
  await expect(chip).toHaveAttribute("data-changed", "true");
  await expect(chip).toContainText("Host layout changed");
  await expect(stage(guest)).toHaveAttribute("data-template", "focus");

  await chip.getByRole("button", { name: "Follow host" }).click();
  await expect(chip).toHaveCount(0);
  await expect(stage(guest)).toHaveAttribute("data-template", "grid");
});
