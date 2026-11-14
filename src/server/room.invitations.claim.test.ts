import { expect, test } from "bun:test";
import { createTestDeps, createTestUser } from "../../test/auth.helpers";
import { claimPendingInvitations } from "./room.invitations.claim";
import { createRoom } from "./rooms.repository";

const deps = createTestDeps();
const { db } = deps;
const owner = await createTestUser(deps, { email: "owner@example.test" });
for (const id of ["r1", "r2", "r3"]) createRoom(db, { id, title: id, createdBy: owner.user.id });

const invite = (roomId: string, email: string, role: string) =>
  db.query("INSERT INTO room_invitations (room_id, email, role, invited_by, created_at) VALUES (?, ?, ?, ?, ?)").run(roomId, email, role, owner.user.id, Date.now());
const roles = (userId: string) =>
  db.query<{ room_id: string; role: string }, [string]>("SELECT room_id, role FROM room_members WHERE user_id = ? ORDER BY room_id").all(userId);

test("login pertama (hook session.create) mengklaim undangan pending lalu menghapusnya", async () => {
  invite("r1", "newbie@example.test", "participant");
  invite("r2", "newbie@example.test", "host");
  invite("r1", "other@example.test", "viewer");
  const { user } = await createTestUser(deps, { email: "Newbie@Example.test" });
  expect(roles(user.id)).toEqual([
    { room_id: "r1", role: "participant" },
    { room_id: "r2", role: "host" },
  ]);
  expect(db.query("SELECT email FROM room_invitations").all()).toEqual([{ email: "other@example.test" }]);
});

test("tidak menurunkan role anggota yang lebih tinggi; menaikkan yang lebih rendah", () => {
  invite("r1", "owner@example.test", "viewer");
  invite("r3", "owner@example.test", "viewer");
  db.query("UPDATE room_members SET role = 'viewer' WHERE room_id = 'r2' AND user_id = ?").run(owner.user.id);
  invite("r2", "owner@example.test", "participant");
  expect(claimPendingInvitations(db, owner.user.id, " OWNER@example.test ")).toBe(3);
  expect(roles(owner.user.id)).toEqual([
    { room_id: "r1", role: "host" },
    { room_id: "r2", role: "participant" },
    { room_id: "r3", role: "host" },
  ]);
  expect(claimPendingInvitations(db, owner.user.id, "owner@example.test")).toBe(0);
});
