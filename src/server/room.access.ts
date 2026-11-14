import type { Database } from "bun:sqlite";
import type { RoomRole, RoomStatus, RoomSummary, RoomVisibility, SessionUser } from "../shared/api.types";
import { hasRole } from "./auth.guard";

/** Kolom rooms yang dibutuhkan RoomSummary; dipakai bersama query daftar di rooms.repository.ts (alias r, m). */
export const ROOM_COLUMNS = "r.id, r.title, m.role, r.created_at, r.visibility, r.disabled_at, r.expires_at";

/** Baris hasil ROOM_COLUMNS. */
export type RoomRow = {
  id: string;
  title: string;
  role: RoomRole | null;
  created_at: number;
  visibility: RoomVisibility;
  disabled_at: number | null;
  expires_at: number | null;
};

/** Status turunan (R5): inactive bila dinonaktifkan, else expired bila expires_at <= now, else active. */
export function roomStatus(row: Pick<RoomRow, "disabled_at" | "expires_at">, now = Date.now()): RoomStatus {
  if (row.disabled_at !== null) return "inactive";
  if (row.expires_at !== null && row.expires_at <= now) return "expired";
  return "active";
}

/** Baris → RoomSummary untuk `user` (canManage = host room atau admin+ global, R3). */
export function toRoomSummary(row: RoomRow, user: Pick<SessionUser, "role">, now = Date.now()): RoomSummary {
  return {
    id: row.id,
    title: row.title,
    role: row.role,
    createdAt: row.created_at,
    visibility: row.visibility,
    status: roomStatus(row, now),
    expiresAt: row.expires_at,
    canManage: row.role === "host" || hasRole(user, "admin"),
  };
}

/** Room beserta role & hak kelola `user`; null bila room tidak ada. Hak akses lihat/masuk diputuskan pemanggil. */
export function getRoomAccess(db: Database, user: Pick<SessionUser, "id" | "role">, roomId: string): RoomSummary | null {
  const row = db
    .query<RoomRow, [string, string]>(
      `SELECT ${ROOM_COLUMNS} FROM rooms r LEFT JOIN room_members m ON m.room_id = r.id AND m.user_id = ? WHERE r.id = ?`,
    )
    .get(user.id, roomId);
  return row ? toRoomSummary(row, user) : null;
}

/**
 * Pengelola room (R3): admin/super_admin global, atau anggota ber-role host. Tidak mengecek keberadaan room
 * (admin+ → true untuk id apa pun); route memeriksa 404 `room_not_found` lebih dulu.
 */
export function canManageRoom(db: Database, user: Pick<SessionUser, "id" | "role">, roomId: string): boolean {
  if (hasRole(user, "admin")) return true;
  const row = db
    .query<{ role: RoomRole }, [string, string]>("SELECT role FROM room_members WHERE room_id = ? AND user_id = ?")
    .get(roomId, user.id);
  return row?.role === "host";
}
