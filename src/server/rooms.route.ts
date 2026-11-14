import { Elysia, t } from "elysia";
import { SAFE_ID_PATTERN } from "../shared/api.types";
import type { ApiDeps } from "./api.deps";
import { apiError } from "./api.error";
import { authGuard, hasRole } from "./auth.guard";
import { getRoomAccess } from "./room.access";
import { isValidExpiry } from "./room.service";
import { roomsManageRoutes, TITLE_MAX_LENGTH, visibilitySchema } from "./rooms.manage.route";
import { createRoom, InvalidCursorError, listRoomsForUser, RoomExistsError, ROOMS_PAGE_MAX } from "./rooms.repository";

const HTTP_BAD_REQUEST = 400;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;

/** Plugin route GET/POST /rooms, GET /rooms/:roomId, + PATCH/DELETE (rooms.manage.route.ts). Kontrak: src/shared/api.types.ts. */
export function roomsRoutes(deps: ApiDeps) {
  return new Elysia({ name: "rooms" })
    .use(authGuard(deps))
    .use(roomsManageRoutes(deps))
    .get(
      "/rooms",
      ({ user, query, status }) => {
        try {
          return listRoomsForUser(deps.db, user, query);
        } catch (cause) {
          if (cause instanceof InvalidCursorError) return status(HTTP_BAD_REQUEST, apiError("invalid_input", "invalid cursor", "/cursor"));
          throw cause;
        }
      },
      {
        auth: "user",
        query: t.Object({
          limit: t.Optional(t.Numeric({ minimum: 1, maximum: ROOMS_PAGE_MAX })),
          cursor: t.Optional(t.String({ minLength: 1 })),
        }),
      },
    )
    .get(
      "/rooms/:roomId",
      ({ user, params: { roomId }, status }) => {
        const room = getRoomAccess(deps.db, user, roomId);
        if (!room) return status(HTTP_NOT_FOUND, apiError("room_not_found", "room not found"));
        if (!room.role && !hasRole(user, "admin")) return status(HTTP_FORBIDDEN, apiError("forbidden", "not a member of this room"));
        return room;
      },
      { auth: "user", params: t.Object({ roomId: t.String({ pattern: SAFE_ID_PATTERN }) }) },
    )
    .post(
      "/rooms",
      // A7: hanya admin/super_admin global yang boleh membuat room; pembuat jadi host. A8: audit room.create (atomik di repository).
      ({ user, body, status }) => {
        if (body.expiresAt !== undefined && !isValidExpiry(body.expiresAt)) {
          return status(HTTP_BAD_REQUEST, apiError("invalid_input", "expiresAt out of range", "/expiresAt"));
        }
        try {
          return createRoom(deps.db, { ...body, createdBy: user.id, actorEmail: user.email });
        } catch (cause) {
          if (cause instanceof RoomExistsError) return status(HTTP_CONFLICT, apiError("room_exists", "room already exists", "/id"));
          throw cause;
        }
      },
      {
        auth: "admin",
        body: t.Object({
          id: t.String({ pattern: SAFE_ID_PATTERN }),
          title: t.String({ minLength: 1, maxLength: TITLE_MAX_LENGTH }),
          visibility: t.Optional(visibilitySchema),
          expiresAt: t.Optional(t.Nullable(t.Integer())),
        }),
      },
    );
}
