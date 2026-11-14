import { Elysia, t } from "elysia";
import { type JoinRoomResponse, ROOM_PASSWORD_MAX, SAFE_ID_PATTERN } from "../shared/api.types";
import type { ApiDeps } from "./api.deps";
import { apiError } from "./api.error";
import { authGuard, hasRole } from "./auth.guard";
import type { RateLimiter } from "./auth.ratelimit";
import { getRoomAccess } from "./room.access";
import { checkRoomPassword, createRoomPasswordLimiter, raiseMembership } from "./room.password";

const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;

/** Hash password room; hanya dibaca di sini dan di auth.invite.route.ts, tidak pernah dikembalikan (W7). */
export const getRoomPasswordHash = (db: ApiDeps["db"], roomId: string): string | null =>
  db.query<{ password_hash: string | null }, [string]>("SELECT password_hash FROM rooms WHERE id = ?").get(roomId)?.password_hash ?? null;

/**
 * POST /rooms/:roomId/join (W5): masuk room ber-password lewat ID room. Anggota/admin+ tidak ditanya (role efektif
 * langsung). Sukses → anggota permanen `participant` (UPSERT hanya menaikkan role, W3). Bukan aksi admin → tanpa audit.
 */
export function roomJoinRoutes(deps: ApiDeps, limiter: RateLimiter = createRoomPasswordLimiter()) {
  return new Elysia({ name: "room.join" }).use(authGuard(deps)).post(
    "/rooms/:roomId/join",
    async ({ user, params: { roomId }, body, set, status }) => {
      const room = getRoomAccess(deps.db, user, roomId);
      if (!room) return status(HTTP_NOT_FOUND, apiError("room_not_found", "room not found"));
      if (room.status === "inactive") return status(HTTP_FORBIDDEN, apiError("room_inactive", "room is inactive"));
      if (room.status === "expired") return status(HTTP_FORBIDDEN, apiError("room_expired", "room has expired"));
      const known = room.role ?? (hasRole(user, "admin") ? "host" : null);
      if (known) return { roomId, role: known } satisfies JoinRoomResponse;
      if (room.visibility === "private") return status(HTTP_FORBIDDEN, apiError("room_private", "room is private"));
      const hash = room.visibility === "password" ? getRoomPasswordHash(deps.db, roomId) : null;
      if (!hash) return status(HTTP_FORBIDDEN, apiError("forbidden", "room has no password: use an invite link"));
      const denied = await checkRoomPassword(limiter, { userId: user.id, roomId }, hash, body.password);
      if (denied) {
        if (denied.retryAfter) set.headers["retry-after"] = String(denied.retryAfter);
        return status(denied.status, denied.body);
      }
      return { roomId, role: raiseMembership(deps.db, roomId, user.id, "participant") } satisfies JoinRoomResponse;
    },
    {
      auth: "user",
      params: t.Object({ roomId: t.String({ pattern: SAFE_ID_PATTERN }) }),
      // Tanpa minLength: password terlalu pendek = salah (403 seragam), bukan petunjuk validasi.
      body: t.Object({ password: t.String({ maxLength: ROOM_PASSWORD_MAX }) }),
    },
  );
}
