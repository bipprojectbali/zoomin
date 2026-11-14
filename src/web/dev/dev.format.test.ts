import { describe, expect, it } from "bun:test";
import { formatBytes, formatRelative, formatUptime, summarizeDetail } from "./dev.format";

describe("formatUptime", () => {
  it("menampilkan dua unit terbesar", () => {
    expect(formatUptime(0)).toBe("0 detik");
    expect(formatUptime(42)).toBe("42 detik");
    expect(formatUptime(125)).toBe("2 menit 5 detik");
    expect(formatUptime(3600)).toBe("1 jam");
    expect(formatUptime(3 * 86_400 + 4 * 3600 + 59)).toBe("3 hari 4 jam");
    expect(formatUptime(86_400 + 30)).toBe("1 hari");
  });
  it("nilai negatif/pecahan aman", () => {
    expect(formatUptime(-5)).toBe("0 detik");
    expect(formatUptime(61.9)).toBe("1 menit 1 detik");
  });
});

describe("formatBytes", () => {
  it("basis 1024 dengan koma desimal id-ID", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1,5 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5 MB");
  });
  it("null/tidak valid → —", () => {
    expect(formatBytes(null)).toBe("—");
    expect(formatBytes(-1)).toBe("—");
  });
});

describe("formatRelative", () => {
  const now = 1_800_000_000_000;
  it("relatif ke now dalam bahasa Indonesia", () => {
    expect(formatRelative(now - 5 * 60_000, now)).toBe("5 menit yang lalu");
    expect(formatRelative(now - 2 * 3_600_000, now)).toBe("2 jam yang lalu");
    expect(formatRelative(now - 3 * 86_400_000, now)).toBe("3 hari yang lalu");
  });
});

describe("summarizeDetail", () => {
  it("kosong → —; string apa adanya; lainnya JSON", () => {
    expect(summarizeDetail({})).toBe("—");
    expect(summarizeDetail({ from: "user", to: "admin" })).toBe("from: user, to: admin");
    expect(summarizeDetail({ after: ["a.com"] })).toBe('after: ["a.com"]');
  });
  it("dipotong ke 80 karakter", () => {
    const out = summarizeDetail({ reason: "x".repeat(200) });
    expect(out).toHaveLength(80);
    expect(out.endsWith("…")).toBe(true);
  });
});
