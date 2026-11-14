import { describe, expect, test } from "bun:test";
import { isEmail, parseEmails, validInvites } from "./invite.parse";

describe("parseEmails", () => {
  test("pisah koma, titik koma, spasi, baris baru; trim + huruf kecil", () => {
    expect(parseEmails(" A@x.com, b@x.com;c@x.com\nd@x.com\te@x.com ")).toEqual(
      ["a@x.com", "b@x.com", "c@x.com", "d@x.com", "e@x.com"].map((email) => ({ email, invalid: false })),
    );
  });
  test("duplikat case-insensitive diabaikan, urutan pertama dipertahankan", () => {
    expect(parseEmails("a@x.com A@X.COM a@x.com").map((p) => p.email)).toEqual(["a@x.com"]);
  });
  test("exclude (chip yang ada / diri sendiri) dilewati", () => {
    expect(parseEmails("me@x.com, b@x.com", ["ME@x.com"]).map((p) => p.email)).toEqual(["b@x.com"]);
  });
  test("token tak valid ditandai invalid", () => {
    expect(parseEmails("bukan-email, x@y, ok@y.id")).toEqual([
      { email: "bukan-email", invalid: true },
      { email: "x@y", invalid: true },
      { email: "ok@y.id", invalid: false },
    ]);
  });
  test("kosong → []", () => expect(parseEmails(" ,; \n")).toEqual([]));
});

describe("isEmail", () => {
  test("valid / tidak valid", () => {
    expect(isEmail("a.b@kantor.co.id")).toBe(true);
    expect(isEmail("a@b")).toBe(false);
    expect(isEmail("a@@b.com")).toBe(false);
  });
});

describe("validInvites", () => {
  test("chip invalid dibuang; hanya email + role yang dikirim", () => {
    expect(
      validInvites([
        { email: "a@x.com", role: "host", name: "A", image: null },
        { email: "nope", role: "participant", invalid: true },
      ]),
    ).toEqual([{ email: "a@x.com", role: "host" }]);
  });
});
