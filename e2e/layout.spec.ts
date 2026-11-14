import type { Page } from "@playwright/test";
import { expect, expectVideoFlowing, KIND, openRoom, stageOrder, test, tile } from "./fixtures";

const SHARER = "Penyaji Layout";
const CAMERA = `${SHARER} · ${KIND.camera}`;
const SCREEN = `${SHARER} · ${KIND.screen(1)}`;
const AUTO_NOTE = "Layout otomatis (admin belum mengatur)";

/**
 * Template yang sedang dirender (StageTemplates.tsx): focus = panel group vertikal, side-by-side = horizontal,
 * grid = tanpa panel group. Sementara lewat DOM react-resizable-panels (data-group + flexDirection) sampai ada
 * data-testid/data-template di stage.
 */
function renderedTemplate(page: Page): Promise<string> {
  return page.locator("main").evaluate((main) => {
    const group = main.querySelector<HTMLElement>("[data-group]");
    if (!group) return "grid";
    return group.style.flexDirection === "column" ? "focus" : "side-by-side";
  });
}

/** Peserta menyalakan kamera + 1 layar; admin membuka room dan melihat 2 slot layout otomatis. */
async function setupStage(admin: Page, roomId: string, joinAs: (r: "participant" | "viewer", n: string) => Promise<Page>) {
  const sharer = await joinAs("participant", SHARER);
  await sharer.getByRole("button", { name: "Kamera", exact: true }).click();
  await sharer.getByRole("button", { name: "Tambah layar" }).click();
  await expect(sharer.getByRole("button", { name: "Hentikan screen-1" })).toBeVisible();

  await openRoom(admin, roomId);
  await expectVideoFlowing(tile(admin, SHARER, KIND.camera));
  await expectVideoFlowing(tile(admin, SHARER, KIND.screen(1)));
  // Layout otomatis: layar dulu, lalu kamera (stage.resolve.ts autoLayout).
  await expect.poll(() => stageOrder(admin)).toEqual([SCREEN, CAMERA]);
  return sharer;
}

/** Admin pilih template Fokus lalu tukar slot 0 ↔ 1; kembalikan urutan akhir di sisi admin. */
async function focusAndSwap(admin: Page): Promise<string[]> {
  const toolbar = admin.getByRole("toolbar", { name: "Template layout" });
  await toolbar.getByRole("button", { name: "Fokus" }).click();
  await expect(toolbar.getByRole("button", { name: "Fokus" })).toHaveAttribute("aria-pressed", "true");
  await expect(admin.getByText(AUTO_NOTE)).toHaveCount(0);
  await expect.poll(() => renderedTemplate(admin)).toBe("focus");

  await tile(admin, SHARER, KIND.screen(1)).getByRole("button", { name: "Geser ke kanan" }).click();
  await expect.poll(() => stageOrder(admin)).toEqual([CAMERA, SCREEN]);
  return stageOrder(admin);
}

test("layout: admin ganti template ke fokus & tukar slot, penonton melihat urutan yang sama", async ({ admin, roomId, joinAs }) => {
  await setupStage(admin, roomId, joinAs);
  const viewer = await joinAs("viewer", "Penonton Layout");
  await expect.poll(() => stageOrder(viewer)).toEqual([SCREEN, CAMERA]);
  await expect(viewer.getByText(AUTO_NOTE)).toBeVisible();

  const adminOrder = await focusAndSwap(admin);

  await expect(viewer.getByText(AUTO_NOTE)).toHaveCount(0);
  await expect.poll(() => renderedTemplate(viewer)).toBe("focus");
  await expect.poll(() => stageOrder(viewer)).toEqual(adminOrder);
  await expectVideoFlowing(tile(viewer, SHARER, KIND.camera));
});

test("layout: penonton yang join belakangan menerima layout terkini", async ({ admin, roomId, joinAs }) => {
  await setupStage(admin, roomId, joinAs);
  const adminOrder = await focusAndSwap(admin);

  const late = await joinAs("viewer", "Penonton Telat");
  await expect.poll(() => renderedTemplate(late)).toBe("focus");
  await expect.poll(() => stageOrder(late)).toEqual(adminOrder);
  await expect(late.getByText(AUTO_NOTE)).toHaveCount(0);

  // Reload admin (sumber: GET layout / room metadata) juga konsisten.
  await admin.reload();
  await expect.poll(() => stageOrder(admin)).toEqual(adminOrder);
});
