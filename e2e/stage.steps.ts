/** Langkah e2e bersama stage control (RND/plan/11-stage-control.md): mode, share layar, isi custom-grid. */
import type { APIRequestContext, Page } from "@playwright/test";
import type { StageMode } from "../src/shared/api.types";
import { expect, toast } from "./fixtures";

/** Label mode (= STAGE_CONTROL_TEXT.mode). */
export const MODE_LABEL: Record<StageMode, string> = { host: "Host only", request: "Request", open: "Open" };

export const modeBadge = (page: Page) => page.getByTestId("stage-mode-badge");

/** Pengelola ganti mode lewat menu "Stage control" di header room. */
export async function chooseStageMode(host: Page, mode: StageMode): Promise<void> {
  await host.getByTestId("stage-mode-menu").click();
  await host.getByTestId(`stage-mode-${mode}`).click();
  await expect(toast(host, `Stage control: ${MODE_LABEL[mode]}`)).toBeVisible();
  await expect(modeBadge(host)).toHaveAttribute("data-mode", mode);
}

/** PUT stage-mode langsung (setup cepat; alur menu diuji di stage-control.spec.ts). */
export async function apiStageMode(request: APIRequestContext, roomId: string, mode: StageMode): Promise<void> {
  const res = await request.put(`/api/rooms/${roomId}/stage-mode`, { data: { mode } });
  expect(res.ok(), await res.text()).toBe(true);
}

/** Tambah layar (fake display media Chromium) sampai total `n` aktif; `active` = jumlah yang sudah dibagikan. */
export async function shareScreens(page: Page, n: number, active = 0): Promise<void> {
  const add = page.getByTestId("add-screen");
  for (let i = active + 1; i <= n; i++) {
    await add.click();
    await expect(add).toHaveAccessibleName(`Share screen (${i} active)`);
  }
}

/** Pilih template di toolbar layout (lokal atau bersama, tergantung izin). */
export async function pickTemplate(page: Page, name: string): Promise<void> {
  const button = page.getByTestId("layout-toolbar").getByRole("button", { name, exact: true });
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
}

/** Isi sel custom-grid row-major: `identity/trackName` atau "empty". */
export function gridCells(page: Page): Promise<string[]> {
  return page.getByTestId("custom-grid").evaluate((grid) =>
    [...grid.children].map((cell) => {
      const t = cell.querySelector('[data-testid="stage-tile"]');
      return t ? `${t.getAttribute("data-identity")}/${t.getAttribute("data-track-name")}` : "empty";
    }),
  );
}
