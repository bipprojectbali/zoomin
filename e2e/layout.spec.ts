import type { Page } from "@playwright/test";
import { expect, expectVideoFlowing, identityOf, openRoom, stage, stageOrder, test, tile, tileMenuAction } from "./fixtures";

type JoinAs = (role: "participant" | "viewer", name: string, media?: { camera?: boolean }) => Promise<Page>;
const AUTO_NOTE = "Layout otomatis (admin belum mengatur)";

/** Peserta kamera + 1 layar; layout otomatis: slot = layar saja, kamera di strip "Lainnya" (stage.resolve.ts). */
async function setupStage(admin: Page, roomId: string, joinAs: JoinAs) {
  const sharer = await joinAs("participant", "Penyaji Layout", { camera: true });
  const id = await identityOf(sharer);
  await sharer.getByTestId("add-screen").click();
  await expect(sharer.getByTestId("add-screen")).toHaveAccessibleName("Bagikan layar (1 aktif)");

  await openRoom(admin, roomId);
  await expectVideoFlowing(tile(admin, id, "screen-1"));
  await expectVideoFlowing(tile(admin, id, "camera"));
  await expect.poll(() => stageOrder(admin)).toEqual([`${id}/screen-1`]);
  await expect(admin.getByTestId("stage-extras").getByTestId("stage-tile")).toHaveAttribute("data-track-name", "camera");
  return { sharer, id, CAMERA: `${id}/camera`, SCREEN: `${id}/screen-1` };
}

/** Admin: template Fokus, tambahkan kamera ke layout, lalu pindah layar ke kanan → [kamera, layar]. */
async function arrange(admin: Page, id: string): Promise<string[]> {
  const toolbar = admin.getByTestId("layout-toolbar");
  await toolbar.getByRole("button", { name: "Fokus" }).click();
  await expect(toolbar.getByRole("button", { name: "Fokus" })).toHaveAttribute("aria-pressed", "true");
  await expect(stage(admin)).toHaveAttribute("data-template", "focus");
  await expect(admin.getByText(AUTO_NOTE)).toHaveCount(0);

  await tileMenuAction(admin, tile(admin, id, "camera"), "Tambahkan ke layout");
  await expect.poll(() => stageOrder(admin)).toEqual([`${id}/screen-1`, `${id}/camera`]);
  await expect(admin.getByTestId("stage-extras")).toHaveCount(0);

  await tileMenuAction(admin, tile(admin, id, "screen-1"), "Pindah ke kanan");
  await expect.poll(() => stageOrder(admin)).toEqual([`${id}/camera`, `${id}/screen-1`]);
  return stageOrder(admin);
}

test("layout: admin atur template & slot, penonton melihat layout yang sama", async ({ admin, roomId, joinAs }) => {
  const { id, SCREEN, CAMERA } = await setupStage(admin, roomId, joinAs);
  const viewer = await joinAs("viewer", "Penonton Layout");
  await expect.poll(() => stageOrder(viewer)).toEqual([SCREEN]);
  await expect(stage(viewer)).toHaveAttribute("data-template", "auto");
  await expect(viewer.getByText(AUTO_NOTE)).toBeVisible();

  const adminOrder = await arrange(admin, id);
  await expect(stage(viewer)).toHaveAttribute("data-template", "focus");
  await expect.poll(() => stageOrder(viewer)).toEqual(adminOrder);
  await expect(viewer.getByText(AUTO_NOTE)).toHaveCount(0);
  await expectVideoFlowing(tile(viewer, id, "camera"));

  // "Fokuskan untuk semua" pada slot 1 → jadi slot 0 di semua klien.
  await tileMenuAction(admin, tile(admin, id, "screen-1"), "Fokuskan untuk semua");
  await expect.poll(() => stageOrder(admin)).toEqual([SCREEN, CAMERA]);
  await expect.poll(() => stageOrder(viewer)).toEqual([SCREEN, CAMERA]);
  // Viewer tidak punya menu edit, hanya aksi lokal.
  await tile(viewer, id, "screen-1").hover();
  await tile(viewer, id, "screen-1").getByTestId("tile-menu").click();
  await expect(viewer.getByRole("menuitem", { name: "Perbesar" })).toBeVisible();
  await expect(viewer.getByRole("menuitem", { name: "Hapus dari layout" })).toHaveCount(0);
  await viewer.keyboard.press("Escape");
});

test("layout: penonton yang join belakangan menerima layout terkini; reload admin konsisten", async ({ admin, roomId, joinAs }) => {
  const { id } = await setupStage(admin, roomId, joinAs);
  const adminOrder = await arrange(admin, id);

  const late = await joinAs("viewer", "Penonton Telat");
  await expect(stage(late)).toHaveAttribute("data-template", "focus");
  await expect.poll(() => stageOrder(late)).toEqual(adminOrder);

  await admin.reload();
  await expect(admin.getByTestId("prejoin")).toBeVisible();
  await admin.getByTestId("prejoin-join").click();
  await expect.poll(() => stageOrder(admin)).toEqual(adminOrder);
  await expect(stage(admin)).toHaveAttribute("data-template", "focus");
});

test("layout: 'Hapus dari layout' tersiar; 'Perbesar' hanya lokal (layout penonton tetap)", async ({ admin, roomId, joinAs }) => {
  const { id, SCREEN, CAMERA } = await setupStage(admin, roomId, joinAs);
  const viewer = await joinAs("viewer", "Penonton Lokal");
  await arrange(admin, id);
  await expect.poll(() => stageOrder(viewer)).toEqual([CAMERA, SCREEN]);

  await tileMenuAction(admin, tile(admin, id, "camera"), "Hapus dari layout");
  await expect.poll(() => stageOrder(admin)).toEqual([SCREEN]);
  await expect.poll(() => stageOrder(viewer)).toEqual([SCREEN]);
  // Track yang dihapus tetap terlihat di strip "Lainnya".
  await expect(viewer.getByTestId("stage-extras").getByTestId("stage-tile")).toHaveAttribute("data-track-name", "camera");

  await tileMenuAction(admin, tile(admin, id, "screen-1"), "Perbesar");
  await expect(admin.getByTestId("tile-expanded")).toBeVisible();
  await expect(admin.getByTestId("tile-expanded").getByTestId("stage-tile")).toHaveAttribute("data-track-name", "screen-1");
  await expect(admin.getByTestId("layout-toolbar")).toHaveCount(0);
  // Penonton tidak terpengaruh.
  await expect(viewer.getByTestId("tile-expanded")).toHaveCount(0);
  await expect(stage(viewer)).toHaveAttribute("data-template", "focus");
  expect(await stageOrder(viewer)).toEqual([SCREEN]);
  await expect(viewer.getByTestId("stage-extras")).toBeVisible();

  await admin.getByTestId("tile-expanded").getByRole("button", { name: "Kembali ke layout" }).click();
  await expect(admin.getByTestId("tile-expanded")).toHaveCount(0);
  await expect(admin.getByTestId("layout-toolbar")).toBeVisible();
  await expect.poll(() => stageOrder(admin)).toEqual([SCREEN]);
});
