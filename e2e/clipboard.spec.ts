import { createRoom, expect, loginAdmin, test } from "./fixtures";

// Bug: app dibuka lewat http://0.0.0.0 (URL dari log server) → bukan secure context → navigator.clipboard undefined.
test("lobby: salin link undangan tetap berhasil di origin non-secure (http://0.0.0.0)", async ({ browser, baseURL, root, roomId }) => {
  const origin = baseURL!.replace("localhost", "0.0.0.0");
  const context = await browser.newContext({ baseURL: origin });
  try {
    const page = await context.newPage();
    await loginAdmin(page, root);
    await createRoom(page.request, roomId);
    await page.goto("/app");
    expect(await page.evaluate(() => ({ secure: window.isSecureContext, api: !!navigator.clipboard }))).toEqual({ secure: false, api: false });

    // Rekam teks yang benar-benar disalin lewat event copy (clipboard sistem tak bisa dibaca di non-secure context).
    await page.evaluate(() => {
      document.addEventListener("copy", () => {
        const el = document.activeElement as HTMLTextAreaElement;
        (window as unknown as { copied: string }).copied = el.value.slice(el.selectionStart, el.selectionEnd);
      });
    });

    const item = page.locator(`[data-testid="room-item"][data-room-id="${roomId}"]`);
    await item.getByTestId("invite-toggle").click();
    await item.getByTestId("create-invite").click();
    const input = item.locator('[data-testid="invite-url"][data-role="participant"]');
    await expect(input).toHaveValue(/\/invite\/.+/);
    const url = await input.inputValue();

    await item.getByRole("button", { name: "Salin link Peserta" }).click();
    await expect(page.getByText("Link disalin")).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { copied?: string }).copied)).toBe(url);
  } finally {
    await context.close();
  }
});
