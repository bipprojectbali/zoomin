import { describe, expect, test } from "bun:test";
import { buildOptions, defaultActive } from "./invite.options";

const user = (email: string) => ({ id: email, name: email.split("@")[0]!, email, image: null }); // test-only

describe("buildOptions", () => {
  test("akun dulu, lalu manual tersimpan; diri sendiri disembunyikan; manual yang akun tampil sekali", () => {
    const out = buildOptions({ text: "", users: [user("Me@x.com"), user("a@x.com")], saved: ["a@x.com", "m@y.com"], selfEmail: "me@x.com" });
    expect(out.map((o) => [o.kind, o.email])).toEqual([["user", "a@x.com"], ["saved", "m@y.com"]]);
  });
  test("ketikan memfilter manual secara lokal; email baru → baris add", () => {
    const out = buildOptions({ text: "New@y.com", users: [], saved: ["m@y.com", "new@y.com.au"] });
    expect(out.map((o) => [o.kind, o.email])).toEqual([["saved", "new@y.com.au"], ["add", "new@y.com"]]);
  });
  test("email yang sudah ada di baris tidak memunculkan add", () => {
    expect(buildOptions({ text: "m@y.com", users: [], saved: ["m@y.com"] }).map((o) => o.kind)).toEqual(["saved"]);
    expect(buildOptions({ text: "me@x.com", users: [], saved: [], selfEmail: "me@x.com" })).toEqual([]);
  });
});

describe("defaultActive", () => {
  const opts = buildOptions({ text: "b@x.com", users: [user("ab@x.com")], saved: [] });
  test("tanpa ketikan → -1; email persis → barisnya; lainnya → 0", () => {
    expect(defaultActive(opts, " ")).toBe(-1);
    expect(defaultActive(opts, "B@x.com")).toBe(1);
    expect(defaultActive(opts, "ab")).toBe(0);
  });
});
