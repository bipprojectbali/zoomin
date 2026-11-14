import type { Database } from "bun:sqlite";
import type { AdminUser, GlobalRole, Page } from "../shared/api.types";
import { toGlobalRole } from "./auth.guard";
import { InvalidCursorError } from "./rooms.repository";

/** Default dan batas atas `limit` GET /api/admin/users. */
export const ADMIN_USERS_PAGE_DEFAULT = 20;
export const ADMIN_USERS_PAGE_MAX = 100;

/** Filter daftar user admin; `banned` = ban yang masih berlaku. */
export type AdminUserQuery = { q?: string; role?: GlobalRole; banned?: boolean; limit?: number; cursor?: string };

// Tanggal di tabel Better Auth = TEXT ISO-8601 UTC (lihat 0002_auth.sql), jadi urutan string = urutan waktu.
type Row = {
  id: string; name: string; email: string; image: string | null; role: string | null; banned: number | null;
  banReason: string | null; banExpires: string | null; createdAt: string; lastActiveAt: string | null;
};

// lastActiveAt = updatedAt sesi terbaru (subquery berindeks session_userId_idx; satu query per halaman, bukan N+1).
// Ban aktif = banned=1 dan (tanpa banExpires atau belum lewat), sama dengan isBanActive di auth.guard.ts.
const SELECT = `
  SELECT u.id, u.name, u.email, u.image, u.role, u.banned, u.banReason, u.banExpires, u.createdAt,
    (SELECT MAX(s.updatedAt) FROM "session" s WHERE s.userId = u.id) AS lastActiveAt
  FROM "user" u`;
const BAN_ACTIVE = `(u.banned = 1 AND (u.banExpires IS NULL OR u.banExpires > ?2))`;

const ms = (iso: string | null) => (iso ? Date.parse(iso) : null);

function toAdminUser(r: Row, now: number): AdminUser {
  const banExpires = ms(r.banExpires);
  const banned = r.banned === 1 && (banExpires === null || banExpires > now);
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    image: r.image,
    role: toGlobalRole(r.role),
    banned,
    banReason: banned ? r.banReason : null,
    banExpires: banned ? banExpires : null,
    createdAt: Date.parse(r.createdAt),
    lastActiveAt: ms(r.lastActiveAt),
  };
}

// Cursor opaque: base64url("createdAtISO|id"); ISO dan id Better Auth tidak memuat "|".
const encodeCursor = (r: Pick<Row, "createdAt" | "id">) => Buffer.from(`${r.createdAt}|${r.id}`).toString("base64url");

function decodeCursor(cursor: string): { createdAt: string; id: string } {
  const [createdAt, id, extra] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
  if (!createdAt || !id || extra !== undefined || Number.isNaN(Date.parse(createdAt))) {
    throw new InvalidCursorError(`listAdminUsers: invalid cursor (${JSON.stringify(cursor)})`);
  }
  return { createdAt, id };
}

/** Satu user untuk panel admin; null bila tidak ada. */
export function getAdminUser(db: Database, id: string, now = Date.now()): AdminUser | null {
  const row = db.query<Row, [string]>(`${SELECT} WHERE u.id = ?1`).get(id);
  return row ? toAdminUser(row, now) : null;
}

/** Satu halaman user terbaru dulu (keyset createdAt,id) dengan filter q (nama/email), role, banned. */
export function listAdminUsers(db: Database, opts: AdminUserQuery = {}, now = Date.now()): Page<AdminUser> {
  const limit = Math.min(Math.max(opts.limit ?? ADMIN_USERS_PAGE_DEFAULT, 1), ADMIN_USERS_PAGE_MAX);
  const after = opts.cursor ? decodeCursor(opts.cursor) : null;
  // LIKE dengan ESCAPE agar % dan _ di input dicari literal.
  const q = opts.q?.trim() ? `%${opts.q.trim().toLowerCase().replace(/[\\%_]/g, "\\$&")}%` : null;
  const banned = opts.banned === undefined ? null : opts.banned ? 1 : 0;
  const rows = db
    .query<Row, [string | null, string, string | null, number | null, string | null, string | null, number]>(
      `${SELECT}
       WHERE (?1 IS NULL OR lower(u.name) LIKE ?1 ESCAPE '\\' OR lower(u.email) LIKE ?1 ESCAPE '\\')
         AND (?3 IS NULL OR COALESCE(u.role, 'user') = ?3)
         AND (?4 IS NULL OR ${BAN_ACTIVE} = ?4)
         AND (?5 IS NULL OR u.createdAt < ?5 OR (u.createdAt = ?5 AND u.id < ?6))
       ORDER BY u.createdAt DESC, u.id DESC LIMIT ?7`,
    )
    .all(q, new Date(now).toISOString(), opts.role ?? null, banned, after?.createdAt ?? null, after?.id ?? null, limit + 1);
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return { items: page.map((r) => toAdminUser(r, now)), nextCursor: rows.length > limit && last ? encodeCursor(last) : null };
}

/** Jumlah member per room untuk satu halaman (satu query GROUP BY, bukan per room). */
export function countMembers(db: Database, roomIds: readonly string[]): Map<string, number> {
  if (roomIds.length === 0) return new Map();
  const rows = db
    .query<{ room_id: string; n: number }, string[]>(
      `SELECT room_id, COUNT(*) AS n FROM room_members WHERE room_id IN (${roomIds.map(() => "?").join(",")}) GROUP BY room_id`,
    )
    .all(...roomIds);
  return new Map(rows.map((r) => [r.room_id, r.n]));
}
