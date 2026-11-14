import { expect, openRoom, test } from "./fixtures";

const PHONE = { width: 390, height: 844 };

test("mobile 390px: control bar tidak overflow, menu Lainnya membuka panel peserta", async ({ host, roomId, joinAs }) => {
  await openRoom(host, roomId);
  const phone = await joinAs("participant", "Peserta HP", { viewport: PHONE });

  const bar = phone.getByRole("toolbar", { name: "Kontrol room" });
  await expect(bar).toBeVisible();
  await expect(phone.getByTestId("open-more")).toBeVisible();
  // Tombol Peserta desktop disembunyikan, pindah ke menu Lainnya.
  await expect(phone.getByTestId("open-participants")).toBeHidden();

  const boxes = await bar.locator("button:visible").evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { id: el.getAttribute("data-testid") ?? el.getAttribute("aria-label"), left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    }),
  );
  expect(boxes.length).toBeGreaterThan(0);
  for (const b of boxes) {
    expect(b.left, `${b.id} keluar kiri`).toBeGreaterThanOrEqual(0);
    expect(b.right, `${b.id} keluar kanan`).toBeLessThanOrEqual(PHONE.width);
    expect(b.bottom, `${b.id} keluar bawah`).toBeLessThanOrEqual(PHONE.height);
  }
  expect(await phone.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(PHONE.width);

  await phone.getByTestId("open-more").click();
  // Item pertama menu Lainnya = Peserta (ControlBar.tsx).
  await phone.getByRole("menuitem").first().click();
  await expect(phone.getByTestId("participants-panel")).toBeVisible();
  await expect(phone.getByTestId("participant-row")).toHaveCount(2);
});
