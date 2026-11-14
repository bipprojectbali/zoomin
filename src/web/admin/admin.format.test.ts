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
  test("5 pilihan dengan label Indonesia", () => {
    expect(BAN_DURATIONS.map((d) => d.label)).toEqual(["1 jam", "1 hari", "7 hari", "30 hari", "Permanen"]);
  });
});

describe("banReasonError", () => {
  test("terlalu pendek (setelah trim)", () => {
    expect(banReasonError("")).toContain("minimal 3");
    expect(banReasonError("  ab  ")).toContain("minimal 3");
  });
  test("batas valid 3 dan 200", () => {
    expect(banReasonError("abc")).toBeNull();
    expect(banReasonError("x".repeat(200))).toBeNull();
  });
  test("terlalu panjang", () => {
    expect(banReasonError("x".repeat(201))).toContain("maksimal 200");
  });
});

describe("userStatusLabel", () => {
  test("tidak diblokir → Aktif", () => {
    expect(userStatusLabel({ banned: false, banExpires: null }, NOW)).toEqual({ label: "Aktif", detail: null });
  });
  test("blokir permanen", () => {
    expect(userStatusLabel({ banned: true, banExpires: null }, NOW)).toEqual({ label: "Diblokir", detail: "permanen" });
  });
  test("blokir sementara menyebut tanggal id-ID", () => {
    const s = userStatusLabel({ banned: true, banExpires: NOW + 3600_000 }, NOW);
    expect(s.label).toBe("Diblokir");
    expect(s.detail).toStartWith("sampai ");
    expect(s.detail).toContain("2026");
    expect(s.detail).toContain("Nov");
  });
  test("blokir yang sudah kedaluwarsa dianggap aktif", () => {
    expect(isBanActive({ banned: true, banExpires: NOW - 1 }, NOW)).toBe(false);
    expect(userStatusLabel({ banned: true, banExpires: NOW - 1 }, NOW).label).toBe("Aktif");
  });
});

describe("formatRelative", () => {
  test("null → Belum pernah", () => expect(formatRelative(null, NOW)).toBe("Belum pernah"));
  test("3 jam lalu", () => expect(formatRelative(NOW - 3 * 3600_000, NOW)).toBe("3 jam yang lalu"));
});
