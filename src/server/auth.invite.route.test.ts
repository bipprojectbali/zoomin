import { beforeEach, describe, expect, test } from "bun:test";
import { RoomServiceClient } from "livekit-server-sdk";
import type { AcceptInviteResponse, ApiError, InvitePreview, Role } from "../shared/api.types";
import { createApi } from "./api";
import type { ApiDeps } from "./api.deps";
import { createInvite } from "./auth.invite";
import { createSessionCookie } from "./auth.session";
import { loadConfig } from "./config";
import { openDb } from "./db";

const config = loadConfig({ DB_PATH: ":memory:" });
let deps: ApiDeps;
let app: ReturnType<typeof createApi>;

beforeEach(() => {
  // Tidak dipanggil route undangan; hanya memenuhi tipe.
  deps = { db: openDb(":memory:"), config, roomService: new RoomServiceClient("http://127.0.0.1:1", "k", "s") };
  app = createApi(deps);
  deps.db.run("INSERT INTO users (id, name, is_admin, created_at) VALUES ('owner', 'Owner', 0, 0), ('guest', 'Guest', 0, 0)");
  deps.db.run("INSERT INTO rooms (id, title, created_by, created_at) VALUES ('r1', 'Rapat Desain', 'owner', 0)");
  deps.db.run("INSERT INTO room_members (room_id, user_id, role) VALUES ('r1', 'owner', 'admin'), ('r1', 'guest', 'participant')");
});

const cookieFor = (userId: string) => createSessionCookie(userId, config.sessionSecret, 60, false).split(";")[0] ?? "";
const inviteFor = (role: Role, ttlSeconds = 60, roomId = "r1") => createInvite({ roomId, role, ttlSeconds }, config.sessionSecret);

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

describe("GET /invites/preview", () => {
  test("tanpa sesi → 200 info undangan, currentUser null, effectiveRole = role undangan", async () => {
    const before = Date.now();
    const res = await preview(inviteFor("viewer", 3600));
    expect(res.status).toBe(200);
    const body = (await res.json()) as InvitePreview;
    expect(body).toMatchObject({ roomId: "r1", roomTitle: "Rapat Desain", role: "viewer", currentUser: null, effectiveRole: "viewer" });
    expect(body.expiresAt).toBeGreaterThanOrEqual(before + 3600 * 1000 - 1000);
    expect(Object.keys(body).sort()).toEqual(["currentUser", "effectiveRole", "expiresAt", "role", "roomId", "roomTitle"]);
  });

  test("bersesi: effectiveRole = max(role undangan, role existing); tidak mengubah DB", async () => {
    const lower = (await (await preview(inviteFor("viewer"), cookieFor("guest"))).json()) as InvitePreview;
    expect(lower.currentUser).toEqual({ id: "guest", name: "Guest", isAdmin: false });
    expect(lower.effectiveRole).toBe("participant");
    const higher = (await (await preview(inviteFor("admin"), cookieFor("guest"))).json()) as InvitePreview;
    expect(higher.effectiveRole).toBe("admin");
    const role = deps.db.query<{ role: string }, []>("SELECT role FROM room_members WHERE user_id = 'guest'").get()?.role;
    expect(role).toBe("participant");
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
    const missing = await call("GET", "/invites/preview");
    expect(missing.status).toBe(400);
    expect(((await missing.json()) as ApiError).code).toBe("invalid_input");
  });
});

describe("POST /invites/accept (kontrak name + role efektif)", () => {
  test("bersesi tanpa name → 200, identitas tetap, role efektif dikembalikan", async () => {
    const res = await call("POST", "/invites/accept", { invite: inviteFor("viewer") }, cookieFor("guest"));
    expect(res.status).toBe(200);
    expect((await res.json()) as AcceptInviteResponse).toEqual({
      user: { id: "guest", name: "Guest", isAdmin: false },
      roomId: "r1",
      role: "participant",
    });
  });

  test("bersesi dengan name → name diabaikan", async () => {
    const res = await call("POST", "/invites/accept", { invite: inviteFor("admin"), name: "Citra" }, cookieFor("guest"));
    const body = (await res.json()) as AcceptInviteResponse;
    expect(body.user.name).toBe("Guest");
    expect(body.role).toBe("admin");
  });

  test("tanpa sesi tanpa name → 400 invalid_input path /name; dengan name → role undangan", async () => {
    const res = await call("POST", "/invites/accept", { invite: inviteFor("viewer") });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "invalid_input", path: "/name" });
    const ok = await call("POST", "/invites/accept", { invite: inviteFor("viewer"), name: "Citra" });
    expect(((await ok.json()) as AcceptInviteResponse).role).toBe("viewer");
  });

  test("invite invalid → invite_invalid; room hilang → room_not_found", async () => {
    const bad = await call("POST", "/invites/accept", { invite: "abc", name: "A" });
    expect(((await bad.json()) as ApiError).code).toBe("invite_invalid");
    const gone = await call("POST", "/invites/accept", { invite: inviteFor("viewer", 60, "gone"), name: "A" });
    expect(gone.status).toBe(404);
    expect(((await gone.json()) as ApiError).code).toBe("room_not_found");
  });
});

describe("kode error buat undangan + umum", () => {
  test("401 unauthorized, 403 forbidden, 404 room_not_found, route tak dikenal → not_found", async () => {
    const codeOf = async (res: Promise<Response>) => ((await (await res).json()) as ApiError).code;
    expect(await codeOf(call("POST", "/rooms/r1/invites", { role: "viewer" }))).toBe("unauthorized");
    expect(await codeOf(call("POST", "/rooms/r1/invites", { role: "viewer" }, cookieFor("guest")))).toBe("forbidden");
    expect(await codeOf(call("POST", "/rooms/nope/invites", { role: "viewer" }, cookieFor("owner")))).toBe("room_not_found");
    expect(await codeOf(call("GET", "/tidak-ada"))).toBe("not_found");
    expect(await codeOf(call("POST", "/auth/admin-login", { password: "salah" }))).toBe("invalid_credentials");
    expect(await codeOf(call("GET", "/me"))).toBe("unauthorized");
  });
});
