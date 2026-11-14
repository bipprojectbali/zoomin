import { Elysia, t } from "elysia";
import { type AddRoomMemberBody, CREATE_ROOM_MAX_MEMBERS, SAFE_ID_PATTERN } from "../shared/api.types";
import type { ApiDeps } from "./api.deps";
import { apiError } from "./api.error";
import { authGuard, hasRole } from "./auth.guard";
import { getRoomAccess } from "./room.access";
import { checkInviteEmail, memberBodySchema } from "./room.members.route";
import { isValidExpiry } from "./room.service";
import { passwordMissing, passwordSchema, roomsManageRoutes, TITLE_MAX_LENGTH, visibilitySchema } from "./rooms.manage.route";
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
      async ({ user, body, status }) => {
        const { password, ...rest } = body;
        if (body.visibility === "password" && password === undefined) return status(HTTP_BAD_REQUEST, passwordMissing());
        if (body.visibility !== "password" && password !== undefined) {
          return status(HTTP_BAD_REQUEST, apiError("invalid_input", "password only applies to a password room", "/password"));
        }
        if (body.expiresAt !== undefined && !isValidExpiry(body.expiresAt)) {
          return status(HTTP_BAD_REQUEST, apiError("invalid_input", "expiresAt out of range", "/expiresAt"));
        }
        // P5: normalisasi + allowlist sebelum transaksi; email pembuat (sudah host) & duplikat (case-insensitive) diabaikan.
        const members = new Map<string, AddRoomMemberBody>();
        for (const [i, m] of (body.members ?? []).entries()) {
          const checked = checkInviteEmail(deps, m.email);
          if (!checked.ok) return status(HTTP_BAD_REQUEST, apiError(checked.code, checked.error, `/members/${i}/email`));
          if (checked.email !== user.email.toLowerCase() && !members.has(checked.email)) members.set(checked.email, { email: checked.email, role: m.role });
        }
        // Hash di luar transaksi (async); password tidak pernah disimpan/di-log mentah (W2).
        const passwordHash = password === undefined ? undefined : await Bun.password.hash(password);
        try {
          return createRoom(deps.db, { ...rest, passwordHash, members: [...members.values()], createdBy: user.id, actorEmail: user.email });
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
          password: t.Optional(passwordSchema),
          expiresAt: t.Optional(t.Nullable(t.Integer())),
          members: t.Optional(t.Array(memberBodySchema, { maxItems: CREATE_ROOM_MAX_MEMBERS })),
        }),
      },
    );
}
