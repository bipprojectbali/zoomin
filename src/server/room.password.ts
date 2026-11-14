import type { Database } from "bun:sqlite";
import type { ApiError, RoomRole } from "../shared/api.types";
import { apiError } from "./api.error";
import { createRateLimiter, type RateLimiter } from "./auth.ratelimit";

/** W5/W6: maks percobaan password per `userId:roomId` per jendela (join + accept undangan berbagi limiter). */
export const ROOM_PASSWORD_ATTEMPTS_MAX = 5;
export const ROOM_PASSWORD_WINDOW_MS = 60 * 1000;

const HTTP_FORBIDDEN = 403;
const HTTP_TOO_MANY_REQUESTS = 429;

/** Limiter percobaan password room; satu instance dibagi room.join.route dan auth.invite.route (api.ts). */
export const createRoomPasswordLimiter = () => createRateLimiter(ROOM_PASSWORD_ATTEMPTS_MAX, ROOM_PASSWORD_WINDOW_MS);

/** Gagal cek password: status + body untuk route; `retryAfter` (detik) diisi untuk 429. */
export type PasswordDenied = { status: 403 | 429; body: ApiError; retryAfter?: number };

/**
 * Cek `password` terhadap hash room (Bun.password.verify). Semua percobaan dihitung per `userId:roomId`; sukses
 * mereset hitungan. Salah → 403 `password_invalid` (pesan seragam), lewat batas → 429. Password tidak pernah di-log.
 */
export async function checkRoomPassword(
  limiter: RateLimiter,
  key: { userId: string; roomId: string },
  hash: string,
  password: string,
): Promise<PasswordDenied | null> {
  const k = `${key.userId}:${key.roomId}`;
  const retryAfter = limiter.retryAfter(k);
  if (retryAfter > 0) {
    return { status: HTTP_TOO_MANY_REQUESTS, body: apiError("rate_limited", `too many password attempts, retry in ${retryAfter}s`), retryAfter };
  }
  limiter.hit(k);
  if (!(await Bun.password.verify(password, hash))) return { status: HTTP_FORBIDDEN, body: apiError("password_invalid", "invalid room password") };
  limiter.reset(k);
  return null;
}

// Upsert membership yang hanya menaikkan role (host > participant > viewer), tidak pernah menurunkan.
const RANK = (col: string) => `(CASE ${col} WHEN 'host' THEN 3 WHEN 'participant' THEN 2 ELSE 1 END)`;
const UPSERT_MEMBER =
  "INSERT INTO room_members (room_id, user_id, role) VALUES (?, ?, ?) " +
  `ON CONFLICT(room_id, user_id) DO UPDATE SET role = excluded.role WHERE ${RANK("excluded.role")} > ${RANK("room_members.role")}`;

/** Jadikan user anggota dengan minimal `role` (accept undangan, join password W3); mengembalikan role efektif. */
export function raiseMembership(db: Database, roomId: string, userId: string, role: RoomRole): RoomRole {
  return db.transaction(() => {
    db.query(UPSERT_MEMBER).run(roomId, userId, role);
    return (
      db.query<{ role: RoomRole }, [string, string]>("SELECT role FROM room_members WHERE room_id = ? AND user_id = ?").get(roomId, userId)
        ?.role ?? role
    );
  })();
}
