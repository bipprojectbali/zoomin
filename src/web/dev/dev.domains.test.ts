import { describe, expect, it } from "bun:test";
import { addDomains, ALLOWED_EMAIL_DOMAINS_MAX, isValidDomain, normalizeDomain, sameDomains } from "./dev.domains";

describe("validasi domain (sama dengan server)", () => {
  it("normalisasi trim + huruf kecil", () => {
    expect(normalizeDomain("  Acme.COM ")).toBe("acme.com");
    expect(normalizeDomain("@acme.com")).toBe("acme.com");
  });
  it("format valid/tidak valid", () => {
    for (const d of ["acme.com", "perusahaan.co.id", "a-b.example.org", "x1.io"]) expect(isValidDomain(d)).toBe(true);
    for (const d of ["acme", "-acme.com", "acme-.com", "acme.c", "acme..com", "ac me.com", "acme.123", "user@acme.com", ""]) {
      expect(isValidDomain(d)).toBe(false);
    }
  });
});

describe("addDomains", () => {
  it("menambah dengan normalisasi, bisa beberapa sekaligus", () => {
    expect(addDomains([], " Acme.com ")).toEqual({ domains: ["acme.com"], error: null });
    expect(addDomains(["a.com"], "b.com, c.com d.com")).toEqual({ domains: ["a.com", "b.com", "c.com", "d.com"], error: null });
  });
  it("tolak duplikat (setelah normalisasi)", () => {
    const r = addDomains(["acme.com"], "ACME.com");
    expect(r.domains).toEqual(["acme.com"]);
    expect(r.error).toContain("sudah ada");
  });
  it("tolak format salah, domain valid sebelumnya tetap masuk", () => {
    const r = addDomains([], "ok.com bad");
    expect(r.domains).toEqual(["ok.com"]);
    expect(r.error).toContain("bukan domain yang valid");
  });
  it(`maksimal ${ALLOWED_EMAIL_DOMAINS_MAX}`, () => {
    const full = Array.from({ length: ALLOWED_EMAIL_DOMAINS_MAX }, (_, i) => `d${i}.com`);
    const r = addDomains(full, "extra.com");
    expect(r.domains).toHaveLength(ALLOWED_EMAIL_DOMAINS_MAX);
    expect(r.error).toContain(String(ALLOWED_EMAIL_DOMAINS_MAX));
  });
  it("isian kosong tidak mengubah apa pun", () => {
    expect(addDomains(["a.com"], "  ")).toEqual({ domains: ["a.com"], error: null });
  });
});

describe("sameDomains", () => {
  it("membandingkan isi dan urutan", () => {
    expect(sameDomains(["a.com"], ["a.com"])).toBe(true);
    expect(sameDomains(["a.com", "b.com"], ["b.com", "a.com"])).toBe(false);
    expect(sameDomains([], ["a.com"])).toBe(false);
  });
});
