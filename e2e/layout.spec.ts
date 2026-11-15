import type { Page } from "@playwright/test";
import { expect, expectVideoFlowing, identityOf, openRoom, stage, stageOrder, test, tile, tileMenuAction } from "./fixtures";

type JoinAs = (role: "participant" | "viewer", name: string, media?: { camera?: boolean }) => Promise<Page>;
const AUTO_NOTE = "Automatic layout (host hasn't set one)";

/**
 * Peserta kamera + 1 layar; layout otomatis: slot = layar saja, kamera di strip orang (S10, stage.split.ts).
 * Admin tanpa kamera ikut punya tile avatar (QA-01) di strip, jadi strip disaring per identity.
 */
async function setupStage(host: Page, roomId: string, joinAs: JoinAs) {
  const sharer = await joinAs("participant", "Penyaji Layout", { camera: true });
  const id = await identityOf(sharer);
  await sharer.getByTestId("add-screen").click();
  await expect(sharer.getByTestId("add-screen")).toHaveAccessibleName("Share screen (1 active)");

  await openRoom(host, roomId);
  await expectVideoFlowing(tile(host, id, "screen-1"));
  await expectVideoFlowing(tile(host, id, "camera"));
  await expect.poll(() => stageOrder(host)).toEqual([`${id}/screen-1`]);
  const people = host.getByTestId("people-strip");
  await expect(tile(people, id, "camera")).toBeVisible();
  await expect(tile(people, await identityOf(host), "camera")).toBeVisible();
  return { sharer, id, CAMERA: `${id}/camera`, SCREEN: `${id}/screen-1` };
}

/** Admin: template Fokus, spotlight kamera ke panggung, lalu pindah layar ke kanan → [kamera, layar]. */
async function arrange(host: Page, id: string): Promise<string[]> {
  const toolbar = host.getByTestId("layout-toolbar");
  await toolbar.getByRole("button", { name: "Focus" }).click();
  await expect(toolbar.getByRole("button", { name: "Focus" })).toHaveAttribute("aria-pressed", "true");
  await expect(stage(host)).toHaveAttribute("data-template", "focus");
  await expect(host.getByText(AUTO_NOTE)).toHaveCount(0);

  await tileMenuAction(host, tile(host, id, "camera"), "Spotlight on stage");
  await expect.poll(() => stageOrder(host)).toEqual([`${id}/screen-1`, `${id}/camera`]);
  // Kamera penyaji pindah ke slot (tidak tampil ganda di strip orang); strip tinggal avatar host.
  await expect(tile(host.getByTestId("people-strip"), id, "camera")).toHaveCount(0);

  await tileMenuAction(host, tile(host, id, "screen-1"), "Move right");
  await expect.poll(() => stageOrder(host)).toEqual([`${id}/camera`, `${id}/screen-1`]);
  return stageOrder(host);
}

test("layout: host atur template & slot, penonton melihat layout yang sama", async ({ host, roomId, joinAs }) => {
  const { id, SCREEN, CAMERA } = await setupStage(host, roomId, joinAs);
  const viewer = await joinAs("viewer", "Penonton Layout");
  await expect.poll(() => stageOrder(viewer)).toEqual([SCREEN]);
  await expect(stage(viewer)).toHaveAttribute("data-template", "auto");
  // Catatan layout otomatis hanya untuk yang bisa mengedit (host), bukan penonton.
  await expect(host.getByText(AUTO_NOTE)).toBeVisible();
  await expect(viewer.getByText(AUTO_NOTE)).toHaveCount(0);

  const hostOrder = await arrange(host, id);
  await expect(stage(viewer)).toHaveAttribute("data-template", "focus");
  await expect.poll(() => stageOrder(viewer)).toEqual(hostOrder);
  await expectVideoFlowing(tile(viewer, id, "camera"));

  // "Focus for everyone" pada slot 1 → jadi slot 0 di semua klien.
  await tileMenuAction(host, tile(host, id, "screen-1"), "Focus for everyone");
  await expect.poll(() => stageOrder(host)).toEqual([SCREEN, CAMERA]);
  await expect.poll(() => stageOrder(viewer)).toEqual([SCREEN, CAMERA]);
  // Edit viewer hanya mengubah tampilannya sendiri (S12): fokus berlabel "Focus for me", chip Follow host muncul,
  // layout bersama di klien lain tetap.
  await expect(viewer.getByTestId("follow-host-chip")).toHaveCount(0);
  await tileMenuAction(viewer, tile(viewer, id, "camera"), "Focus for me");
  await expect.poll(() => stageOrder(viewer)).toEqual([CAMERA, SCREEN]);
  await expect(viewer.getByTestId("follow-host-chip")).toBeVisible();
  await tileMenuAction(viewer, tile(viewer, id, "camera"), "Remove from layout");
  await expect.poll(() => stageOrder(viewer)).toEqual([SCREEN]);
  // Viewer tetap tidak bisa menulis layout bersama (S3).
  const put = await viewer.request.put(`/api/rooms/${roomId}/layout`, { data: { baseVersion: 0, layout: null } });
  expect(put.status()).toBe(403);
  expect(((await put.json()) as { code: string }).code).toBe("stage_locked");
  expect(await stageOrder(host)).toEqual([SCREEN, CAMERA]);
});

test("layout: penonton yang join belakangan menerima layout terkini; reload host konsisten", async ({ host, roomId, joinAs }) => {
  const { id } = await setupStage(host, roomId, joinAs);
  const hostOrder = await arrange(host, id);

  const late = await joinAs("viewer", "Penonton Telat");
  await expect(stage(late)).toHaveAttribute("data-template", "focus");
  await expect.poll(() => stageOrder(late)).toEqual(hostOrder);

  await host.reload();
  await expect(host.getByTestId("prejoin")).toBeVisible();
  await host.getByTestId("prejoin-join").click();
  await expect.poll(() => stageOrder(host)).toEqual(hostOrder);
  await expect(stage(host)).toHaveAttribute("data-template", "focus");
});

test("layout: 'Remove from layout' tersiar; 'Expand' hanya lokal (layout penonton tetap)", async ({ host, roomId, joinAs }) => {
  const { id, SCREEN, CAMERA } = await setupStage(host, roomId, joinAs);
  const viewer = await joinAs("viewer", "Penonton Lokal");
  await arrange(host, id);
  await expect.poll(() => stageOrder(viewer)).toEqual([CAMERA, SCREEN]);

  await tileMenuAction(host, tile(host, id, "camera"), "Remove from layout");
  await expect.poll(() => stageOrder(host)).toEqual([SCREEN]);
  await expect.poll(() => stageOrder(viewer)).toEqual([SCREEN]);
  // Kamera yang dihapus dari panggung kembali ke strip orang.
  await expect(tile(viewer.getByTestId("people-strip"), id, "camera")).toBeVisible();

  await tileMenuAction(host, tile(host, id, "screen-1"), "Expand");
  await expect(host.getByTestId("tile-expanded")).toBeVisible();
  await expect(host.getByTestId("tile-expanded").getByTestId("stage-tile")).toHaveAttribute("data-track-name", "screen-1");
  await expect(host.getByTestId("layout-toolbar")).toHaveCount(0);
  // Penonton tidak terpengaruh.
  await expect(viewer.getByTestId("tile-expanded")).toHaveCount(0);
  await expect(stage(viewer)).toHaveAttribute("data-template", "focus");
  expect(await stageOrder(viewer)).toEqual([SCREEN]);
  await expect(viewer.getByTestId("people-strip")).toBeVisible();

  await host.getByTestId("tile-expanded").getByRole("button", { name: "Back to layout" }).click();
  await expect(host.getByTestId("tile-expanded")).toHaveCount(0);
  await expect(host.getByTestId("layout-toolbar")).toBeVisible();
  await expect.poll(() => stageOrder(host)).toEqual([SCREEN]);
});
