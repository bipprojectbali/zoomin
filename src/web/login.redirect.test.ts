import { describe, expect, test } from "bun:test";
import { loginPath, safeNextPath } from "./login.redirect";

describe("safeNextPath (cegah open redirect)", () => {
  test("path internal dipertahankan, termasuk query & hash", () => {
    expect(safeNextPath("/rooms/abc")).toBe("/rooms/abc");
    expect(safeNextPath("/invite/x?y=1#z")).toBe("/invite/x?y=1#z");
  });
  test.each([
    null,
    "",
    "https://evil.test",
    "//evil.test/x",
    "/\\evil.test",
    "/\t/evil.test",
    "javascript:alert(1)",
    "rooms/abc",
    "/login",
    "/login?next=/x",
  ])("tak aman / loop → /app: %p", (v) => expect(safeNextPath(v)).toBe("/app"));
});

describe("loginPath", () => {
  test("membawa next", () => expect(loginPath("/rooms/a b")).toBe("/login?next=%2Frooms%2Fa%2520b"));
  test("default tanpa next", () => {
    expect(loginPath("/app")).toBe("/login");
    expect(loginPath("//evil.test")).toBe("/login");
  });
});
