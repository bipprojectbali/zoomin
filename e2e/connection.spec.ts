import { expect, expectConnected, openRoom, test } from "./fixtures";

/** Banner harus muncul dari event `offline` browser, jauh sebelum LiveKit menyatakan Reconnecting (QA-05). */
const BANNER_MAX_MS = 2000;

test("offline: banner 'lost' muncul < 2 dtk, online lagi → banner hilang & terhubung", async ({ host, roomId, allowConsole }) => {
  // Chromium mencatat request yang gagal selama offline (mis. sinyal/fetch LiveKit) sebagai resource gagal.
  allowConsole(/net::ERR_INTERNET_DISCONNECTED/);
  await openRoom(host, roomId);
  const banner = host.getByTestId("connection-banner");
  await expect(banner).toHaveCount(0);

  await host.context().setOffline(true);
  await expect(host.locator('[data-testid="connection-banner"][data-kind="lost"]')).toBeVisible({ timeout: BANNER_MAX_MS });

  await host.context().setOffline(false);
  await expect(banner).toHaveCount(0, { timeout: 30_000 });
  await expectConnected(host);
});
