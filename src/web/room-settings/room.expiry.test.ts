import { describe, expect, test } from "bun:test";
import {
  DAY_MS,
  extendExpiry,
  fromLocalInput,
  isExpiryInRange,
  isRoomBlocked,
  maxExpiry,
  presetExpiry,
  statusBadgeStatus,
  toLocalInput,
} from "./room.expiry";

const NOW = new Date(2026, 10, 14, 10, 30).getTime(); // test-only

describe("extendExpiry", () => {
  test("tanpa batas → dari sekarang", () => expect(extendExpiry(null, 7, NOW)).toBe(NOW + 7 * DAY_MS));
  test("sudah lewat → dari sekarang", () => expect(extendExpiry(NOW - 3 * DAY_MS, 1, NOW)).toBe(NOW + DAY_MS));
  test("masih berlaku → dari expiresAt", () => expect(extendExpiry(NOW + 2 * DAY_MS, 30, NOW)).toBe(NOW + 32 * DAY_MS));
});

describe("isExpiryInRange", () => {
  test("sekarang ditolak, besok diterima", () => {
    expect(isExpiryInRange(NOW, NOW)).toBe(false);
    expect(isExpiryInRange(NOW + DAY_MS, NOW)).toBe(true);
  });
  test("batas 365 hari inklusif", () => {
    expect(isExpiryInRange(maxExpiry(NOW), NOW)).toBe(true);
    expect(isExpiryInRange(maxExpiry(NOW) + 1, NOW)).toBe(false);
  });
});

describe("presetExpiry", () => {
  test("none → null, N hari → now + N", () => {
    expect(presetExpiry("none", "", NOW)).toBeNull();
    expect(presetExpiry("30", "", NOW)).toBe(NOW + 30 * DAY_MS);
  });
  test("custom valid / kosong / lampau", () => {
    const tomorrow = NOW + DAY_MS;
    expect(presetExpiry("custom", toLocalInput(tomorrow), NOW)).toBe(tomorrow);
    expect(presetExpiry("custom", "", NOW)).toBeUndefined();
    expect(presetExpiry("custom", toLocalInput(NOW - DAY_MS), NOW)).toBeUndefined();
  });
});

describe("datetime-local", () => {
  test("bolak-balik presisi menit", () => {
    expect(toLocalInput(NOW)).toBe("2026-11-14T10:30");
    expect(fromLocalInput("2026-11-14T10:30")).toBe(NOW);
  });
  test("tidak valid → null", () => {
    expect(fromLocalInput("")).toBeNull();
    expect(fromLocalInput("besok")).toBeNull();
  });
});

describe("status", () => {
  test("hanya active yang bisa dimasuki", () => {
    expect(isRoomBlocked({ status: "active" })).toBe(false);
    expect(isRoomBlocked({ status: "inactive" })).toBe(true);
    expect(isRoomBlocked({ status: "expired" })).toBe(true);
  });
  test("badge hanya untuk non-active", () => {
    expect(statusBadgeStatus("active")).toBeNull();
    expect(statusBadgeStatus("expired")).toBe("expired");
  });
});
