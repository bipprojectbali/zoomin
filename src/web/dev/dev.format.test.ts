import { describe, expect, it } from "bun:test";
import { formatBytes, formatRelative, formatUptime, secretState, summarizeDetail } from "./dev.format";

describe("formatUptime", () => {
  it("menampilkan dua unit terbesar", () => {
    expect(formatUptime(0)).toBe("0 seconds");
    expect(formatUptime(42)).toBe("42 seconds");
    expect(formatUptime(125)).toBe("2 minutes 5 seconds");
    expect(formatUptime(3600)).toBe("1 hour");
    expect(formatUptime(3 * 86_400 + 4 * 3600 + 59)).toBe("3 days 4 hours");
    expect(formatUptime(86_400 + 30)).toBe("1 day");
  });
  it("nilai negatif/pecahan aman", () => {
    expect(formatUptime(-5)).toBe("0 seconds");
    expect(formatUptime(61.9)).toBe("1 minute 1 second");
  });
});

describe("formatBytes", () => {
  it("base 1024 with en-US decimal point", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5 MB");
  });
  it("null/tidak valid → —", () => {
    expect(formatBytes(null)).toBe("—");
    expect(formatBytes(-1)).toBe("—");
  });
});

describe("formatRelative", () => {
  const now = 1_800_000_000_000;
  it("relative to now in English", () => {
    expect(formatRelative(now - 5 * 60_000, now)).toBe("5 minutes ago");
    expect(formatRelative(now - 2 * 3_600_000, now)).toBe("2 hours ago");
    expect(formatRelative(now - 3 * 86_400_000, now)).toBe("3 days ago");
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

describe("secretState", () => {
  it("recognizes masked secrets only", () => {
    expect(secretState("set")).toBe("set");
    expect(secretState("empty")).toBe("empty");
    expect(secretState("diset")).toBeNull();
    expect(secretState("ws://127.0.0.1:7880")).toBeNull();
    expect(secretState("")).toBeNull();
  });
});
