import { Elysia, t } from "elysia";
import { type RoomRole, SAFE_ID_PATTERN, type TokenResponse } from "../shared/api.types";
import type { ApiDeps } from "./api.deps";
import { apiError } from "./api.error";
import { authGuard, hasRole } from "./auth.guard";
import { syncRoomLayout } from "./layout.service";
import { getMembership, roomExists } from "./rooms.repository";
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
      if (!roomExists(deps.db, roomId)) return status(HTTP_NOT_FOUND, apiError("room_not_found", "room not found"));
      const role: RoomRole | null = getMembership(deps.db, roomId, user.id) ?? (hasRole(user, "admin") ? "host" : null);
      if (!role) return status(HTTP_FORBIDDEN, apiError("forbidden", "not a member of this room"));

      // Siapkan room LiveKit + metadata layout dari SQLite sebelum client join (late joiner langsung dapat layout).
      await syncRoomLayout(deps, roomId);
      const token = await createJoinToken({ room: roomId, identity: user.id, name: user.name, role }, deps.config);
      const res: TokenResponse = { token, url: deps.config.publicLivekitUrl, role };
      return res;
    },
    { auth: "user", params: t.Object({ roomId: t.String({ pattern: SAFE_ID_PATTERN }) }) },
  );
}
