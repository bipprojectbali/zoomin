import { describe, expect, test } from "bun:test";
import { SAFE_ID_HTML_PATTERN, SAFE_ID_PATTERN } from "./api.types";
import { slugifyRoomId } from "./room.id";

const SAFE = new RegExp(SAFE_ID_PATTERN);

describe("slugifyRoomId", () => {
  test("judul → slug huruf kecil + sufiks 4 char base36", () => {
    expect(slugifyRoomId("Rapat Mingguan  Desain!")).toMatch(/^rapat-mingguan-desain-[a-z0-9]{4}$/);
    expect(slugifyRoomId("Café Ünïcode")).toMatch(/^cafe-unicode-[a-z0-9]{4}$/);
  });

  test("selalu cocok SAFE_ID_PATTERN, termasuk judul panjang / tanpa karakter valid", () => {
    for (const title of ["x".repeat(200), "!!! ???", "", "  -a-  ", "日本語", "a".repeat(47) + " b"]) {
      const id = slugifyRoomId(title);
      expect(id).toMatch(SAFE);
      expect(id).not.toMatch(/^-|--|-$/);
    }
    expect(slugifyRoomId("x".repeat(200))).toHaveLength(48 + 1 + 4);
  });

  test("dua judul sama → id berbeda (sufiks acak)", () => {
    const ids = new Set(Array.from({ length: 20 }, () => slugifyRoomId("Sama")));
    expect(ids.size).toBeGreaterThan(1);
  });
});

describe("SAFE_ID_HTML_PATTERN (BUG-01)", () => {
  // Browser meng-compile atribut `pattern` sebagai ^(?:pattern)$ dengan flag v.
  const html = new RegExp(`^(?:${SAFE_ID_HTML_PATTERN})$`, "v");

  test("valid di flag v, sedangkan pola server tidak", () => {
    expect(() => new RegExp(`^(?:${SAFE_ID_PATTERN})$`, "v")).toThrow();
  });

  test("menerima/menolak sama dengan SAFE_ID_PATTERN", () => {
    for (const id of ["rapat-desain", "a_b-C9", "x".repeat(64), "a b", "../etc", "", "x".repeat(65), "é"]) {
      expect(html.test(id)).toBe(SAFE.test(id));
    }
  });
});
