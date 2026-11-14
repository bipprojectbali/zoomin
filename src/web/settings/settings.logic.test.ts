import { describe, expect, test } from "bun:test";
import { describeUserAgent, relativeTime } from "./session.device";
import { isValidName, NAME_MAX } from "./settings.labels";

// test-only: user agent contoh
const UA = {
  chromeMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36",
  safariIphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  edgeWin: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 Edg/140.0",
  firefoxLinux: "Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0",
  chromeAndroid: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36",
};

describe("describeUserAgent", () => {
  test("browser + OS umum", () => {
    expect(describeUserAgent(UA.chromeMac)).toBe("Chrome di macOS");
    expect(describeUserAgent(UA.safariIphone)).toBe("Safari di iOS");
    expect(describeUserAgent(UA.edgeWin)).toBe("Edge di Windows");
    expect(describeUserAgent(UA.firefoxLinux)).toBe("Firefox di Linux");
    expect(describeUserAgent(UA.chromeAndroid)).toBe("Chrome di Android");
  });
  test("kosong / tak dikenal", () => {
    expect(describeUserAgent(null)).toBe("Perangkat tak dikenal");
    expect(describeUserAgent("curl/8.0")).toBe("Perangkat tak dikenal");
  });
});

describe("relativeTime", () => {
  const now = 1_700_000_000_000;
  test("menit & hari", () => {
    expect(relativeTime(now - 5 * 60_000, now)).toBe("5 menit yang lalu");
    expect(relativeTime(now - 3 * 86_400_000, now)).toBe("3 hari yang lalu");
  });
});

describe("isValidName", () => {
  test("1–60 setelah trim", () => {
    expect(isValidName("  ")).toBe(false);
    expect(isValidName("A")).toBe(true);
    expect(isValidName("x".repeat(NAME_MAX))).toBe(true);
    expect(isValidName("x".repeat(NAME_MAX + 1))).toBe(false);
  });
});
