import { describe, expect, test } from "bun:test";
import { hasRole } from "../role.global.label";
import { APP_NAV, initials } from "./app.labels";

const user = (role: "user" | "admin" | "super_admin") => ({ id: "u1", name: "A", email: "a@x.test", image: null, role }); // test-only

describe("initials", () => {
  test("dua kata pertama, huruf besar", () => expect(initials("rina sari dewi")).toBe("RS"));
  test("spasi berlebih", () => expect(initials("  budi  ")).toBe("B"));
  test("kosong → ?", () => expect(initials("   ")).toBe("?"));
});

describe("APP_NAV + hasRole", () => {
  const visible = (role: "user" | "admin" | "super_admin") => APP_NAV.filter((n) => hasRole(user(role), n.min)).map((n) => n.to);
  test("user hanya Room", () => expect(visible("user")).toEqual(["/app"]));
  test("admin + Admin", () => expect(visible("admin")).toEqual(["/app", "/admin"]));
  test("super_admin semua", () => expect(visible("super_admin")).toEqual(["/app", "/admin", "/dev"]));
  test("null tidak punya peran", () => expect(hasRole(null, "user")).toBe(false));
});
