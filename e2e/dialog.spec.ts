import type { Locator, Page } from "@playwright/test";
import { expect, openRoom, test } from "./fixtures";

/**
 * Buka-tutup-buka cepat: dialog dibuka lagi tepat saat overlay lama sudah unmount (fade-out ±150 ms) tapi konten
 * masih beranimasi keluar (200-300 ms). Diukur: jeda 160-190 ms → macet; <150 ms klik mengenai overlay lama (tidak
 * membuka apa pun, dilewati).
 */
const REOPEN_DELAYS_MS = [155, 160, 165, 170, 175, 180, 185, 190, 195];

/** true bila titik tengah konten dialog benar-benar mengenai konten (bukan tertutup overlay). */
async function contentClickable(page: Page, contentSlot: string): Promise<boolean> {
  return page.evaluate((slot) => {
    const c = document.querySelector(`[data-slot="${slot}"][data-state="open"]`);
    if (!c) throw new Error(`dialog ${slot} tidak terbuka`);
    const b = c.getBoundingClientRect();
    return c.contains(document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2));
  }, contentSlot);
}

async function reopenQuickly(page: Page, trigger: Locator, close: () => Promise<void>, contentSlot: string): Promise<number[]> {
  const stuck: number[] = [];
  for (const delay of REOPEN_DELAYS_MS) {
    await trigger.click();
    await expect(page.locator(`[data-slot="${contentSlot}"][data-state="open"]`)).toBeVisible();
    await close();
    await page.waitForTimeout(delay); // sengaja: mensimulasikan klik ulang cepat user pada jeda tertentu
    await trigger.click({ force: true });
    const reopened = page.locator(`[data-slot="${contentSlot}"][data-state="open"]`);
    // Klik ulang yang mendarat di overlay lama tidak membuka dialog: wajar, jeda ini dilewati.
    if (!(await reopened.waitFor({ timeout: 1000 }).then(() => true, () => false))) continue;
    if (!(await contentClickable(page, contentSlot))) stuck.push(delay);
    await page.keyboard.press("Escape");
    await expect(page.locator(`[data-slot="${contentSlot}"]`)).toHaveCount(0);
  }
  return stuck;
}

test("dialog konfirmasi Keluar dibuka ulang cepat tetap bisa diklik", async ({ host, roomId }) => {
  // Regresi E2E-01: overlay z-40 di bawah konten z-50, durasi animasi overlay = konten (200 ms).
  await openRoom(host, roomId);
  const stuck = await reopenQuickly(
    host,
    host.getByTestId("leave-room"),
    () => host.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click(),
    "alert-dialog-content",
  );
  expect(stuck, "jeda (ms) yang membuat konten tertutup overlay").toEqual([]);
});
