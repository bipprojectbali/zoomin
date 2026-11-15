import { describe, expect, test } from "bun:test";
import { parseViewPrefs } from "./view.prefs";

describe("parseViewPrefs (S11)", () => {
  test("kosong → default; mobile → strip bawah", () => {
    expect(parseViewPrefs(null, false)).toEqual({ view: "auto", strip: "right" });
    expect(parseViewPrefs(null, true)).toEqual({ view: "auto", strip: "bottom" });
  });
  test("nilai tersimpan menang atas default mobile", () => {
    expect(parseViewPrefs(JSON.stringify({ view: "speaker", strip: "right" }), true)).toEqual({ view: "speaker", strip: "right" });
  });
  test("rusak / tak dikenal → default per field", () => {
    expect(parseViewPrefs("{bukan json", false)).toEqual({ view: "auto", strip: "right" });
    expect(parseViewPrefs(JSON.stringify({ view: "x", strip: "hidden" }), false)).toEqual({ view: "auto", strip: "hidden" });
    expect(parseViewPrefs("null", false)).toEqual({ view: "auto", strip: "right" });
  });
});
