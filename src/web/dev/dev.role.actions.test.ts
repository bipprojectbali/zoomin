import { describe, expect, it } from "bun:test";
import type { GlobalRole } from "../../shared/api.types";
import { roleActionFor } from "./dev.role.actions";

const SELF = "u-self"; // test-only

describe("roleActionFor", () => {
  const cases: [GlobalRole, boolean, ReturnType<typeof roleActionFor>][] = [
    ["user", false, "promote"],
    ["admin", false, "demote"],
    ["super_admin", false, "locked"],
    ["user", true, "self"],
    ["admin", true, "self"],
    ["super_admin", true, "locked"], // super_admin sendiri: terkunci karena env, bukan sekadar "diri sendiri"
  ];
  for (const [role, isSelf, expected] of cases) {
    it(`${role}${isSelf ? " (diri sendiri)" : ""} → ${expected}`, () => {
      expect(roleActionFor({ id: isSelf ? SELF : "u-other", role }, SELF)).toBe(expected);
    });
  }
});
