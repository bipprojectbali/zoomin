import { describe, expect, test } from "bun:test";
import type { GlobalRole } from "../../shared/api.types";
import { canManage, canManageUser } from "./admin.permissions";

const ROLES: GlobalRole[] = ["user", "admin", "super_admin"];
// Matriks lengkap A5: baris = aktor, kolom = target.
const EXPECTED: Record<GlobalRole, Record<GlobalRole, boolean>> = {
  user: { user: false, admin: false, super_admin: false },
  admin: { user: true, admin: false, super_admin: false },
  super_admin: { user: true, admin: true, super_admin: false },
};

describe("canManage", () => {
  for (const actor of ROLES)
    for (const target of ROLES)
      test(`${actor} → ${target} = ${EXPECTED[actor][target]}`, () => {
        expect(canManage(actor, target)).toBe(EXPECTED[actor][target]);
      });
});

describe("canManageUser", () => {
  test("tidak pernah diri sendiri", () => {
    for (const role of ROLES) expect(canManageUser({ id: "a", role }, { id: "a", role: "user" })).toBe(false);
  });
  test("user lain mengikuti matriks", () => {
    expect(canManageUser({ id: "a", role: "admin" }, { id: "b", role: "user" })).toBe(true);
    expect(canManageUser({ id: "a", role: "admin" }, { id: "b", role: "admin" })).toBe(false);
    expect(canManageUser({ id: "a", role: "super_admin" }, { id: "b", role: "admin" })).toBe(true);
    expect(canManageUser({ id: "a", role: "super_admin" }, { id: "b", role: "super_admin" })).toBe(false);
  });
});
