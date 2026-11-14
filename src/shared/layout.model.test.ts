import { describe, expect, test } from "bun:test";
import {
  LAYOUT_MAX_BYTES,
  LAYOUT_MAX_SLOTS,
  LayoutValidationError,
  type LayoutState,
  panelCountFor,
  parseLayout,
  serializeLayout,
  setFocus,
  setPanelSizes,
  setTemplate,
  swapSlots,
} from "./layout.model";

const ref = (identity: string, trackName = "camera") => ({ identity, trackName });
const base: LayoutState = {
  version: 1,
  template: "grid",
  slots: [{ trackRef: ref("alice") }, { trackRef: ref("bob"), size: "medium" }, { trackRef: ref("carol") }],
  updatedBy: "admin",
  updatedAt: 1_700_000_000_000,
};
const sbs: LayoutState = { ...base, template: "side-by-side", panelSizes: [50, 25, 25] };

/** Tangkap LayoutValidationError dan kembalikan path-nya. */
function pathOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof LayoutValidationError) return e.path;
    throw e;
  }
  throw new Error("tidak melempar");
}

describe("parseLayout", () => {
  test("round-trip serialize -> parse", () => {
    expect(parseLayout(serializeLayout(base))).toEqual(base);
    expect(parseLayout(serializeLayout(sbs))).toEqual(sbs);
  });

  test("membuang field asing", () => {
    expect(parseLayout(JSON.stringify({ ...base, evil: 1 }))).toEqual(base);
  });

  test("tanpa panelSizes tidak menghasilkan key panelSizes", () => {
    expect("panelSizes" in parseLayout(JSON.stringify(base))).toBe(false);
  });

  const invalid: [string, unknown, string, RegExp][] = [
    ["bukan object", [], "$", /harus object/],
    ["template asing", { ...base, template: "pip" }, "template", /"pip"/],
    ["version negatif", { ...base, version: -1 }, "version", /integer/],
    ["version pecahan", { ...base, version: 1.5 }, "version", /integer/],
    ["slots bukan array", { ...base, slots: {} }, "slots", /harus array/],
    ["identity kosong", { ...base, slots: [{ trackRef: ref("") }] }, "slots[0].trackRef.identity", /non-kosong/],
    ["trackName kosong", { ...base, slots: [{ trackRef: ref("a"), }, { trackRef: ref("b", "") }] }, "slots[1].trackRef.trackName", /non-kosong/],
    ["slot bukan object", { ...base, slots: [null] }, "slots[0]", /harus object/],
    ["trackRef hilang", { ...base, slots: [{}] }, "slots[0].trackRef", /harus object/],
    ["size asing", { ...base, slots: [{ trackRef: ref("a"), size: "huge" }] }, "slots[0].size", /huge/],
    ["duplikat", { ...base, slots: [{ trackRef: ref("a") }, { trackRef: ref("a") }] }, "slots[1].trackRef", /duplikat/],
    ["updatedBy hilang", { ...base, updatedBy: undefined }, "updatedBy", /non-kosong/],
    ["updatedAt string", { ...base, updatedAt: "now" }, "updatedAt", /epoch/],
    [
      "slot terlalu banyak",
      { ...base, slots: Array.from({ length: LAYOUT_MAX_SLOTS + 1 }, (_, i) => ({ trackRef: ref(`p${i}`) })) },
      "slots",
      /maks/,
    ],
  ];
  for (const [name, value, path, msg] of invalid) {
    test(`tolak: ${name} (path ${path})`, () => {
      const json = JSON.stringify(value);
      expect(() => parseLayout(json)).toThrow(msg);
      expect(pathOf(() => parseLayout(json))).toBe(path);
    });
  }

  test("tolak JSON rusak dengan LayoutValidationError", () => {
    expect(() => parseLayout("{oops")).toThrow(LayoutValidationError);
    expect(() => parseLayout("{oops")).toThrow(/bukan JSON valid/);
    expect(pathOf(() => parseLayout("{oops"))).toBe("$");
  });

  test("tolak input melebihi batas ukuran", () => {
    expect(() => parseLayout(" ".repeat(LAYOUT_MAX_BYTES + 1))).toThrow(/melebihi/);
  });

  test("message error menyertakan path", () => {
    expect(() => parseLayout(JSON.stringify({ ...base, version: -1 }))).toThrow(/^version: /);
  });
});

describe("parseLayout panelSizes", () => {
  const parse = (v: object) => parseLayout(JSON.stringify(v));

  test("side-by-side: satu ukuran per slot, total 100", () => {
    expect(parse(sbs).panelSizes).toEqual([50, 25, 25]);
  });

  test("toleransi total ±0.5 (pembulatan)", () => {
    expect(parse({ ...sbs, panelSizes: [33.3, 33.3, 33.3] }).panelSizes).toEqual([33.3, 33.3, 33.3]);
    expect(parse({ ...sbs, panelSizes: [33.5, 33.5, 33.5] }).panelSizes).toHaveLength(3);
  });

  test("focus: tepat 2 panel (stage + strip)", () => {
    expect(parse({ ...base, template: "focus", panelSizes: [80, 20] }).panelSizes).toEqual([80, 20]);
  });

  const invalid: [string, unknown, string, RegExp][] = [
    ["bukan array", { ...sbs, panelSizes: 100 }, "panelSizes", /harus array/],
    ["jumlah kurang", { ...sbs, panelSizes: [50, 50] }, "panelSizes", /butuh 3/],
    ["jumlah lebih", { ...sbs, panelSizes: [25, 25, 25, 25] }, "panelSizes", /butuh 3/],
    ["focus 3 panel", { ...base, template: "focus", panelSizes: [50, 25, 25] }, "panelSizes", /butuh 2/],
    ["grid tidak memakai", { ...base, panelSizes: [50, 50] }, "panelSizes", /tidak memakai/],
    ["total kurang", { ...sbs, panelSizes: [40, 25, 25] }, "panelSizes", /total 90/],
    ["total lebih di luar toleransi", { ...sbs, panelSizes: [50.6, 25, 25] }, "panelSizes", /harus 100/],
    ["nol", { ...sbs, panelSizes: [50, 50, 0] }, "panelSizes[2]", /> 0/],
    ["negatif", { ...sbs, panelSizes: [125, -50, 25] }, "panelSizes[1]", /> 0/],
    ["string", { ...sbs, panelSizes: [50, "25", 25] }, "panelSizes[1]", /finite/],
    ["null (NaN/Infinity jadi null di JSON)", { ...sbs, panelSizes: [50, null, 25] }, "panelSizes[1]", /finite/],
  ];
  for (const [name, value, path, msg] of invalid) {
    test(`tolak: ${name} (path ${path})`, () => {
      expect(() => parse(value as object)).toThrow(msg);
      expect(pathOf(() => parse(value as object))).toBe(path);
    });
  }
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

describe("panelCountFor", () => {
  test("per template", () => {
    expect(panelCountFor("side-by-side", 3)).toBe(3);
    expect(panelCountFor("focus", 7)).toBe(2);
    expect(panelCountFor("grid", 9)).toBe(0);
  });
});

describe("swapSlots", () => {
  test("tukar trackRef, size tetap di posisi slot, version tetap, immutable", () => {
    const next = swapSlots(base, 0, 1, "admin2");
    expect(next.slots.map((s) => s.trackRef.identity)).toEqual(["bob", "alice", "carol"]);
    expect(next.slots[1]!.size).toBe("medium");
    expect(next.version).toBe(1);
    expect(next.updatedBy).toBe("admin2");
    expect(next.updatedAt).toBeGreaterThan(base.updatedAt);
    expect(base.slots[0]!.trackRef.identity).toBe("alice");
  });

  test("panelSizes dipertahankan (jumlah slot tidak berubah)", () => {
    expect(swapSlots(sbs, 0, 2, "a").panelSizes).toEqual([50, 25, 25]);
  });

  test("index di luar range ditolak", () => {
    expect(() => swapSlots(base, 0, 3, "a")).toThrow(/di luar 0..2/);
    expect(() => swapSlots(base, -1, 0, "a")).toThrow(LayoutValidationError);
    expect(() => swapSlots(base, 0.5, 0, "a")).toThrow(LayoutValidationError);
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
    expect(next.version).toBe(1);
  });

  test("dari side-by-side: panelSizes dibuang; dari focus: dipertahankan", () => {
    expect("panelSizes" in setFocus(sbs, ref("bob"), "a")).toBe(false);
    const focused = { ...base, template: "focus" as const, panelSizes: [70, 30] };
    expect(setFocus(focused, ref("bob"), "a").panelSizes).toEqual([70, 30]);
  });

  test("hasil lolos parseLayout", () => {
    const next = setFocus(base, ref("bob"), "admin");
    expect(parseLayout(serializeLayout(next))).toEqual(next);
  });

  test("track tak dikenal ditolak", () => {
    expect(() => setFocus(base, ref("mallory"), "admin")).toThrow(/mallory\/camera tidak ada/);
  });
});

describe("setTemplate", () => {
  test("ganti template, panelSizes dibuang, version tetap, immutable", () => {
    const next = setTemplate(sbs, "grid", "admin2");
    expect(next.template).toBe("grid");
    expect("panelSizes" in next).toBe(false);
    expect(next.version).toBe(1);
    expect(next.updatedBy).toBe("admin2");
    expect(sbs.panelSizes).toEqual([50, 25, 25]);
    expect(parseLayout(serializeLayout(next))).toEqual(next);
  });

  test("template asing ditolak", () => {
    expect(() => setTemplate(base, "pip" as never, "a")).toThrow(LayoutValidationError);
  });
});

describe("setPanelSizes", () => {
  test("set ukuran valid, immutable", () => {
    const sizes = [20, 30, 50];
    const next = setPanelSizes(sbs, sizes, "admin2");
    expect(next.panelSizes).toEqual([20, 30, 50]);
    expect(next.version).toBe(1);
    expect(next.updatedBy).toBe("admin2");
    sizes[0] = 99;
    expect(next.panelSizes![0]).toBe(20);
    expect(sbs.panelSizes).toEqual([50, 25, 25]);
  });

  test("ukuran invalid ditolak dengan path", () => {
    expect(pathOf(() => setPanelSizes(sbs, [50, 50], "a"))).toBe("panelSizes");
    expect(pathOf(() => setPanelSizes(sbs, [50, Number.NaN, 50], "a"))).toBe("panelSizes[1]");
    expect(pathOf(() => setPanelSizes(sbs, [50, Number.POSITIVE_INFINITY, 50], "a"))).toBe("panelSizes[1]");
    expect(pathOf(() => setPanelSizes(base, [50, 50], "a"))).toBe("panelSizes");
  });
});
