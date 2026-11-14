import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as COPY from "./landing.copy";
import { ALL_HREFS, LANDING_META, LOGIN_HREF, SECTION_IDS } from "./landing.copy";

const DIR = import.meta.dir;
const COMPONENT_FILES = readdirSync(DIR).filter((f) => f.endsWith(".tsx"));

/** Kumpulkan semua string (rekursif) dari objek copy. */
function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

const ALL_TEXT = strings(COPY);

describe("landing copy", () => {
  test("tidak ada string kosong dan semua section terisi", () => {
    expect(ALL_TEXT.length).toBeGreaterThan(50);
    for (const s of ALL_TEXT) expect(s.trim().length).toBeGreaterThan(0);
    expect(COPY.FEATURES.items.length).toBeGreaterThanOrEqual(4);
    expect(COPY.FEATURES.items.length).toBeLessThanOrEqual(6);
    expect(COPY.STEPS.items).toHaveLength(3);
    expect(COPY.USE_CASES.items.length).toBeGreaterThanOrEqual(4);
    expect(COPY.FAQ.items.length).toBeGreaterThanOrEqual(3);
  });

  test("tidak mengklaim fitur yang tidak ada (rekaman, chat, AI)", () => {
    const sources = [ALL_TEXT.join("\n"), ...COMPONENT_FILES.map((f) => readFileSync(join(DIR, f), "utf8"))];
    for (const text of sources) {
      expect(text).not.toMatch(/rekam/i);
      expect(text).not.toMatch(/chat/i);
      // Case-sensitive + word boundary: "pakai"/"sampai" bukan pelanggaran.
      expect(text).not.toMatch(/\bAI\b/);
    }
  });

  test("CTA utama mengarah ke /login dengan label Google", () => {
    expect(LOGIN_HREF).toBe("/login");
    expect(COPY.HERO.ctaLogin).toBe("Masuk dengan Google");
    expect(COPY.HERO.ctaHow).toBe("Lihat cara kerja");
  });

  test("semua href ke /login atau anchor section yang ada", () => {
    const ids = new Set<string>(Object.values(SECTION_IDS));
    for (const href of ALL_HREFS) {
      if (href === LOGIN_HREF) continue;
      expect(href.startsWith("#")).toBe(true);
      expect(ids.has(href.slice(1))).toBe(true);
    }
  });

  test("komponen tidak memakai href literal di luar konstanta copy", () => {
    for (const f of COMPONENT_FILES) {
      const src = readFileSync(join(DIR, f), "utf8");
      expect({ file: f, literal: src.match(/href="[^"]*"/g) }).toEqual({ file: f, literal: null });
    }
  });

  test("komponen tidak memanggil API", () => {
    for (const f of COMPONENT_FILES) {
      const src = readFileSync(join(DIR, f), "utf8");
      expect({ file: f, api: /fetch\(|api\.client|\/api\//.test(src) }).toEqual({ file: f, api: false });
    }
  });

  test("meta SEO terisi dan deskripsi ≤ 160 karakter", () => {
    expect(LANDING_META.title).toContain("zoomin");
    expect(LANDING_META.description.length).toBeGreaterThan(50);
    expect(LANDING_META.description.length).toBeLessThanOrEqual(160);
  });
});
