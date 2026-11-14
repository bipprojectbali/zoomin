import { describe, expect, test } from "bun:test";
import {
  LAYOUT_MAX_BYTES,
  LAYOUT_MAX_SLOTS,
  LayoutError,
  type LayoutState,
  parseLayout,
  serializeLayout,
  setFocus,
  swapSlots,
} from "./layout";

const ref = (identity: string, trackName = "camera") => ({ identity, trackName });
const base: LayoutState = {
  version: 1,
  template: "grid",
  slots: [{ trackRef: ref("alice") }, { trackRef: ref("bob"), size: "medium" }, { trackRef: ref("carol") }],
  updatedBy: "admin",
  updatedAt: 1_700_000_000_000,
};

describe("parseLayout", () => {
  test("round-trip serialize -> parse", () => {
    expect(parseLayout(serializeLayout(base))).toEqual(base);
  });

  test("membuang field asing", () => {
    const parsed = parseLayout(JSON.stringify({ ...base, evil: 1 }));
    expect(parsed).toEqual(base);
  });

  const invalid: [string, unknown, RegExp][] = [
    ["bukan object", [], /harus object/],
    ["template asing", { ...base, template: "pip" }, /template: "pip"/],
    ["version negatif", { ...base, version: -1 }, /version/],
    ["version pecahan", { ...base, version: 1.5 }, /version/],
    ["slots bukan array", { ...base, slots: {} }, /slots: harus array/],
    ["identity kosong", { ...base, slots: [{ trackRef: ref("") }] }, /slots\[0\]\.trackRef\.identity/],
    ["trackRef hilang", { ...base, slots: [{}] }, /slots\[0\]\.trackRef/],
    ["size asing", { ...base, slots: [{ trackRef: ref("a"), size: "huge" }] }, /slots\[0\]\.size/],
    ["duplikat", { ...base, slots: [{ trackRef: ref("a") }, { trackRef: ref("a") }] }, /duplikat/],
    ["updatedBy hilang", { ...base, updatedBy: undefined }, /updatedBy/],
    ["updatedAt string", { ...base, updatedAt: "now" }, /updatedAt/],
    [
      "slot terlalu banyak",
      { ...base, slots: Array.from({ length: LAYOUT_MAX_SLOTS + 1 }, (_, i) => ({ trackRef: ref(`p${i}`) })) },
      /maks/,
    ],
  ];
  for (const [name, value, msg] of invalid) {
    test(`tolak: ${name}`, () => {
      expect(() => parseLayout(JSON.stringify(value))).toThrow(msg);
    });
  }

  test("tolak JSON rusak dengan LayoutError", () => {
    expect(() => parseLayout("{oops")).toThrow(LayoutError);
    expect(() => parseLayout("{oops")).toThrow(/bukan JSON valid/);
  });

  test("tolak input melebihi batas ukuran", () => {
    expect(() => parseLayout(" ".repeat(LAYOUT_MAX_BYTES + 1))).toThrow(/melebihi/);
  });
});

describe("serializeLayout", () => {
  test("tolak state yang melebihi batas byte", () => {
    const big = { ...base, updatedBy: "x".repeat(LAYOUT_MAX_BYTES) };
    expect(() => serializeLayout(big)).toThrow(/melebihi/);
  });

  test("layout grid 49 slot tetap jauh di bawah batas", () => {
    const slots = Array.from({ length: LAYOUT_MAX_SLOTS }, (_, i) => ({
      trackRef: ref(`participant-identity-${i}`, "camera"),
      size: "small" as const,
    }));
    const bytes = new TextEncoder().encode(serializeLayout({ ...base, slots })).byteLength;
    expect(bytes).toBeLessThan(LAYOUT_MAX_BYTES / 2);
  });
});

describe("swapSlots", () => {
  test("tukar trackRef, size tetap di posisi slot, versi naik, immutable", () => {
    const next = swapSlots(base, 0, 1, "admin2");
    expect(next.slots.map((s) => s.trackRef.identity)).toEqual(["bob", "alice", "carol"]);
    expect(next.slots[1]!.size).toBe("medium");
    expect(next.version).toBe(2);
    expect(next.updatedBy).toBe("admin2");
    expect(base.slots[0]!.trackRef.identity).toBe("alice");
  });

  test("index di luar range ditolak", () => {
    expect(() => swapSlots(base, 0, 3, "a")).toThrow(/di luar 0..2/);
    expect(() => swapSlots(base, -1, 0, "a")).toThrow(LayoutError);
  });
});

describe("setFocus", () => {
  test("track fokus ke slot 0 large, sisanya small, template focus", () => {
    const next = setFocus(base, ref("carol"), "admin");
    expect(next.template).toBe("focus");
    expect(next.slots).toEqual([
      { trackRef: ref("carol"), size: "large" },
      { trackRef: ref("alice"), size: "small" },
      { trackRef: ref("bob"), size: "small" },
    ]);
    expect(next.version).toBe(2);
  });

  test("track tak dikenal ditolak", () => {
    expect(() => setFocus(base, ref("mallory"), "admin")).toThrow(/mallory\/camera tidak ada/);
  });
});
