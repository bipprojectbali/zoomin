/** Custom grid (RND/plan/11-stage-control.md S8/S8a): host menata sel, menaruh layar ke sel kosong; klien lain sama. */
import type { Locator, Page } from "@playwright/test";
import { expect, identityOf, openRoom, stage, test, tile } from "./fixtures";
import { gridCells, pickTemplate, shareScreens } from "./stage.steps";

/** Seret tile lewat handle-nya ke `target` (pointer sensor dnd-kit butuh gerakan bertahap). */
async function dragTo(page: Page, source: Locator, target: Locator): Promise<void> {
  await source.hover();
  const handle = source.getByRole("button", { name: /^Drag to move / });
  const from = (await handle.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 + 10, { steps: 5 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 20 });
  await page.mouse.up();
}

test("custom grid: tambah baris/kolom, seret layar ke sel kosong, hapus baris kosong terakhir; klien lain sama", async ({ host, roomId, joinAs }) => {
  const guest = await joinAs("participant", "Penyaji Grid");
  const id = await identityOf(guest);
  await shareScreens(guest, 1);
  await openRoom(host, roomId);
  await expect(tile(host, id, "screen-1")).toBeVisible();
  const S1 = `${id}/screen-1`;
  const S2 = `${id}/screen-2`;

  await pickTemplate(host, "Custom grid");
  await expect(stage(host)).toHaveAttribute("data-template", "custom-grid");
  await expect.poll(() => gridCells(host)).toEqual([S1]);
  const toolbar = host.getByTestId("grid-toolbar");
  await toolbar.getByRole("button", { name: "Add column" }).click();
  await expect.poll(() => gridCells(host)).toEqual([S1, "empty"]);
  await toolbar.getByRole("button", { name: "Add row" }).click();
  await expect.poll(() => gridCells(host)).toEqual([S1, "empty", "empty", "empty"]);
  await expect(host.locator('[data-testid="stage-empty-cell"][data-cell-index="1"]')).toHaveText("Drop a screen here");
  await expect.poll(() => gridCells(guest)).toEqual([S1, "empty", "empty", "empty"]);

  // Layar kedua di luar layout masuk strip "Others"; diseret ke sel 1 (baris atas, kolom kanan).
  await shareScreens(guest, 2, 1);
  const extra = tile(host.getByTestId("stage-extras"), id, "screen-2");
  await expect(extra).toBeVisible();
  await dragTo(host, extra, host.locator('[data-testid="stage-empty-cell"][data-cell-index="1"]'));
  await expect.poll(() => gridCells(host)).toEqual([S1, S2, "empty", "empty"]);
  await expect(host.getByTestId("stage-extras")).toHaveCount(0);

  // Baris bawah kosong → boleh dihapus; kolom terakhir terisi → tidak.
  await expect(toolbar.getByRole("button", { name: "Remove last column" })).toBeDisabled();
  await toolbar.getByRole("button", { name: "Remove last row" }).click();
  await expect.poll(() => gridCells(host)).toEqual([S1, S2]);
  await expect(toolbar.getByRole("button", { name: "Remove last row" })).toBeDisabled();

  await expect(stage(guest)).toHaveAttribute("data-template", "custom-grid");
  await expect.poll(() => gridCells(guest)).toEqual([S1, S2]);
  await expect(guest.getByTestId("follow-host-chip")).toHaveCount(0);
});
