/**
 * Stage control (RND/plan/11-stage-control.md S1/S3/S7/S12): mode Host only / Open dari menu header, form buat room,
 * dan tab Umum Pengaturan room. Request → stage-request.spec.ts, custom grid → stage-grid.spec.ts,
 * View & Follow host → stage-view.spec.ts.
 */
import type { Page } from "@playwright/test";
import { expect, identityOf, loginAdmin, openRoom, passPreJoin, expectConnected, stage, stageOrder, test, tile, toast } from "./fixtures";
import { chooseStageMode, modeBadge, pickTemplate, shareScreens } from "./stage.steps";

const card = (page: Page, roomId: string) => page.locator(`[data-testid="room-item"][data-room-id="${roomId}"]`);

test("stage mode: Host only → Open tersiar live; Open = participant mengedit panggung bersama; kembali Host only = lokal", async ({ host, roomId, joinAs }) => {
  await openRoom(host, roomId);
  const guest = await joinAs("participant", "Peserta Open");
  const id = await identityOf(guest);
  await shareScreens(guest, 2);
  await expect.poll(() => stageOrder(host)).toEqual([`${id}/screen-1`, `${id}/screen-2`]);
  await expect(modeBadge(guest)).toHaveAttribute("data-mode", "host");
  await expect(guest.getByTestId("stage-mode-menu")).toHaveCount(0);

  await chooseStageMode(host, "open");
  await expect(modeBadge(guest)).toHaveAttribute("data-mode", "open");

  // Open: edit participant = PUT layout bersama, host ikut berubah; tanpa chip Follow host.
  await pickTemplate(guest, "Focus");
  await expect(stage(host)).toHaveAttribute("data-template", "focus");
  await expect(guest.getByTestId("follow-host-chip")).toHaveCount(0);

  await chooseStageMode(host, "host");
  await expect(modeBadge(guest)).toHaveAttribute("data-mode", "host");
  // Mode ganti tidak mengubah layout yang tampil (S1).
  await expect(stage(guest)).toHaveAttribute("data-template", "focus");

  // Host only: edit participant hanya lokal (S12) → chip, host tetap Focus; PUT langsung ditolak (S3).
  await pickTemplate(guest, "Grid");
  await expect(stage(guest)).toHaveAttribute("data-template", "grid");
  await expect(guest.getByTestId("follow-host-chip")).toBeVisible();
  const put = await guest.request.put(`/api/rooms/${roomId}/layout`, { data: { baseVersion: 1, layout: null } });
  expect(put.status()).toBe(403);
  expect(((await put.json()) as { code: string }).code).toBe("stage_locked");
  await expect(stage(host)).toHaveAttribute("data-template", "focus");
  await expect(tile(host, id, "screen-1")).toBeVisible();
});

test("stage mode: buat room dengan Stage control = Request → badge Request; tab Umum Pengaturan ganti ke Open", async ({ page, root, roomId }) => {
  await loginAdmin(page, root, "Pembuat Stage");
  await page.goto("/app");
  const form = page.getByTestId("create-room-form");
  await form.getByLabel("Room title").fill(`Stage ${roomId}`);
  await form.getByText("Advanced options").click();
  await form.getByLabel("Room ID").fill(roomId);
  await form.getByTestId("create-room-stage-mode").click();
  await page.getByRole("option", { name: "Request", exact: true }).click();
  await expect(form.getByTestId("create-room-stage-mode")).toHaveText("Request");
  await form.getByRole("button", { name: "Create room" }).click();
  await expect(card(page, roomId)).toBeVisible();

  await card(page, roomId).getByTestId("room-enter").click();
  await passPreJoin(page);
  await expectConnected(page);
  await expect(modeBadge(page)).toHaveAttribute("data-mode", "request");
  await expect(modeBadge(page)).toHaveText("Stage: Request");
  await expect(page.getByTestId("stage-requests")).toHaveAttribute("data-count", "0");

  await page.goto("/app");
  await card(page, roomId).getByTestId("room-menu").click();
  await page.getByTestId("room-menu-settings").click();
  const dialog = page.getByTestId("room-settings-dialog");
  await dialog.getByTestId("room-settings-tab-general").click();
  const select = dialog.getByTestId("room-settings-stage-mode");
  await expect(select).toHaveText("Request");
  await select.click();
  await page.getByRole("option", { name: "Open", exact: true }).click();
  await dialog.getByTestId("room-settings-save").click();
  await expect(toast(page, "Settings saved")).toBeVisible();

  await openRoom(page, roomId);
  await expect(modeBadge(page)).toHaveAttribute("data-mode", "open");
  await expect(page.getByTestId("stage-requests")).toHaveCount(0);
});
