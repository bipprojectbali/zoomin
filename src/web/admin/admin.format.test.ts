import { describe, expect, test } from "bun:test";
import {
  BAN_DURATIONS,
  banExpiresInHours,
  banReasonError,
  formatRelative,
  isBanActive,
  userStatusLabel,
} from "./admin.format";

const NOW = Date.UTC(2026, 10, 14, 3, 0); // test-only

describe("banExpiresInHours", () => {
  test("durasi → jam", () => {
    expect(banExpiresInHours("1h")).toBe(1);
    expect(banExpiresInHours("1d")).toBe(24);
    expect(banExpiresInHours("7d")).toBe(168);
    expect(banExpiresInHours("30d")).toBe(720);
  });
  test("permanen → undefined (tanpa expiresInHours)", () => {
    expect(banExpiresInHours("permanent")).toBeUndefined();
  });
  test("5 options with English labels", () => {
    expect(BAN_DURATIONS.map((d) => d.label)).toEqual(["1 hour", "1 day", "7 days", "30 days", "Permanent"]);
  });
});

describe("banReasonError", () => {
  test("terlalu pendek (setelah trim)", () => {
    expect(banReasonError("")).toContain("at least 3");
    expect(banReasonError("  ab  ")).toContain("at least 3");
  });
  test("batas valid 3 dan 200", () => {
    expect(banReasonError("abc")).toBeNull();
    expect(banReasonError("x".repeat(200))).toBeNull();
  });
  test("terlalu panjang", () => {
    expect(banReasonError("x".repeat(201))).toContain("at most 200");
  });
});

describe("userStatusLabel", () => {
  test("not banned → Active", () => {
    expect(userStatusLabel({ banned: false, banExpires: null }, NOW)).toEqual({ label: "Active", detail: null });
  });
  test("blokir permanen", () => {
    expect(userStatusLabel({ banned: true, banExpires: null }, NOW)).toEqual({ label: "Banned", detail: "permanent" });
  });
  test("temporary ban shows an en-US date", () => {
    const s = userStatusLabel({ banned: true, banExpires: NOW + 3600_000 }, NOW);
    expect(s.label).toBe("Banned");
    expect(s.detail).toStartWith("until ");
    expect(s.detail).toContain("2026");
    expect(s.detail).toContain("Nov");
  });
  test("blokir yang sudah kedaluwarsa dianggap aktif", () => {
    expect(isBanActive({ banned: true, banExpires: NOW - 1 }, NOW)).toBe(false);
    expect(userStatusLabel({ banned: true, banExpires: NOW - 1 }, NOW).label).toBe("Active");
  });
});

describe("formatRelative", () => {
  test("null → Never", () => expect(formatRelative(null, NOW)).toBe("Never"));
  test("3 hours ago", () => expect(formatRelative(NOW - 3 * 3600_000, NOW)).toBe("3 hours ago"));
});
