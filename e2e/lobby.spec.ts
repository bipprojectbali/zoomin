import { expect, loginAdmin, test } from "./fixtures";

test("lobby: buat room via form, muncul di daftar, buat link undangan peserta & penonton", async ({ page, roomId }) => {
  await loginAdmin(page.request);
  await page.goto("/");
  await page.getByLabel("ID room").fill(roomId);
  await page.getByLabel("Judul").fill(`Judul ${roomId}`);
  await page.getByRole("button", { name: "Buat", exact: true }).click();

  const item = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: `Judul ${roomId}` }) });
  await expect(item).toBeVisible();
  await expect(item.getByText(roomId, { exact: true })).toBeVisible();
  // Form direset setelah sukses.
  await expect(page.getByLabel("ID room")).toHaveValue("");

  for (const [button, label, path] of [
    ["Link Peserta", "Link undangan Peserta", /\/invite\/.+/],
    ["Link Penonton", "Link undangan Penonton", /\/invite\/.+/],
  ] as const) {
    await item.getByRole("button", { name: button }).click();
    const input = item.getByLabel(label);
    await expect(input).toHaveValue(path);
    await expect(input).toHaveValue(/^http:\/\/localhost:\d+\/invite\//);
  }
  const participantUrl = await item.getByLabel("Link undangan Peserta").inputValue();
  const viewerUrl = await item.getByLabel("Link undangan Penonton").inputValue();
  expect(participantUrl).not.toBe(viewerUrl);

  // Room tetap ada setelah reload (bukan hanya state lokal).
  await page.reload();
  await expect(page.getByRole("heading", { name: `Judul ${roomId}` })).toBeVisible();
});
