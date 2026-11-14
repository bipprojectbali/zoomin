/**
 * Proxy signaling same-origin (`/livekit`, src/server/livekit.proxy.ts): seperti PUBLIC_LIVEKIT_URL=wss://<app>/livekit
 * di balik Cloudflare Tunnel. Respons token di-intercept agar `url` menunjuk proxy; server e2e lain tetap langsung.
 */
import type { Page } from "@playwright/test";
import type { TokenResponse } from "../src/shared/api.types";
import { createInvite, expect, expectConnected, expectVideoFlowing, identityOf, loginAs, newIdentity, openRoom, passPreJoin, test, tile } from "./fixtures";

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

test("proxy /livekit: host & peserta join lewat proxy dan saling melihat video", async ({ host, hostId, roomId, newGuestPage, baseURL }) => {
  const base = baseURL!;
  const hostSockets = await viaProxy(host, base);
  await openRoom(host, roomId, { camera: true });

  const guest = await newGuestPage();
  const guestSockets = await viaProxy(guest, base);
  await loginAs(guest, newIdentity("Tamu Proxy"));
  await guest.goto(await createInvite(host.request, roomId, "participant"));
  await passPreJoin(guest, { camera: true });
  await expectConnected(guest);

  expect(signalingViaProxy(hostSockets, base)).toBe(true);
  expect(signalingViaProxy(guestSockets, base)).toBe(true);
  // Tak ada signaling yang langsung ke LiveKit (port 7880).
  expect([...hostSockets, ...guestSockets].filter((u) => u.includes(":7880"))).toEqual([]);

  await expectVideoFlowing(tile(host, await identityOf(guest), "camera"));
  await expectVideoFlowing(tile(guest, hostId, "camera"));
});
