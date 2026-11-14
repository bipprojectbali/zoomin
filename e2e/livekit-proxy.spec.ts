/**
 * Proxy signaling same-origin (`/livekit`, src/server/livekit.proxy.ts): seperti PUBLIC_LIVEKIT_URL=wss://<app>/livekit
 * di balik Cloudflare Tunnel. Respons token di-intercept agar `url` menunjuk proxy; server e2e lain tetap langsung.
 */
import type { Page } from "@playwright/test";
import type { TokenResponse } from "../src/shared/api.types";
import { ADMIN_ID, createInvite, expect, expectConnected, expectVideoFlowing, identityOf, openRoom, passPreJoin, test, tile } from "./fixtures";

/** Arahkan LiveKit page ke proxy app; kembalikan daftar URL WebSocket yang dibuka page. */
async function viaProxy(page: Page, baseURL: string): Promise<string[]> {
  const proxyUrl = `${baseURL.replace(/^http/, "ws")}/livekit`;
  const sockets: string[] = [];
  page.on("websocket", (ws) => sockets.push(ws.url()));
  await page.route("**/api/rooms/*/token", async (route) => {
    const res = await route.fetch();
    const body = (await res.json()) as TokenResponse;
    await route.fulfill({ response: res, json: { ...body, url: proxyUrl } });
  });
  return sockets;
}

const signalingViaProxy = (sockets: string[], baseURL: string) =>
  sockets.some((u) => u.startsWith(`${baseURL.replace(/^http/, "ws")}/livekit/rtc`));

test("proxy /livekit: admin & peserta join lewat proxy dan saling melihat video", async ({ admin, roomId, newGuestPage, baseURL }) => {
  const base = baseURL!;
  const adminSockets = await viaProxy(admin, base);
  await openRoom(admin, roomId, { camera: true });

  const guest = await newGuestPage();
  const guestSockets = await viaProxy(guest, base);
  await guest.goto(await createInvite(admin.request, roomId, "participant"));
  await passPreJoin(guest, { camera: true }, "Tamu Proxy");
  await expectConnected(guest);

  expect(signalingViaProxy(adminSockets, base)).toBe(true);
  expect(signalingViaProxy(guestSockets, base)).toBe(true);
  // Tak ada signaling yang langsung ke LiveKit (port 7880).
  expect([...adminSockets, ...guestSockets].filter((u) => u.includes(":7880"))).toEqual([]);

  await expectVideoFlowing(tile(admin, await identityOf(guest), "camera"));
  await expectVideoFlowing(tile(guest, ADMIN_ID, "camera"));
});
