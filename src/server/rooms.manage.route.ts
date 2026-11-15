import { Elysia, t } from "elysia";
import { ROOM_PASSWORD_MAX, ROOM_PASSWORD_MIN, SAFE_ID_PATTERN } from "../shared/api.types";
import type { ApiDeps } from "./api.deps";
import { apiError } from "./api.error";
import { authGuard } from "./auth.guard";
import { getRoomAccess } from "./room.access";
import { publishRoomStage } from "./layout.service";
import { deleteRoom, isValidExpiry, updateRoom } from "./room.service";
import { stageModeSchema } from "./stage.mode.route";
import type { StageRequestStore } from "./stage.requests.store";

const HTTP_BAD_REQUEST = 400;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_NO_CONTENT = 204;
/** Panjang maksimum judul room (POST & PATCH). */
export const TITLE_MAX_LENGTH = 100;
/** Skema RoomVisibility. */
export const visibilitySchema = t.Union([t.Literal("public"), t.Literal("password"), t.Literal("private")]);
/** Skema password room (W2): 6–64 karakter, tanpa trim. */
export const passwordSchema = t.String({ minLength: ROOM_PASSWORD_MIN, maxLength: ROOM_PASSWORD_MAX });
/** 400 untuk room tipe password tanpa password (W7). */
export const passwordMissing = () => apiError("invalid_input", "password is required for a password room", "/password");

const params = t.Object({ roomId: t.String({ pattern: SAFE_ID_PATTERN }) });

/** PATCH/DELETE /rooms/:roomId: hanya pengelola room (R3, host room atau admin+); audit di room.service.ts. */
export function roomsManageRoutes(deps: ApiDeps, stageRequests: StageRequestStore) {
  // 404 bila room tidak ada, 403 bila bukan pengelola; selain itu room (pemanggil = pengelola).
  const deny = (user: Parameters<typeof getRoomAccess>[1], roomId: string) => {
    const room = getRoomAccess(deps.db, user, roomId);
    if (!room) return { ok: false, code: HTTP_NOT_FOUND, body: apiError("room_not_found", "room not found") } as const;
    if (!room.canManage) return { ok: false, code: HTTP_FORBIDDEN, body: apiError("forbidden", "room manager only") } as const;
    return { ok: true, room } as const;
  };

  return new Elysia({ name: "rooms.manage" })
    .use(authGuard(deps))
    .patch(
      "/rooms/:roomId",
      async ({ user, params: { roomId }, body, status }) => {
        const access = deny(user, roomId);
        if (!access.ok) return status(access.code, access.body);
        const title = body.title?.trim();
        if (title !== undefined && title.length === 0) return status(HTTP_BAD_REQUEST, apiError("invalid_input", "title must not be empty", "/title"));
        if (body.expiresAt !== undefined && !isValidExpiry(body.expiresAt)) {
          return status(HTTP_BAD_REQUEST, apiError("invalid_input", "expiresAt out of range", "/expiresAt"));
        }
        const { password, ...rest } = body;
        if (password !== undefined && (body.visibility ?? access.room.visibility) !== "password") {
          return status(HTTP_BAD_REQUEST, apiError("invalid_input", "password only applies to a password room", "/password"));
        }
        // Hash di luar transaksi (async); password tidak pernah disimpan/di-log mentah (W2).
        const passwordHash = password === undefined ? undefined : await Bun.password.hash(password);
        const result = await updateRoom(deps, user, roomId, { ...rest, title }, passwordHash);
        if (result === "password_missing") return status(HTTP_BAD_REQUEST, passwordMissing());
        // S1: stageMode sudah ditulis atomik di updateRoom; siaran envelope + batal request pending setelah commit.
        if (result === "ok" && body.stageMode !== undefined) {
          if (body.stageMode !== "request") stageRequests.cancelAll(roomId);
          await publishRoomStage(deps, roomId);
        }
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
          password: t.Optional(passwordSchema),
          enabled: t.Optional(t.Boolean()),
          expiresAt: t.Optional(t.Nullable(t.Integer())),
          stageMode: t.Optional(stageModeSchema),
        }),
      },
    )
    .delete(
      "/rooms/:roomId",
      async ({ user, params: { roomId }, set, status }) => {
        const access = deny(user, roomId);
        if (!access.ok) return status(access.code, access.body);
        if (!(await deleteRoom(deps, user, roomId))) return status(HTTP_NOT_FOUND, apiError("room_not_found", "room not found"));
        set.status = HTTP_NO_CONTENT;
        return null;
      },
      { auth: "user", params },
    );
}
