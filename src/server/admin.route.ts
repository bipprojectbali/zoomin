import { Elysia, t } from "elysia";
import { SAFE_ID_PATTERN } from "../shared/api.types";
import { listAdminUsers } from "./admin.repository";
import { AdminActionError, banUser, deleteAdminRoom, deleteUser, listAdminRooms, revokeUserSessions, unbanUser } from "./admin.service";
import type { ApiDeps } from "./api.deps";
import { apiError } from "./api.error";
import { authGuard } from "./auth.guard";
import { InvalidCursorError } from "./rooms.repository";

const HTTP_BAD_REQUEST = 400;
const HTTP_NO_CONTENT = 204;
const BAN_REASON_MIN = 3;
const BAN_REASON_MAX = 200;
const BAN_HOURS_MAX = 8760; // 1 tahun

const userParams = t.Object({ id: t.String({ minLength: 1, maxLength: 128 }) });
// limit > batas atas dijepit repository (bukan 400), sama dengan perilaku listRoomsForUser.
const pageQuery = { limit: t.Optional(t.Numeric({ minimum: 1 })), cursor: t.Optional(t.String({ minLength: 1 })) };

type StatusFn = (code: number, body: unknown) => unknown;

/** Petakan error domain ke respons kontrak; error lain diteruskan (500 global). */
function mapError(cause: unknown, status: StatusFn) {
  if (cause instanceof AdminActionError) return status(cause.status, apiError(cause.code, cause.message));
  if (cause instanceof InvalidCursorError) return status(HTTP_BAD_REQUEST, apiError("invalid_input", "invalid cursor", "/cursor"));
  throw cause;
}

/** Route panel admin /api/admin/* (admin+, aturan A5 di admin.service.ts). Kontrak: RND/plan/05-auth-roles.md. */
export function adminRoutes(deps: ApiDeps) {
  return new Elysia({ name: "admin", prefix: "/admin" })
    .use(authGuard(deps))
    .get(
      "/users",
      ({ query, status }) => {
        try {
          const banned = query.banned === undefined ? undefined : query.banned === "true";
          return listAdminUsers(deps.db, { ...query, banned });
        } catch (cause) {
          return mapError(cause, status);
        }
      },
      {
        auth: "admin",
        query: t.Object({
          q: t.Optional(t.String({ maxLength: 200 })),
          role: t.Optional(t.Union([t.Literal("user"), t.Literal("admin"), t.Literal("super_admin")])),
          banned: t.Optional(t.Union([t.Literal("true"), t.Literal("false")])),
          ...pageQuery,
        }),
      },
    )
    .post(
      "/users/:id/ban",
      async ({ user, params, body, status }) => {
        const reason = body.reason.trim();
        if (reason.length < BAN_REASON_MIN || reason.length > BAN_REASON_MAX) {
          return status(HTTP_BAD_REQUEST, apiError("invalid_input", `reason must be ${BAN_REASON_MIN}-${BAN_REASON_MAX} characters`, "/reason"));
        }
        try {
          return { user: await banUser(deps, user, params.id, { reason, expiresInHours: body.expiresInHours }) };
        } catch (cause) {
          return mapError(cause, status);
        }
      },
      {
        auth: "admin",
        params: userParams,
        body: t.Object({
          reason: t.String({ maxLength: 1000 }),
          expiresInHours: t.Optional(t.Number({ exclusiveMinimum: 0, maximum: BAN_HOURS_MAX })),
        }),
      },
    )
    .post(
      "/users/:id/unban",
      async ({ user, params, status }) => {
        try {
          return { user: await unbanUser(deps, user, params.id) };
        } catch (cause) {
          return mapError(cause, status);
        }
      },
      { auth: "admin", params: userParams },
    )
    .delete(
      "/users/:id",
      async ({ user, params, set, status }) => {
        try {
          await deleteUser(deps, user, params.id);
        } catch (cause) {
          return mapError(cause, status);
        }
        set.status = HTTP_NO_CONTENT;
        return null;
      },
      { auth: "admin", params: userParams },
    )
    .post(
      "/users/:id/sessions/revoke",
      async ({ user, params, set, status }) => {
        try {
          await revokeUserSessions(deps, user, params.id);
        } catch (cause) {
          return mapError(cause, status);
        }
        set.status = HTTP_NO_CONTENT;
        return null;
      },
      { auth: "admin", params: userParams },
    )
    .get(
      "/rooms",
      async ({ user, query, status }) => {
        try {
          return await listAdminRooms(deps, user, query);
        } catch (cause) {
          return mapError(cause, status);
        }
      },
      { auth: "admin", query: t.Object(pageQuery) },
    )
    .delete(
      "/rooms/:id",
      async ({ user, params, set, status }) => {
        try {
          await deleteAdminRoom(deps, user, params.id);
        } catch (cause) {
          return mapError(cause, status);
        }
        set.status = HTTP_NO_CONTENT;
        return null;
      },
      { auth: "admin", params: t.Object({ id: t.String({ pattern: SAFE_ID_PATTERN }) }) },
    );
}
