import { expect, expectConnected, openRoom, test } from "./fixtures";

/** Banner harus muncul dari event `offline` browser, jauh sebelum LiveKit menyatakan Reconnecting (QA-05). */
const BANNER_MAX_MS = 2000;

test("offline: banner 'lost' muncul < 2 dtk, online lagi → banner hilang & terhubung", async ({ admin, roomId, allowConsole }) => {
  // Chromium mencatat request yang gagal selama offline (mis. sinyal/fetch LiveKit) sebagai resource gagal.
  allowConsole(/net::ERR_INTERNET_DISCONNECTED/);
  await openRoom(admin, roomId);
  const banner = admin.getByTestId("connection-banner");
  await expect(banner).toHaveCount(0);

  await admin.context().setOffline(true);
  await expect(admin.locator('[data-testid="connection-banner"][data-kind="lost"]')).toBeVisible({ timeout: BANNER_MAX_MS });

  await admin.context().setOffline(false);
  await expect(banner).toHaveCount(0, { timeout: 30_000 });
  await expectConnected(admin);
});
