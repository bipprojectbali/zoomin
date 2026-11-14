import { beforeEach, describe, expect, test } from "bun:test";
import { createTestDeps, createTestUser } from "../../test/auth.helpers";
import type { AcceptInviteResponse, ApiError, InvitePreview, RoomRole, SessionUser } from "../shared/api.types";
import { createApi } from "./api";
import type { ApiDeps } from "./api.deps";
import { createInvite } from "./auth.invite";

let deps: ApiDeps;
let app: ReturnType<typeof createApi>;
let owner: { user: SessionUser; cookie: string };
let guest: { user: SessionUser; cookie: string };
let admin: { user: SessionUser; cookie: string };

beforeEach(async () => {
  deps = createTestDeps({ PUBLIC_APP_URL: "https://app.example.test" });
  app = createApi(deps);
  // owner = user biasa yang menjadi host room (peran room, bukan peran global).
  owner = await createTestUser(deps, { email: "owner@example.test", name: "Owner" });
  guest = await createTestUser(deps, { email: "guest@example.test", name: "Guest" });
  admin = await createTestUser(deps, { email: "admin@example.test", name: "Admin", role: "admin" });
  deps.db.run("INSERT INTO rooms (id, title, created_by, created_at) VALUES ('r1', 'Rapat Desain', ?, 0)", [owner.user.id]);
  deps.db.run("INSERT INTO room_members (room_id, user_id, role) VALUES ('r1', ?, 'host'), ('r1', ?, 'participant')", [owner.user.id, guest.user.id]);
});

const inviteFor = (role: RoomRole, ttlSeconds = 60, roomId = "r1") => createInvite({ roomId, role, ttlSeconds }, deps.config.authSecret);
const roleOf = (userId: string) =>
  deps.db.query<{ role: string }, [string]>("SELECT role FROM room_members WHERE room_id = 'r1' AND user_id = ?").get(userId)?.role;

function call(method: string, path: string, body?: unknown, cookie?: string) {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (cookie) headers.cookie = cookie;
  return app.handle(
    new Request(`http://localhost/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
  );
}
const preview = (invite: string, cookie?: string) =>
  call("GET", `/invites/preview?${new URLSearchParams({ invite })}`, undefined, cookie);
const codeOf = async (res: Promise<Response>) => ((await (await res).json()) as ApiError).code;

describe("POST /rooms/:roomId/invites", () => {
  test("tanpa sesi → 401; room tidak ada → 404; member non-host → 403", async () => {
    expect(await codeOf(call("POST", "/rooms/r1/invites", { role: "viewer" }))).toBe("unauthorized");
    expect(await codeOf(call("POST", "/rooms/nope/invites", { role: "viewer" }, owner.cookie))).toBe("room_not_found");
    expect(await codeOf(call("POST", "/rooms/r1/invites", { role: "viewer" }, guest.cookie))).toBe("forbidden");
  });

  test("host room → 200, url berisi publicAppUrl; ttlHours di luar batas / role asing (termasuk 'admin' lama) → 400", async () => {
    const before = Date.now();
    const res = await call("POST", "/rooms/r1/invites", { role: "participant", ttlHours: 1 }, owner.cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string; expiresAt: number };
    expect(body.url).toStartWith("https://app.example.test/invite/");
    expect(body.expiresAt).toBeGreaterThanOrEqual(before + 3600 * 1000 - 1000);
    expect((await call("POST", "/rooms/r1/invites", { role: "viewer", ttlHours: 721 }, owner.cookie)).status).toBe(400);
    for (const role of ["owner", "admin"]) expect((await call("POST", "/rooms/r1/invites", { role }, owner.cookie)).status).toBe(400);
  });

  test("admin global non-member → 200 (diperlakukan host)", async () => {
    expect((await call("POST", "/rooms/r1/invites", { role: "host" }, admin.cookie)).status).toBe(200);
  });
});

describe("GET /invites/preview", () => {
  test("tanpa sesi → 200 info undangan, currentUser null, effectiveRole = role undangan", async () => {
    const before = Date.now();
    const res = await preview(inviteFor("viewer", 3600));
    expect(res.status).toBe(200);
    const body = (await res.json()) as InvitePreview;
    expect(body).toMatchObject({ roomId: "r1", roomTitle: "Rapat Desain", role: "viewer", currentUser: null, effectiveRole: "viewer" });
    expect(body.expiresAt).toBeGreaterThanOrEqual(before + 3600 * 1000 - 1000);
    expect(Object.keys(body).sort()).toEqual(["currentUser", "effectiveRole", "expiresAt", "passwordRequired", "role", "roomId", "roomTitle"]);
    expect(body.passwordRequired).toBe(false);
  });

  test("bersesi: currentUser = SessionUser; effectiveRole = max(role undangan, role existing); tidak mengubah DB", async () => {
    const lower = (await (await preview(inviteFor("viewer"), guest.cookie)).json()) as InvitePreview;
    expect(lower.currentUser).toEqual(guest.user);
    expect(lower.effectiveRole).toBe("participant");
    const higher = (await (await preview(inviteFor("host"), guest.cookie)).json()) as InvitePreview;
    expect(higher.effectiveRole).toBe("host");
    expect(roleOf(guest.user.id)).toBe("participant");
  });

  test("invalid / expired → 400 invite_invalid; room hilang → 404 room_not_found; tanpa query → 400 invalid_input", async () => {
    for (const invite of [inviteFor("viewer", -1), `${inviteFor("viewer")}x`, "abc"]) {
      const res = await preview(invite);
      expect(res.status).toBe(400);
      expect(((await res.json()) as ApiError).code).toBe("invite_invalid");
    }
    const gone = await preview(inviteFor("viewer", 60, "gone"));
    expect(gone.status).toBe(404);
    expect(((await gone.json()) as ApiError).code).toBe("room_not_found");
    expect(await codeOf(call("GET", "/invites/preview"))).toBe("invalid_input");
  });
});

describe("POST /invites/accept (wajib sesi)", () => {
  test("tanpa sesi → 401 unauthorized, tidak ada user/member baru", async () => {
    const res = await call("POST", "/invites/accept", { invite: inviteFor("viewer") });
    expect(res.status).toBe(401);
    expect(((await res.json()) as ApiError).code).toBe("unauthorized");
    expect(deps.db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM room_members").get()?.n).toBe(2);
  });

  test("user baru (belum member) → jadi member dengan role undangan; url dari create bisa dipakai", async () => {
    const newcomer = await createTestUser(deps, { email: "budi@example.test", name: "Budi" });
    const created = await call("POST", "/rooms/r1/invites", { role: "participant" }, owner.cookie);
    const invite = ((await created.json()) as { url: string }).url.split("/invite/")[1];
    const res = await call("POST", "/invites/accept", { invite }, newcomer.cookie);
    expect(res.status).toBe(200);
    expect((await res.json()) as AcceptInviteResponse).toEqual({ user: newcomer.user, roomId: "r1", role: "participant" });
    expect(roleOf(newcomer.user.id)).toBe("participant");
  });

  test("role naik bila undangan lebih tinggi, tidak pernah turun", async () => {
    const up = await call("POST", "/invites/accept", { invite: inviteFor("host") }, guest.cookie);
    expect(((await up.json()) as AcceptInviteResponse).role).toBe("host");
    const down = await call("POST", "/invites/accept", { invite: inviteFor("viewer") }, owner.cookie);
    expect(((await down.json()) as AcceptInviteResponse).role).toBe("host");
    expect(roleOf(owner.user.id)).toBe("host");
  });

  test("field `name` lama diabaikan: identitas selalu dari sesi", async () => {
    const res = await call("POST", "/invites/accept", { invite: inviteFor("viewer"), name: "Palsu" }, guest.cookie);
    expect(((await res.json()) as AcceptInviteResponse).user.name).toBe("Guest");
  });

  test("invite expired / tamper → 400 invite_invalid; room hilang → 404 room_not_found", async () => {
    expect(await codeOf(call("POST", "/invites/accept", { invite: inviteFor("viewer", -1) }, guest.cookie))).toBe("invite_invalid");
    expect(await codeOf(call("POST", "/invites/accept", { invite: `${inviteFor("viewer")}x` }, guest.cookie))).toBe("invite_invalid");
    const gone = await call("POST", "/invites/accept", { invite: inviteFor("viewer", 60, "gone") }, guest.cookie);
    expect(gone.status).toBe(404);
    expect(((await gone.json()) as ApiError).code).toBe("room_not_found");
  });
});

describe("kode error umum", () => {
  test("route tak dikenal → not_found; /me tanpa sesi → unauthorized; admin-login lama sudah tidak ada", async () => {
    expect(await codeOf(call("GET", "/tidak-ada"))).toBe("not_found");
    expect(await codeOf(call("GET", "/me"))).toBe("unauthorized");
    expect((await call("POST", "/auth/admin-login", { password: "x" })).status).toBe(404);
  });
});

describe("R1/R4/R5: visibility & status room di link undangan", () => {
  const setRoom = (sql: string) => deps.db.run(`UPDATE rooms SET ${sql} WHERE id = 'r1'`);
  const accept = (invite: string, cookie: string) => call("POST", "/invites/accept", { invite }, cookie);

  test("room private: membuat link → 403 room_private (admin juga); preview/accept non-member → room_private", async () => {
    const invite = inviteFor("viewer"); // link lama dibuat saat masih public (R4)
    setRoom("visibility = 'private'");
    expect(await codeOf(call("POST", "/rooms/r1/invites", { role: "viewer" }, owner.cookie))).toBe("room_private");
    expect(await codeOf(call("POST", "/rooms/r1/invites", { role: "viewer" }, admin.cookie))).toBe("room_private");
    const stranger = await createTestUser(deps, { email: "stranger@example.test" });
    expect(await codeOf(preview(invite))).toBe("room_private");
    expect(await codeOf(preview(invite, stranger.cookie))).toBe("room_private");
    expect(await codeOf(accept(invite, stranger.cookie))).toBe("room_private");
    expect(roleOf(stranger.user.id)).toBeUndefined();
    // Anggota yang sudah ada tetap bisa memakai link (R1: masuk bila sudah anggota).
    expect((await preview(invite, guest.cookie)).status).toBe(200);
    expect((await accept(invite, guest.cookie)).status).toBe(200);
    // Kembali public → link lama berlaku lagi.
    setRoom("visibility = 'public'");
    expect((await accept(invite, stranger.cookie)).status).toBe(200);
  });

  test("room nonaktif / kadaluarsa → preview & accept 403 room_inactive / room_expired", async () => {
    const invite = inviteFor("viewer");
    setRoom(`expires_at = ${Date.now() - 1}`);
    expect(await codeOf(preview(invite))).toBe("room_expired");
    expect(await codeOf(accept(invite, guest.cookie))).toBe("room_expired");
    setRoom("disabled_at = 1");
    expect(await codeOf(preview(invite, guest.cookie))).toBe("room_inactive");
    expect(await codeOf(accept(invite, admin.cookie))).toBe("room_inactive");
    expect(roleOf(admin.user.id)).toBeUndefined();
  });
});
