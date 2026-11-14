import { describe, expect, test } from "bun:test";
import type { RoomServiceClient } from "livekit-server-sdk";
import { createTestDeps, createTestUser } from "../../test/auth.helpers";
import { canManageRoom, roomStatus } from "./room.access";
import { runEnforcerOnce } from "./room.enforcer";
import { createRoom } from "./rooms.repository";

describe("roomStatus (R5)", () => {
  const now = 1_000;
  test.each([
    [{ disabled_at: null, expires_at: null }, "active"],
    [{ disabled_at: null, expires_at: now + 1 }, "active"],
    [{ disabled_at: null, expires_at: now }, "expired"],
    [{ disabled_at: 5, expires_at: now - 1 }, "inactive"], // nonaktif menang atas kadaluarsa
  ] as const)("%o → %s", (row, want) => expect(roomStatus(row, now)).toBe(want));
});

const deps = createTestDeps();
const { db } = deps;
const admin = await createTestUser(deps, { email: "admin@example.test", role: "admin" });
const host = await createTestUser(deps, { email: "host@example.test" });
const viewer = await createTestUser(deps, { email: "viewer@example.test" });
for (const id of ["ok", "off", "old"]) createRoom(db, { id, title: id, createdBy: host.user.id });
db.query("INSERT INTO room_members (room_id, user_id, role) VALUES ('ok', ?, 'viewer')").run(viewer.user.id);
db.query("UPDATE rooms SET disabled_at = 1 WHERE id = 'off'").run();
db.query("UPDATE rooms SET expires_at = 1 WHERE id = 'old'").run();

describe("canManageRoom (R3)", () => {
  test("host room & admin global → true; viewer / non-member → false", () => {
    expect(canManageRoom(db, host.user, "ok")).toBe(true);
    expect(canManageRoom(db, admin.user, "ok")).toBe(true);
    expect(canManageRoom(db, viewer.user, "ok")).toBe(false);
    expect(canManageRoom(db, viewer.user, "off")).toBe(false);
  });
});

describe("runEnforcerOnce (R6)", () => {
  // test-only: LiveKit palsu; room "gone" live tapi tidak ada di DB; deleteRoom "off" gagal (harus tetap lanjut).
  const fake = (live: string[]) => {
    const deleted: string[] = [];
    const roomService = {
      listRooms: async () => live.map((name) => ({ name })),
      async deleteRoom(name: string) {
        deleted.push(name);
        if (name === "off") throw new Error("livekit error");
      },
    } as unknown as RoomServiceClient;
    return { roomService, deleted };
  };

  test("room live yang nonaktif/kadaluarsa/terhapus ditutup; room aktif dibiarkan", async () => {
    const lk = fake(["ok", "off", "old", "gone"]);
    expect(await runEnforcerOnce({ db, roomService: lk.roomService })).toEqual(["off", "old", "gone"]);
    expect(lk.deleted.toSorted()).toEqual(["gone", "off", "old"]);
  });

  test("tanpa room live → tidak ada deleteRoom", async () => {
    const lk = fake([]);
    expect(await runEnforcerOnce({ db, roomService: lk.roomService })).toEqual([]);
    expect(lk.deleted).toEqual([]);
  });
});
