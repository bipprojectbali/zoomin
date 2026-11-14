import { describe, expect, test } from "bun:test";
import { createTestDeps, createTestUser } from "../../test/auth.helpers";
import { type ApiError, USER_SEARCH_MAX_RESULTS, type UserSearchResponse } from "../shared/api.types";
import { createApi } from "./api";
import { createRoom } from "./rooms.repository";
import { USER_SEARCH_RATE_MAX } from "./users.search.route";

const deps = createTestDeps();
const { db } = deps;
const app = createApi(deps);

const admin = await createTestUser(deps, { email: "admin@example.test", name: "Adi", role: "admin" });
const host = await createTestUser(deps, { email: "host@example.test", name: "Hana" });
const plain = await createTestUser(deps, { email: "plain@example.test", name: "Polos" });
createRoom(db, { id: "host-room", title: "H", createdBy: host.user.id });

function search(qs: string, cookie?: string) {
  const headers: Record<string, string> = cookie ? { cookie } : {};
  return app.handle(new Request(`http://localhost/api/users/search?${qs}`, { headers }));
}
const items = async (res: Response) => ((await res.json()) as UserSearchResponse).items;
const code = async (res: Response) => ((await res.json()) as ApiError).code;

describe("GET /api/users/search — akses (P4)", () => {
  test("tanpa sesi 401; user biasa 403 insufficient_role; admin & host room 200", async () => {
    expect((await search("q=ha")).status).toBe(401);
    const denied = await search("q=ha", plain.cookie);
    expect([denied.status, await code(denied)]).toEqual([403, "insufficient_role"]);
    expect((await search("q=ha", admin.cookie)).status).toBe(200);
    const res = await search("q=hana", host.cookie);
    expect(res.status).toBe(200);
    expect(await items(res)).toEqual([{ id: host.user.id, name: "Hana", email: "host@example.test", image: null }]);
  });
});

describe("GET /api/users/search — hasil", () => {
  test("q kosong/tanpa q → semua akun non-banned urut nama; 1 huruf bisa; q > 100 → 400 invalid_input /q", async () => {
    const all = await items(await search("q=", admin.cookie));
    expect(all.map((u) => u.name)).toEqual(["Adi", "Hana", "Polos"]);
    expect(await items(await search(`q=${encodeURIComponent("   ")}`, admin.cookie))).toEqual(all);
    expect(await items(await search("", admin.cookie))).toEqual(all);
    expect((await items(await search("q=h", admin.cookie))).map((u) => u.name)).toEqual(["Hana"]);
    const res = await search(`q=${"x".repeat(101)}`, admin.cookie);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "invalid_input", path: "/q" });
  });

  test("cocok nama/email case-insensitive, urut nama", async () => {
    await createTestUser(deps, { email: "zed@corp.test", name: "zeta Corp" });
    await createTestUser(deps, { email: "a.corp@x.test", name: "Alfa" });
    const res = await items(await search("q=CORP", admin.cookie));
    expect(res.map((u) => u.name)).toEqual(["Alfa", "zeta Corp"]);
  });

  test("% dan _ dicari literal (ESCAPE)", async () => {
    await createTestUser(deps, { email: "pct@lit.test", name: "Diskon 50%x" });
    await createTestUser(deps, { email: "under@lit.test", name: "snake_case" });
    expect((await items(await search(`q=${encodeURIComponent("0%x")}`, admin.cookie))).map((u) => u.name)).toEqual(["Diskon 50%x"]);
    expect((await items(await search("q=e_c", admin.cookie))).map((u) => u.name)).toEqual(["snake_case"]);
    expect(await items(await search(`q=${encodeURIComponent("%%")}`, admin.cookie))).toEqual([]);
  });

  test("banned aktif dikecualikan; ban kedaluwarsa tampil lagi", async () => {
    const perm = await createTestUser(deps, { email: "perm@ban.test", name: "Ban Permanen" });
    const past = await createTestUser(deps, { email: "past@ban.test", name: "Ban Lewat" });
    const future = await createTestUser(deps, { email: "future@ban.test", name: "Ban Nanti" });
    db.query(`UPDATE "user" SET banned = 1, banExpires = NULL WHERE id = ?`).run(perm.user.id);
    db.query(`UPDATE "user" SET banned = 1, banExpires = ? WHERE id = ?`).run(new Date(Date.now() - 60_000).toISOString(), past.user.id);
    db.query(`UPDATE "user" SET banned = 1, banExpires = ? WHERE id = ?`).run(new Date(Date.now() + 60_000).toISOString(), future.user.id);
    expect((await items(await search("q=ban.test", admin.cookie))).map((u) => u.name)).toEqual(["Ban Lewat"]);
  });

  test("limit default 20, dipangkas ke maks 50", async () => {
    for (let i = 0; i < 55; i++) await createTestUser(deps, { email: `many${i}@bulk.test`, name: `Bulk ${String(i).padStart(2, "0")}` });
    expect(await items(await search("q=bulk", admin.cookie))).toHaveLength(20);
    expect(await items(await search("q=bulk&limit=500", admin.cookie))).toHaveLength(USER_SEARCH_MAX_RESULTS);
    expect(USER_SEARCH_MAX_RESULTS).toBe(50);
    expect(await items(await search("q=bulk&limit=3", admin.cookie))).toHaveLength(3);
    expect((await search("q=bulk&limit=0", admin.cookie)).status).toBe(400);
  });

  test(`rate limit: lebih dari ${USER_SEARCH_RATE_MAX}/menit per user → 429 rate_limited`, async () => {
    const heavy = await createTestUser(deps, { email: "heavy@example.test", role: "admin" });
    for (let i = 0; i < USER_SEARCH_RATE_MAX; i++) expect((await search("q=xx", heavy.cookie)).status).toBe(200);
    const res = await search("q=xx", heavy.cookie);
    expect([res.status, await code(res)]).toEqual([429, "rate_limited"]);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    // User lain tidak terdampak.
    expect((await search("q=xx", admin.cookie)).status).toBe(200);
  });
});
