import { Elysia, t } from "elysia";
import { SAFE_ID_PATTERN, type ApiError, type Role, type TokenResponse } from "../shared/api.types";
import type { ApiDeps } from "./api.deps";
import { getSessionUser } from "./auth.session";
import { syncRoomLayout } from "./layout.service";
import { getMembership, roomExists } from "./rooms.repository";
import { createJoinToken } from "./token.service";

const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;

const err = (error: string): ApiError => ({ error });

/**
 * Plugin route POST /rooms/:roomId/token. identity = user sesi, role = room_members (admin global non-member →
 * admin). Body sengaja tidak dibaca: role/identity dari client tidak pernah dipercaya.
 */
export function tokenRoutes(deps: ApiDeps) {
  return new Elysia({ name: "token" }).post(
    "/rooms/:roomId/token",
    async ({ request, params: { roomId }, status }) => {
      const user = getSessionUser(request, deps.db, deps.config.sessionSecret);
      if (!user) return status(HTTP_UNAUTHORIZED, err("unauthorized"));
      if (!roomExists(deps.db, roomId)) return status(HTTP_NOT_FOUND, err("room not found"));
      const role: Role | null = getMembership(deps.db, roomId, user.id) ?? (user.isAdmin ? "admin" : null);
      if (!role) return status(HTTP_FORBIDDEN, err("not a member of this room"));

      // Siapkan room LiveKit + metadata layout dari SQLite sebelum client join (late joiner langsung dapat layout).
      await syncRoomLayout(deps, roomId);
      const token = await createJoinToken({ room: roomId, identity: user.id, name: user.name, role }, deps.config);
      const res: TokenResponse = { token, url: deps.config.publicLivekitUrl, role };
      return res;
    },
    { params: t.Object({ roomId: t.String({ pattern: SAFE_ID_PATTERN }) }) },
  );
}
