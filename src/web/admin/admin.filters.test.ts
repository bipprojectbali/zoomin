import { expect, test } from "bun:test";
import { ADMIN_PAGE_SIZE, usersQuery } from "./admin.filters";

test("tanpa filter → hanya limit", () => {
  expect(usersQuery("  ", "all", "all")).toEqual({ q: undefined, role: undefined, banned: undefined, limit: ADMIN_PAGE_SIZE, cursor: undefined });
});

test("filter lengkap + cursor", () => {
  expect(usersQuery(" budi ", "admin", "banned", "c1")).toEqual({ q: "budi", role: "admin", banned: true, limit: ADMIN_PAGE_SIZE, cursor: "c1" });
  expect(usersQuery("", "user", "active").banned).toBe(false);
});
