import { describe, expect, test } from "bun:test";
import { loadManual, MANUAL_MAX, manualKey, saveManual, withAdded } from "./invite.manual.store";

const memory = () => {
  const data = new Map<string, string>();
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
};
const throwing = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("quota");
  },
};

describe("withAdded", () => {
  test("normalisasi, buang tidak valid, terbaru di atas, dedupe", () => {
    expect(withAdded(["a@x.com"], [" B@X.com ", "nope", "A@x.com", "c@x.com"])).toEqual(["c@x.com", "a@x.com", "b@x.com"]);
  });
  test(`maks ${MANUAL_MAX}, yang lama terpotong`, () => {
    const many = Array.from({ length: 60 }, (_, i) => `u${i}@x.com`);
    const out = withAdded([], many);
    expect(out).toHaveLength(MANUAL_MAX);
    expect(out[0]).toBe("u59@x.com");
    expect(out.at(-1)).toBe("u10@x.com");
  });
});

describe("loadManual / saveManual", () => {
  test("round-trip per user", () => {
    const s = memory();
    saveManual("u1", ["a@x.com", "b@x.com"], s);
    expect(s.data.has(manualKey("u1"))).toBe(true);
    expect(loadManual("u1", s)).toEqual(["a@x.com", "b@x.com"]);
    expect(loadManual("u2", s)).toEqual([]);
  });
  test("data rusak / bentuk salah → daftar kosong atau disaring", () => {
    const s = memory();
    s.setItem(manualKey("u1"), "{bukan json");
    expect(loadManual("u1", s)).toEqual([]);
    s.setItem(manualKey("u1"), JSON.stringify({ a: 1 }));
    expect(loadManual("u1", s)).toEqual([]);
    s.setItem(manualKey("u1"), JSON.stringify(["A@x.com", 3, "nope", "a@x.com", "b@x.com"]));
    expect(loadManual("u1", s)).toEqual(["a@x.com", "b@x.com"]);
  });
  test("storage melempar / tidak ada → tidak pernah melempar", () => {
    expect(loadManual("u1", throwing)).toEqual([]);
    expect(() => saveManual("u1", ["a@x.com"], throwing)).not.toThrow();
    expect(loadManual("u1", null)).toEqual([]);
  });
});
