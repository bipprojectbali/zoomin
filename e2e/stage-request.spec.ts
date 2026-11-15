/**
 * Mode Request (RND/plan/11-stage-control.md S4–S7): participant meminta tampil dari menu tile layarnya sendiri,
 * host Approve (layout diterapkan klien host) / Deny, pemohon membatalkan, ganti mode membatalkan yang pending.
 */
import type { Page } from "@playwright/test";
import { expect, identityOf, openRoom, stage, stageOrder, test, tile, tileMenuAction, toast } from "./fixtures";
import { apiStageMode, chooseStageMode, modeBadge, shareScreens } from "./stage.steps";

const queue = (host: Page) => host.getByTestId("stage-requests");

test("request: Request full stage → Approve (fokus di semua klien); Deny → toast declined; Cancel; ganti mode mengosongkan antrean", async ({ host, roomId, joinAs }) => {
  await apiStageMode(host.request, roomId, "request");
  await openRoom(host, roomId);
  const guest = await joinAs("participant", "Peminta Panggung");
  const id = await identityOf(guest);
  await expect(modeBadge(guest)).toHaveAttribute("data-mode", "request");
  await shareScreens(guest, 2);
  const SCREEN1 = `${id}/screen-1`;
  const SCREEN2 = `${id}/screen-2`;
  await expect.poll(() => stageOrder(host)).toEqual([SCREEN1, SCREEN2]);
  await expect(queue(host)).toHaveAttribute("data-count", "0");

  // 1) Request full stage → toast + antrean host → Approve dari toast.
  await tileMenuAction(guest, tile(guest, id, "screen-2"), "Request full stage");
  await expect(toast(guest, "Request sent to the host")).toBeVisible();
  const incoming = toast(host, "Peminta Panggung asks to take the full stage");
  await expect(incoming).toBeVisible();
  await expect(queue(host)).toHaveAttribute("data-count", "1");
  await incoming.getByTestId("stage-request-approve").click();
  for (const page of [host, guest]) {
    await expect(stage(page)).toHaveAttribute("data-template", "focus");
    await expect.poll(() => stageOrder(page)).toEqual([SCREEN2, SCREEN1]);
  }
  await expect(toast(guest, "Your stage request was approved")).toBeVisible();
  await expect(queue(host)).toHaveAttribute("data-count", "0");

  // 2) Request to show → Deny dari panel antrean → pemohon dapat toast declined; layout tetap.
  await tileMenuAction(guest, tile(guest, id, "screen-1"), "Request to show");
  await expect(queue(host)).toHaveAttribute("data-count", "1");
  await queue(host).click();
  const item = host.getByTestId("stage-request-item");
  await expect(item).toHaveCount(1);
  await expect(item).toContainText("Peminta Panggung asks to show a screen");
  await item.getByTestId("stage-request-deny").click();
  await expect(toast(guest, "Your stage request was declined")).toBeVisible();
  await expect(queue(host)).toHaveAttribute("data-count", "0");
  await host.keyboard.press("Escape");
  await expect.poll(() => stageOrder(host)).toEqual([SCREEN2, SCREEN1]);

  // 3) Pending → menu tile berganti "Cancel request" → antrean host kosong lagi.
  await tileMenuAction(guest, tile(guest, id, "screen-1"), "Request to show");
  await expect(queue(host)).toHaveAttribute("data-count", "1");
  await tileMenuAction(guest, tile(guest, id, "screen-1"), "Cancel request");
  await expect(queue(host)).toHaveAttribute("data-count", "0");

  // 4) Pending lalu host ganti ke Host only → request dibatalkan server, antrean (dan tombolnya) hilang.
  await tileMenuAction(guest, tile(guest, id, "screen-2"), "Request to show");
  await expect(queue(host)).toHaveAttribute("data-count", "1");
  await chooseStageMode(host, "host");
  await expect(queue(host)).toHaveCount(0);
  await expect(modeBadge(guest)).toHaveAttribute("data-mode", "host");
  const res = await host.request.get(`/api/rooms/${roomId}/stage-requests`);
  expect(((await res.json()) as { items: unknown[] }).items).toEqual([]);
  // Menu tile pemohon tidak lagi menawarkan request.
  const own = tile(guest, id, "screen-2");
  await own.hover();
  await own.getByTestId("tile-menu").click();
  await expect(guest.getByRole("menuitem", { name: "Expand" })).toBeVisible();
  await expect(guest.getByRole("menuitem", { name: /request/i })).toHaveCount(0);
  await guest.keyboard.press("Escape");
});
