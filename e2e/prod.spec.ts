/**
 * Regresi mode produksi (project "prod": dist hasil build + static.serve.ts). Dev server Bun menyajikan SPA sendiri,
 * jadi bug fallback SPA produksi tidak tertangkap project dev.
 */
import { createInvite, expect, test } from "./fixtures";

test("prod: URL undangan (token bertitik) di context tamu → PreJoin, bukan 404", async ({ admin, roomId, newGuestPage }) => {
  const url = await createInvite(admin.request, roomId, "participant");
  expect(new URL(url).pathname).toMatch(/^\/invite\/.*\./);
  const guest = await newGuestPage();
  const res = await guest.goto(url);
  expect(res?.status()).toBe(200);
  await expect(guest.getByTestId("prejoin")).toBeVisible();
});

test("prod: deep link /rooms/:id + reload → app tampil", async ({ admin, roomId }) => {
  await admin.goto(`/rooms/${roomId}`);
  await expect(admin.getByTestId("prejoin")).toBeVisible();
  const res = await admin.reload();
  expect(res?.status()).toBe(200);
  await expect(admin.getByTestId("prejoin")).toBeVisible();
});
