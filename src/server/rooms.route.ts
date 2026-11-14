import { Elysia, t } from "elysia";
import { SAFE_ID_PATTERN, type ApiError } from "../shared/api.types";
import type { ApiDeps } from "./api.deps";
import { getSessionUser } from "./auth.session";
import { createRoom, InvalidCursorError, listRoomsForUser, RoomExistsError, ROOMS_PAGE_MAX } from "./rooms.repository";

const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_CONFLICT = 409;
const TITLE_MAX_LENGTH = 100;

const err = (error: string, path?: string): ApiError => (path ? { error, path } : { error });

/** Plugin route GET/POST /rooms (kontrak di src/shared/api.types.ts). */
export function roomsRoutes(deps: ApiDeps) {
  return new Elysia({ name: "rooms" })
    .get(
      "/rooms",
      ({ request, query, status }) => {
        const user = getSessionUser(request, deps.db, deps.config.sessionSecret);
        if (!user) return status(HTTP_UNAUTHORIZED, err("unauthorized"));
        try {
          return listRoomsForUser(deps.db, user, query);
        } catch (cause) {
          if (cause instanceof InvalidCursorError) return status(HTTP_BAD_REQUEST, err("invalid cursor", "/cursor"));
          throw cause;
        }
      },
      {
        query: t.Object({
          limit: t.Optional(t.Numeric({ minimum: 1, maximum: ROOMS_PAGE_MAX })),
          cursor: t.Optional(t.String({ minLength: 1 })),
        }),
      },
    )
    .post(
      "/rooms",
      ({ request, body, status }) => {
        const user = getSessionUser(request, deps.db, deps.config.sessionSecret);
        if (!user) return status(HTTP_UNAUTHORIZED, err("unauthorized"));
        if (!user.isAdmin) return status(HTTP_FORBIDDEN, err("admin only"));
        try {
          return createRoom(deps.db, { id: body.id, title: body.title, createdBy: user.id });
        } catch (cause) {
          if (cause instanceof RoomExistsError) return status(HTTP_CONFLICT, err("room already exists", "/id"));
          throw cause;
        }
      },
      {
        body: t.Object({
          id: t.String({ pattern: SAFE_ID_PATTERN }),
          title: t.String({ minLength: 1, maxLength: TITLE_MAX_LENGTH }),
        }),
      },
    );
}
