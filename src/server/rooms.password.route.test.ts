import { beforeEach, describe, expect, test } from "bun:test";
import type { RoomServiceClient } from "livekit-server-sdk";
import { createTestDeps, createTestUser } from "../../test/auth.helpers";
import type { ApiError, RoomSummary, SessionUser } from "../shared/api.types";
import { createApi } from "./api";
import type { ApiDeps } from "./api.deps";
import { listAudit } from "./audit.repository";
import { createRoom } from "./rooms.repository";

// W1/W2/W7: buat & ubah room tipe password lewat POST /api/rooms dan PATCH /api/rooms/:roomId.
type Actor = { user: SessionUser; cookie: string };
const PW = "rahasia-1"; // test-only

let deps: ApiDeps;
let app: ReturnType<typeof createApi>;
let admin: Actor;
let host: Actor;

beforeEach(async () => {
  deps = createTestDeps();
  deps.roomService = { deleteRoom: async () => {} } as unknown as RoomServiceClient; // test-only: LiveKit palsu
  app = createApi(deps);
  admin = await createTestUser(deps, { email: "admin@example.test", role: "admin" });
  host = await createTestUser(deps, { email: "host@example.test" });
  createRoom(deps.db, { id: "r1", title: "R1", createdBy: host.user.id });
});

function call(method: string, path: string, cookie: string, body?: unknown) {
  return app.handle(
    new Request(`http://localhost/api${path}`, {
      method,
      headers: { "content-type": "application/json", cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}
const hashOf = (id: string) =>
  deps.db.query<{ password_hash: string | null }, [string]>("SELECT password_hash FROM rooms WHERE id = ?").get(id)?.password_hash ?? null;
const pwAudits = () => listAudit(deps.db, { limit: 50, action: "room.password" }).items.map((e) => e.detail).toReversed();
// Hash/password tidak boleh muncul di respons mana pun (W7).
const expectNoSecret = (raw: string, id: string) => {
  expect(raw).not.toContain(PW);
  expect(raw).not.toContain("password_hash");
  const hash = hashOf(id);
  if (hash) expect(raw).not.toContain(hash);
};

describe("POST /api/rooms visibility password", () => {
  test("tersimpan sebagai public + hash argon2id; respons visibility password tanpa hash; list juga tanpa hash", async () => {
    const res = await call("POST", "/rooms", admin.cookie, { id: "pw", title: "PW", visibility: "password", password: PW });
    expect(res.status).toBe(200);
    const raw = await res.text();
    expectNoSecret(raw, "pw");
    expect(JSON.parse(raw)).toMatchObject({ id: "pw", visibility: "password", role: "host" });
    expect(deps.db.query("SELECT visibility FROM rooms WHERE id = 'pw'").get()).toEqual({ visibility: "public" });
    expect(hashOf("pw")).toStartWith("$argon2id$");
    expect(await Bun.password.verify(PW, hashOf("pw")!)).toBe(true);
    const list = await (await call("GET", "/rooms?limit=10", admin.cookie)).text();
    expectNoSecret(list, "pw");
    expect((JSON.parse(list) as { items: RoomSummary[] }).items.find((r) => r.id === "pw")?.visibility).toBe("password");
    expectNoSecret(await (await call("GET", "/rooms/pw", admin.cookie)).text(), "pw");
    expect(JSON.stringify(listAudit(deps.db, { limit: 10 }).items)).not.toContain(PW);
  });

  test("tanpa password / terlalu pendek / terlalu panjang / password di tipe lain → 400 invalid_input, room tidak dibuat", async () => {
    const bodies = [
      { visibility: "password" },
      { visibility: "password", password: "12345" },
      { visibility: "password", password: "x".repeat(65) },
      { visibility: "public", password: PW },
    ];
    for (const [i, extra] of bodies.entries()) {
      const res = await call("POST", "/rooms", admin.cookie, { id: `bad${i}`, title: "B", ...extra });
      expect(res.status).toBe(400);
      expect(((await res.json()) as ApiError).code).toBe("invalid_input");
    }
    expect(deps.db.query("SELECT COUNT(*) AS n FROM rooms WHERE id LIKE 'bad%'").get()).toEqual({ n: 0 });
  });

  test("spasi dihitung (tanpa trim): 6 spasi = password valid", async () => {
    expect((await call("POST", "/rooms", admin.cookie, { id: "sp", title: "S", visibility: "password", password: "      " })).status).toBe(200);
  });
});

describe("PATCH /api/rooms/:roomId password (W7)", () => {
  test("set → change → tanpa password (tetap) → clear ke public; audit room.password {action} tanpa isi", async () => {
    const set = await call("PATCH", "/rooms/r1", host.cookie, { visibility: "password", password: PW });
    expect(set.status).toBe(200);
    const raw = await set.text();
    expectNoSecret(raw, "r1");
    expect(JSON.parse(raw)).toMatchObject({ visibility: "password" });
    const first = hashOf("r1");
    expect(first).not.toBeNull();

    await call("PATCH", "/rooms/r1", host.cookie, { visibility: "password", password: "baru-123" });
    expect(hashOf("r1")).not.toBe(first);
    expect(await Bun.password.verify("baru-123", hashOf("r1")!)).toBe(true);
    const second = hashOf("r1");

    const keep = await call("PATCH", "/rooms/r1", host.cookie, { visibility: "password", title: "Judul" });
    expect(await keep.json()).toMatchObject({ visibility: "password", title: "Judul" });
    expect(hashOf("r1")).toBe(second);

    const clear = await call("PATCH", "/rooms/r1", host.cookie, { visibility: "public" });
    expect(await clear.json()).toMatchObject({ visibility: "public" });
    expect(hashOf("r1")).toBeNull();

    expect(pwAudits()).toEqual([{ action: "set" }, { action: "change" }, { action: "clear" }]);
    const vis = listAudit(deps.db, { limit: 50, action: "room.visibility" }).items.map((e) => e.detail).toReversed();
    expect(vis).toEqual([{ from: "public", to: "password" }, { from: "password", to: "public" }]);
    expect(JSON.stringify(listAudit(deps.db, { limit: 50 }).items)).not.toContain("$argon2");
  });

  test("pindah ke private menghapus hash; password saja (tipe sudah password) = ganti", async () => {
    await call("PATCH", "/rooms/r1", host.cookie, { visibility: "password", password: PW });
    const changed = await call("PATCH", "/rooms/r1", admin.cookie, { password: "lain-456" });
    expect(changed.status).toBe(200);
    expect(await Bun.password.verify("lain-456", hashOf("r1")!)).toBe(true);
    const res = await call("PATCH", "/rooms/r1", host.cookie, { visibility: "private" });
    expect(await res.json()).toMatchObject({ visibility: "private" });
    expect(hashOf("r1")).toBeNull();
    expect(deps.db.query("SELECT visibility FROM rooms WHERE id = 'r1'").get()).toEqual({ visibility: "private" });
    expect(pwAudits()).toEqual([{ action: "set" }, { action: "change" }, { action: "clear" }]);
  });

  test("ke password tanpa password / password di room public / terlalu pendek → 400, tidak berubah", async () => {
    for (const body of [{ visibility: "password" }, { password: PW }, { visibility: "password", password: "123" }]) {
      const res = await call("PATCH", "/rooms/r1", host.cookie, body);
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ code: "invalid_input" });
    }
    expect(hashOf("r1")).toBeNull();
    expect(pwAudits()).toEqual([]);
  });
});
