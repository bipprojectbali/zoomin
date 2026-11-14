import { Elysia, t } from "elysia";
import { type RoomRole, SAFE_ID_PATTERN, type TokenResponse } from "../shared/api.types";
import type { ApiDeps } from "./api.deps";
import { apiError } from "./api.error";
import { authGuard, hasRole } from "./auth.guard";
import { syncRoomLayout } from "./layout.service";
import { getRoomAccess } from "./room.access";
import { createJoinToken } from "./token.service";

const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;

/**
 * Plugin route POST /rooms/:roomId/token. identity = user sesi, role = room_members (admin/super_admin global
 * non-member → host, A7). Body sengaja tidak dibaca: role/identity dari client tidak pernah dipercaya.
 */
export function tokenRoutes(deps: ApiDeps) {
  return new Elysia({ name: "token" }).use(authGuard(deps)).post(
    "/rooms/:roomId/token",
    async ({ user, params: { roomId }, status }) => {
      const room = getRoomAccess(deps.db, user, roomId);
      if (!room) return status(HTTP_NOT_FOUND, apiError("room_not_found", "room not found"));
      const role: RoomRole | null = room.role ?? (hasRole(user, "admin") ? "host" : null);
      if (!role) {
        // W6: room password → UI menampilkan form password lalu POST /rooms/:roomId/join.
        if (room.visibility === "password") return status(HTTP_FORBIDDEN, apiError("password_required", "room password required"));
        return status(HTTP_FORBIDDEN, apiError("forbidden", "not a member of this room"));
      }
      // R5: room nonaktif/kadaluarsa tidak bisa dimasuki siapa pun (admin juga); pengelola mengaktifkan dulu.
      if (room.status === "inactive") return status(HTTP_FORBIDDEN, apiError("room_inactive", "room is inactive"));
      if (room.status === "expired") return status(HTTP_FORBIDDEN, apiError("room_expired", "room has expired"));

      // Siapkan room LiveKit + metadata layout dari SQLite sebelum client join (late joiner langsung dapat layout).
      await syncRoomLayout(deps, roomId);
      const token = await createJoinToken({ room: roomId, identity: user.id, name: user.name, role, image: user.image }, deps.config);
      const res: TokenResponse = { token, url: deps.config.publicLivekitUrl, role };
      return res;
    },
    { auth: "user", params: t.Object({ roomId: t.String({ pattern: SAFE_ID_PATTERN }) }) },
  );
}
