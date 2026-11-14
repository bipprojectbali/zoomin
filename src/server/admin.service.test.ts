import { describe, expect, test } from "bun:test";
import { createTestDeps, createTestUser, TEST_SUPER_ADMIN_EMAIL } from "../../test/auth.helpers";
import type { GlobalRole } from "../shared/api.types";
import { AdminActionError, canManage, setGlobalRole } from "./admin.service";
import { listAudit } from "./audit.repository";

describe("canManage (A5)", () => {
  const cases: [GlobalRole, GlobalRole, boolean][] = [
    ["user", "user", false],
    ["user", "admin", false],
    ["admin", "user", true],
    ["admin", "admin", false],
    ["admin", "super_admin", false],
    ["super_admin", "user", true],
    ["super_admin", "admin", true],
    ["super_admin", "super_admin", false],
  ];
  test.each(cases)("%s → %s = %p", (actor, target, expected) => {
    expect(canManage(actor, target)).toBe(expected);
  });
});

describe("setGlobalRole", () => {
  async function setup() {
    const deps = createTestDeps();
    const root = await createTestUser(deps, { email: TEST_SUPER_ADMIN_EMAIL });
    const adm = await createTestUser(deps, { email: "adm@example.test", role: "admin" });
    const ana = await createTestUser(deps, { email: "ana@example.test" });
    return { deps, root, adm, ana };
  }
  const codeOf = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => (e instanceof AdminActionError ? e.code : e));

  test("super_admin angkat user → admin lalu turunkan lagi; audit user.role from/to", async () => {
    const { deps, root, ana } = await setup();
    expect((await setGlobalRole(deps, root.user, ana.user.id, "admin")).role).toBe("admin");
    expect((await setGlobalRole(deps, root.user, ana.user.id, "user")).role).toBe("user");
    const details = listAudit(deps.db, { action: "user.role" }).items.map((e) => e.detail).toSorted((a, b) => String(a.to).localeCompare(String(b.to)));
    expect(details).toEqual([{ from: "user", to: "admin" }, { from: "admin", to: "user" }]);
  });

  test("admin tidak boleh; super_admin ke diri sendiri / tak ada → kode A5", async () => {
    const { deps, root, adm, ana } = await setup();
    expect(await codeOf(setGlobalRole(deps, adm.user, ana.user.id, "admin"))).toBe("insufficient_role");
    expect(await codeOf(setGlobalRole(deps, root.user, root.user.id, "user"))).toBe("cannot_modify_self");
    expect(await codeOf(setGlobalRole(deps, root.user, "nope", "admin"))).toBe("user_not_found");
    expect(listAudit(deps.db).items).toEqual([]);
  });
});
