import { Elysia, t } from "elysia";
import { SAFE_ID_PATTERN } from "../shared/api.types";
import type { ApiDeps } from "./api.deps";
import { apiError } from "./api.error";
import { authGuard } from "./auth.guard";
import { getRoomAccess } from "./room.access";
import { deleteRoom, isValidExpiry, updateRoom } from "./room.service";

const HTTP_BAD_REQUEST = 400;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_NO_CONTENT = 204;
/** Panjang maksimum judul room (POST & PATCH). */
export const TITLE_MAX_LENGTH = 100;
/** Skema RoomVisibility. */
export const visibilitySchema = t.Union([t.Literal("public"), t.Literal("private")]);

const params = t.Object({ roomId: t.String({ pattern: SAFE_ID_PATTERN }) });

/** PATCH/DELETE /rooms/:roomId: hanya pengelola room (R3, host room atau admin+); audit di room.service.ts. */
export function roomsManageRoutes(deps: ApiDeps) {
  // 404 bila room tidak ada, 403 bila bukan pengelola; null = boleh lanjut.
  const deny = (user: Parameters<typeof getRoomAccess>[1], roomId: string) => {
    const room = getRoomAccess(deps.db, user, roomId);
    if (!room) return { code: HTTP_NOT_FOUND, body: apiError("room_not_found", "room not found") };
    if (!room.canManage) return { code: HTTP_FORBIDDEN, body: apiError("forbidden", "room manager only") };
    return null;
  };

  return new Elysia({ name: "rooms.manage" })
    .use(authGuard(deps))
    .patch(
      "/rooms/:roomId",
      async ({ user, params: { roomId }, body, status }) => {
        const denied = deny(user, roomId);
        if (denied) return status(denied.code, denied.body);
        const title = body.title?.trim();
        if (title !== undefined && title.length === 0) return status(HTTP_BAD_REQUEST, apiError("invalid_input", "title must not be empty", "/title"));
        if (body.expiresAt !== undefined && !isValidExpiry(body.expiresAt)) {
          return status(HTTP_BAD_REQUEST, apiError("invalid_input", "expiresAt out of range", "/expiresAt"));
        }
        await updateRoom(deps, user, roomId, { ...body, title });
        const room = getRoomAccess(deps.db, user, roomId);
        if (!room) return status(HTTP_NOT_FOUND, apiError("room_not_found", "room not found")); // dihapus bersamaan
        return room;
      },
      {
        auth: "user",
        params,
        body: t.Object({
          title: t.Optional(t.String({ maxLength: TITLE_MAX_LENGTH })),
          visibility: t.Optional(visibilitySchema),
          enabled: t.Optional(t.Boolean()),
          expiresAt: t.Optional(t.Nullable(t.Integer())),
        }),
      },
    )
    .delete(
      "/rooms/:roomId",
      async ({ user, params: { roomId }, set, status }) => {
        const denied = deny(user, roomId);
        if (denied) return status(denied.code, denied.body);
        if (!(await deleteRoom(deps, user, roomId))) return status(HTTP_NOT_FOUND, apiError("room_not_found", "room not found"));
        set.status = HTTP_NO_CONTENT;
        return null;
      },
      { auth: "user", params },
    );
}
