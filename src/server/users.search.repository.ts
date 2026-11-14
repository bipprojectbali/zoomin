import type { Database } from "bun:sqlite";
import type { UserSearchItem } from "../shared/api.types";

/** Default `limit` GET /api/users/search (batas atas: USER_SEARCH_MAX_RESULTS di api.types.ts). */
export const USER_SEARCH_DEFAULT_RESULTS = 20;

/** true bila user menjadi host di minimal satu room (syarat akses pencarian akun, P4). */
export function isHostAnywhere(db: Database, userId: string): boolean {
  return db.query<{ one: number }, [string]>("SELECT 1 AS one FROM room_members WHERE user_id = ? AND role = 'host' LIMIT 1").get(userId) !== null;
}

/**
 * Akun yang nama/email-nya memuat `q` (case-insensitive; % dan _ dicari literal), tanpa user yang ban-nya masih
 * berlaku (aturan sama dengan isBanActive di auth.guard.ts), urut nama. `q` kosong → pola `%%` = semua akun.
 * Tanggal Better Auth = TEXT ISO-8601 UTC.
 */
export function searchUsers(db: Database, q: string, limit: number, now = Date.now()): UserSearchItem[] {
  const pattern = `%${q.toLowerCase().replace(/[\\%_]/g, "\\$&")}%`;
  return db
    .query<UserSearchItem, [string, string, number]>(
      `SELECT u.id, u.name, u.email, u.image FROM "user" u
       WHERE (lower(u.name) LIKE ?1 ESCAPE '\\' OR lower(u.email) LIKE ?1 ESCAPE '\\')
         AND NOT (COALESCE(u.banned, 0) = 1 AND (u.banExpires IS NULL OR u.banExpires > ?2))
       ORDER BY u.name COLLATE NOCASE, u.id LIMIT ?3`,
    )
    .all(pattern, new Date(now).toISOString(), limit);
}
