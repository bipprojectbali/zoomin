import { type Database, SQLiteError } from "bun:sqlite";
import type { Page, Role, RoomSummary, SessionUser } from "../shared/api.types";

/** Default dan batas atas `limit` daftar room (kontrak GET /api/rooms). */
export const ROOMS_PAGE_DEFAULT = 20;
export const ROOMS_PAGE_MAX = 100;

/** Dilempar createRoom bila id room sudah dipakai (dipetakan ke 409 oleh route). */
export class RoomExistsError extends Error {}

/** Dilempar listRoomsForUser bila cursor bukan hasil encodeCursor (dipetakan ke 400 oleh route). */
export class InvalidCursorError extends Error {}

type RoomRow = { id: string; title: string; role: Role | null; created_at: number };
type Cursor = { createdAt: number; id: string };

// Cursor opaque: base64url("createdAt,id"). id cocok SAFE_ID_PATTERN (tanpa koma), jadi split pertama aman.
const encodeCursor = (c: Cursor) => Buffer.from(`${c.createdAt},${c.id}`).toString("base64url");

function decodeCursor(cursor: string): Cursor {
  const raw = Buffer.from(cursor, "base64url").toString("utf8");
  const comma = raw.indexOf(",");
  const createdAt = Number(raw.slice(0, comma));
  const id = raw.slice(comma + 1);
  if (comma <= 0 || !Number.isSafeInteger(createdAt) || !id) {
    throw new InvalidCursorError(`listRoomsForUser: cursor tidak valid (${JSON.stringify(cursor)})`);
  }
  return { createdAt, id };
}

/** Role user di room; null bila bukan member (atau room tidak ada). */
export function getMembership(db: Database, roomId: string, userId: string): Role | null {
  const row = db
    .query<{ role: Role }, [string, string]>("SELECT role FROM room_members WHERE room_id = ? AND user_id = ?")
    .get(roomId, userId);
  return row?.role ?? null;
}

/** true bila room dengan id ini ada. */
export function roomExists(db: Database, roomId: string): boolean {
  return db.query<{ one: number }, [string]>("SELECT 1 AS one FROM rooms WHERE id = ?").get(roomId) !== null;
}

// Urutan terbaru dulu; keyset (created_at, id) agar stabil walau created_at kembar.
// Admin global: LEFT JOIN (semua room, role null bila bukan member). Lainnya: JOIN (hanya room member).
const LIST_SQL = (join: "LEFT JOIN" | "JOIN") => `
  SELECT r.id, r.title, m.role, r.created_at
  FROM rooms r ${join} room_members m ON m.room_id = r.id AND m.user_id = ?1
  WHERE ?2 IS NULL OR r.created_at < ?2 OR (r.created_at = ?2 AND r.id < ?3)
  ORDER BY r.created_at DESC, r.id DESC
  LIMIT ?4`;

/** Satu halaman room yang boleh dilihat user (keyset pagination). */
export function listRoomsForUser(
  db: Database,
  user: SessionUser,
  opts: { limit?: number; cursor?: string } = {},
): Page<RoomSummary> {
  const limit = Math.min(Math.max(opts.limit ?? ROOMS_PAGE_DEFAULT, 1), ROOMS_PAGE_MAX);
  const after = opts.cursor ? decodeCursor(opts.cursor) : null;
  const rows = db
    .query<RoomRow, [string, number | null, string | null, number]>(LIST_SQL(user.isAdmin ? "LEFT JOIN" : "JOIN"))
    .all(user.id, after?.createdAt ?? null, after?.id ?? null, limit + 1);
  const items = rows.slice(0, limit).map((r) => ({ id: r.id, title: r.title, role: r.role, createdAt: r.created_at }));
  const last = items.at(-1);
  return { items, nextCursor: rows.length > limit && last ? encodeCursor(last) : null };
}

/** Insert room + pembuatnya sebagai member admin dalam satu transaksi. Throw RoomExistsError bila id dipakai. */
export function createRoom(db: Database, input: { id: string; title: string; createdBy: string }): RoomSummary {
  const createdAt = Date.now();
  try {
    db.transaction(() => {
      db.query("INSERT INTO rooms (id, title, created_by, created_at) VALUES (?, ?, ?, ?)").run(
        input.id,
        input.title,
        input.createdBy,
        createdAt,
      );
      db.query("INSERT INTO room_members (room_id, user_id, role) VALUES (?, ?, 'admin')").run(input.id, input.createdBy);
    })();
  } catch (cause) {
    if (cause instanceof SQLiteError && cause.code === "SQLITE_CONSTRAINT_PRIMARYKEY") {
      throw new RoomExistsError(`createRoom: room ${input.id} sudah ada`, { cause });
    }
    throw new Error(`createRoom: gagal membuat room ${input.id}`, { cause });
  }
  return { id: input.id, title: input.title, role: "admin", createdAt };
}
