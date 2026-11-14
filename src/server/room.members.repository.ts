import type { Database } from "bun:sqlite";
import type { Page, RoomMemberItem, RoomRole, SessionUser } from "../shared/api.types";
import { recordAudit } from "./audit.repository";
import { InvalidCursorError } from "./rooms.repository";

/** Default dan batas atas `limit` daftar anggota (GET /api/rooms/:roomId/members). */
export const MEMBERS_PAGE_DEFAULT = 50;
export const MEMBERS_PAGE_MAX = 200;

/** Menurunkan/mengeluarkan host terakhir room (R9 → 409 `last_host`). */
export class LastHostError extends Error {}
/** Anggota/pending yang disasar tidak ada (→ 404 `member_not_found`). */
export class MemberNotFoundError extends Error {}

type MemberRow = { user_id: string; name: string; email: string; image: string | null; role: RoomRole };
type PendingRow = { email: string; role: RoomRole; created_at: number };
// Cursor opaque base64url(JSON): ["m", name, userId] (lanjut member lalu pending) atau ["p", email] (lanjut pending).
type Cursor = ["m", string, string] | ["p", string];

const encodeCursor = (c: Cursor) => Buffer.from(JSON.stringify(c)).toString("base64url");

function decodeCursor(cursor: string): Cursor {
  let c: unknown;
  try {
    c = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch (cause) {
    throw new InvalidCursorError(`listRoomMembers: cursor bukan JSON (${JSON.stringify(cursor)})`, { cause });
  }
  const ok =
    Array.isArray(c) &&
    c.every((v) => typeof v === "string") &&
    ((c[0] === "m" && c.length === 3) || (c[0] === "p" && c.length === 2));
  if (!ok) throw new InvalidCursorError(`listRoomMembers: cursor tidak valid (${JSON.stringify(cursor)})`);
  return c as Cursor;
}

const toMember = (r: MemberRow): RoomMemberItem => ({ kind: "member", userId: r.user_id, name: r.name, email: r.email, image: r.image, role: r.role });
const toPending = (r: PendingRow): RoomMemberItem => ({ kind: "pending", email: r.email, role: r.role, invitedAt: r.created_at });

/** Member (urut nama, keyset name+id) lalu pending (urut email) dalam satu Page; satu JOIN, tanpa N+1. */
export function listRoomMembers(db: Database, roomId: string, opts: { limit?: number; cursor?: string } = {}): Page<RoomMemberItem> {
  const limit = Math.min(Math.max(opts.limit ?? MEMBERS_PAGE_DEFAULT, 1), MEMBERS_PAGE_MAX);
  const after = opts.cursor ? decodeCursor(opts.cursor) : null;
  const members =
    after?.[0] === "p"
      ? []
      : db
          .query<MemberRow, [string, string | null, string | null, number]>(
            `SELECT m.user_id, u.name, u.email, u.image, m.role FROM room_members m JOIN "user" u ON u.id = m.user_id
             WHERE m.room_id = ?1 AND (?2 IS NULL OR u.name > ?2 OR (u.name = ?2 AND u.id > ?3))
             ORDER BY u.name, u.id LIMIT ?4`,
          )
          .all(roomId, after?.[1] ?? null, after?.[0] === "m" ? after[2] : null, limit + 1);
  if (members.length > limit) {
    const last = members[limit - 1]!;
    return { items: members.slice(0, limit).map(toMember), nextCursor: encodeCursor(["m", last.name, last.user_id]) };
  }
  const room = limit - members.length;
  const pending = db
    .query<PendingRow, [string, string | null, number]>(
      `SELECT email, role, created_at FROM room_invitations WHERE room_id = ?1 AND (?2 IS NULL OR email > ?2) ORDER BY email LIMIT ?3`,
    )
    .all(roomId, after?.[0] === "p" ? after[1] : null, room + 1);
  const items = [...members.map(toMember), ...pending.slice(0, room).map(toPending)];
  if (pending.length <= room) return { items, nextCursor: null };
  const lastPending = pending[room - 1];
  const lastMember = members.at(-1);
  // room = 0 → halaman penuh member; cursor member terakhir membuat halaman berikut mulai dari pending pertama.
  const next: Cursor = lastPending ? ["p", lastPending.email] : ["m", lastMember!.name, lastMember!.user_id];
  return { items, nextCursor: encodeCursor(next) };
}

const memberRole = (db: Database, roomId: string, userId: string) =>
  db.query<{ role: RoomRole }, [string, string]>("SELECT role FROM room_members WHERE room_id = ? AND user_id = ?").get(roomId, userId)?.role ?? null;

/** Throw LastHostError bila `userId` host satu-satunya dan akan kehilangan peran host. */
function assertNotLastHost(db: Database, roomId: string, userId: string, nextRole: RoomRole | null): void {
  if (nextRole === "host" || memberRole(db, roomId, userId) !== "host") return;
  const hosts = db.query<{ n: number }, [string]>("SELECT COUNT(*) AS n FROM room_members WHERE room_id = ? AND role = 'host'").get(roomId)?.n ?? 0;
  if (hosts <= 1) throw new LastHostError(`room ${roomId}: user ${userId} adalah host terakhir`);
}

const getMember = (db: Database, roomId: string, userId: string) =>
  db
    .query<MemberRow, [string, string]>(
      `SELECT m.user_id, u.name, u.email, u.image, m.role FROM room_members m JOIN "user" u ON u.id = m.user_id WHERE m.room_id = ? AND m.user_id = ?`,
    )
    .get(roomId, userId);

const audit = (db: Database, by: SessionUser, action: "room.member.add" | "room.member.role" | "room.member.remove", roomId: string, detail: Record<string, unknown>) =>
  recordAudit(db, { actorId: by.id, actorEmail: by.email, action, targetType: "room", targetId: roomId, detail });

/**
 * Tambah anggota lewat email ternormalisasi (R2): user ada → room_members dengan role persis (upsert); belum ada →
 * pending di room_invitations. Audit room.member.add dalam transaksi yang sama.
 */
export function addRoomMember(db: Database, roomId: string, email: string, role: RoomRole, by: SessionUser): RoomMemberItem {
  return db.transaction(() => {
    const user = db.query<{ id: string }, [string]>(`SELECT id FROM "user" WHERE email = ?`).get(email);
    if (user) {
      assertNotLastHost(db, roomId, user.id, role);
      db.query(
        "INSERT INTO room_members (room_id, user_id, role) VALUES (?, ?, ?) ON CONFLICT(room_id, user_id) DO UPDATE SET role = excluded.role",
      ).run(roomId, user.id, role);
      audit(db, by, "room.member.add", roomId, { userId: user.id, email, role, pending: false });
      return toMember(getMember(db, roomId, user.id)!);
    }
    const now = Date.now();
    db.query(
      `INSERT INTO room_invitations (room_id, email, role, invited_by, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(room_id, email) DO UPDATE SET role = excluded.role, invited_by = excluded.invited_by`,
    ).run(roomId, email, role, by.id, now);
    audit(db, by, "room.member.add", roomId, { email, role, pending: true });
    const row = db.query<PendingRow, [string, string]>("SELECT email, role, created_at FROM room_invitations WHERE room_id = ? AND email = ?").get(roomId, email)!;
    return toPending(row);
  })();
}

/** Ubah role anggota; MemberNotFoundError / LastHostError. */
export function updateRoomMemberRole(db: Database, roomId: string, userId: string, role: RoomRole, by: SessionUser): RoomMemberItem {
  return db.transaction(() => {
    const before = memberRole(db, roomId, userId);
    if (!before) throw new MemberNotFoundError(`room ${roomId}: user ${userId} bukan anggota`);
    assertNotLastHost(db, roomId, userId, role);
    db.query("UPDATE room_members SET role = ? WHERE room_id = ? AND user_id = ?").run(role, roomId, userId);
    audit(db, by, "room.member.role", roomId, { userId, from: before, to: role });
    return toMember(getMember(db, roomId, userId)!);
  })();
}

/** Keluarkan anggota; MemberNotFoundError / LastHostError. */
export function removeRoomMember(db: Database, roomId: string, userId: string, by: SessionUser): void {
  db.transaction(() => {
    const before = memberRole(db, roomId, userId);
    if (!before) throw new MemberNotFoundError(`room ${roomId}: user ${userId} bukan anggota`);
    assertNotLastHost(db, roomId, userId, null);
    db.query("DELETE FROM room_members WHERE room_id = ? AND user_id = ?").run(roomId, userId);
    audit(db, by, "room.member.remove", roomId, { userId, role: before });
  })();
}

/** Batalkan undangan pending (email ternormalisasi); MemberNotFoundError bila tidak ada. */
export function cancelRoomInvitation(db: Database, roomId: string, email: string, by: SessionUser): void {
  db.transaction(() => {
    const { changes } = db.query("DELETE FROM room_invitations WHERE room_id = ? AND email = ?").run(roomId, email);
    if (changes === 0) throw new MemberNotFoundError(`room ${roomId}: tidak ada undangan pending untuk email tersebut`);
    audit(db, by, "room.member.remove", roomId, { email, pending: true });
  })();
}
