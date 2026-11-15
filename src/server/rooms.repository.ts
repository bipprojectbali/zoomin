import { type Database, SQLiteError } from "bun:sqlite";
import type { AddRoomMemberBody, Page, RoomRole, RoomSummary, RoomVisibility, SessionUser, StageMode } from "../shared/api.types";
import { recordAudit } from "./audit.repository";
import { addRoomMember } from "./room.members.repository";
import { dbVisibility, ROOM_COLUMNS, type RoomRow, toRoomSummary } from "./room.access";

/** Default dan batas atas `limit` daftar room (kontrak GET /api/rooms). */
export const ROOMS_PAGE_DEFAULT = 20;
export const ROOMS_PAGE_MAX = 100;

/** Dilempar createRoom bila id room sudah dipakai (dipetakan ke 409 oleh route). */
export class RoomExistsError extends Error {}

/** Dilempar listRoomsForUser bila cursor bukan hasil encodeCursor (dipetakan ke 400 oleh route). */
export class InvalidCursorError extends Error {}

type Cursor = { createdAt: number; id: string };

// Cursor opaque: base64url("createdAt,id"). id cocok SAFE_ID_PATTERN (tanpa koma), jadi split pertama aman.
const encodeCursor = (c: Cursor) => Buffer.from(`${c.createdAt},${c.id}`).toString("base64url");

function decodeCursor(cursor: string): Cursor {
  const raw = Buffer.from(cursor, "base64url").toString("utf8");
  const comma = raw.indexOf(",");
  const createdAt = Number(raw.slice(0, comma));
  const id = raw.slice(comma + 1);
  if (comma <= 0 || !Number.isSafeInteger(createdAt) || !id) {
    throw new InvalidCursorError(`listRoomsForUser: invalid cursor (${JSON.stringify(cursor)})`);
  }
  return { createdAt, id };
}

/** Role user di room; null bila bukan member (atau room tidak ada). */
export function getMembership(db: Database, roomId: string, userId: string): RoomRole | null {
  const row = db
    .query<{ role: RoomRole }, [string, string]>("SELECT role FROM room_members WHERE room_id = ? AND user_id = ?")
    .get(roomId, userId);
  return row?.role ?? null;
}

/** true bila room dengan id ini ada. */
export function roomExists(db: Database, roomId: string): boolean {
  return db.query<{ one: number }, [string]>("SELECT 1 AS one FROM rooms WHERE id = ?").get(roomId) !== null;
}

// Urutan terbaru dulu; keyset (created_at, id) agar stabil walau created_at kembar.
// Admin/super_admin global: LEFT JOIN (semua room, role null bila bukan member). user: JOIN (hanya room member).
const LIST_SQL = (join: "LEFT JOIN" | "JOIN") => `
  SELECT ${ROOM_COLUMNS}
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
    .query<RoomRow, [string, number | null, string | null, number]>(LIST_SQL(user.role === "user" ? "JOIN" : "LEFT JOIN"))
    .all(user.id, after?.createdAt ?? null, after?.id ?? null, limit + 1);
  const now = Date.now();
  const items = rows.slice(0, limit).map((r) => toRoomSummary(r, user, now));
  const last = items.at(-1);
  return { items, nextCursor: rows.length > limit && last ? encodeCursor(last) : null };
}

/**
 * Insert room + pembuatnya sebagai member host dalam satu transaksi. Throw RoomExistsError bila id dipakai.
 * `actorEmail` diisi → audit `room.create` (A8) ikut di transaksi yang sama (room tanpa audit / audit tanpa room
 * tak mungkin). Opsional hanya agar fixture test bisa membuat room tanpa audit; route wajib mengisinya.
 * `members` (email sudah dinormalisasi & lolos allowlist, tanpa email pembuat) ditambahkan di transaksi yang sama
 * lewat addRoomMember (P5): gagal satu = tidak ada room/anggota/audit yang tersimpan.
 * `visibility` "password" wajib disertai `passwordHash` (Bun.password, divalidasi route); selain itu hash diabaikan (W1).
 */
export function createRoom(
  db: Database,
  input: {
    id: string;
    title: string;
    createdBy: string;
    actorEmail?: string;
    visibility?: RoomVisibility;
    passwordHash?: string;
    expiresAt?: number | null;
    members?: AddRoomMemberBody[];
    stageMode?: StageMode;
  },
): RoomSummary {
  const createdAt = Date.now();
  const visibility = input.visibility ?? "public";
  const expiresAt = input.expiresAt ?? null;
  const stageMode = input.stageMode ?? "host";
  const passwordHash = visibility === "password" ? input.passwordHash : undefined;
  if (visibility === "password" && !passwordHash) throw new Error(`createRoom: room ${input.id} is a password room without a hash`);
  try {
    db.transaction(() => {
      db.query(
        "INSERT INTO rooms (id, title, created_by, created_at, visibility, password_hash, expires_at, stage_mode) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(input.id, input.title, input.createdBy, createdAt, dbVisibility(visibility), passwordHash ?? null, expiresAt, stageMode);
      db.query("INSERT INTO room_members (room_id, user_id, role) VALUES (?, ?, 'host')").run(input.id, input.createdBy);
      if (input.actorEmail !== undefined) {
        recordAudit(db, {
          actorId: input.createdBy,
          actorEmail: input.actorEmail,
          action: "room.create",
          targetType: "room",
          targetId: input.id,
          detail: { title: input.title, visibility, expiresAt, stageMode, members: input.members?.length ?? 0 },
        });
      }
      const by = { id: input.createdBy, email: input.actorEmail ?? "" };
      for (const m of input.members ?? []) addRoomMember(db, input.id, m.email, m.role, by);
    })();
  } catch (cause) {
    if (cause instanceof SQLiteError && cause.code === "SQLITE_CONSTRAINT_PRIMARYKEY") {
      throw new RoomExistsError(`createRoom: room ${input.id} already exists`, { cause });
    }
    throw new Error(`createRoom: failed to create room ${input.id}`, { cause });
  }
  const row: RoomRow = {
    id: input.id,
    title: input.title,
    role: "host",
    created_at: createdAt,
    visibility: dbVisibility(visibility),
    has_password: passwordHash !== undefined,
    disabled_at: null,
    expires_at: expiresAt,
    stage_mode: stageMode,
  };
  return toRoomSummary(row, { role: "user" }, createdAt);
}
