import type { Database } from "bun:sqlite";
import { Elysia, t } from "elysia";
import type { ApiError, LayoutConflictError as LayoutConflictBody, Role, SessionUser } from "../shared/api.types";
import { LayoutValidationError, parseLayout } from "../shared/layout.model";
import type { ApiDeps } from "./api.deps";
import { getSessionUser } from "./auth.session";
import { getLayout, LayoutConflictError, putLayout } from "./layout.service";

const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;

type Access = { ok: true; user: SessionUser; role: Role | null } | { ok: false; status: number; body: ApiError };

/** Sesi + keberadaan room + role member; admin global boleh akses walau bukan member (role null). */
function checkAccess(request: Request, db: Database, secret: string, roomId: string): Access {
  const user = getSessionUser(request, db, secret);
  if (!user) return { ok: false, status: HTTP_UNAUTHORIZED, body: { error: "unauthorized" } };
  const row = db
    .query<{ role: Role | null }, [string, string]>(
      "SELECT m.role AS role FROM rooms r LEFT JOIN room_members m ON m.room_id = r.id AND m.user_id = ? WHERE r.id = ?",
    )
    .get(user.id, roomId);
  if (!row) return { ok: false, status: HTTP_NOT_FOUND, body: { error: "room not found" } };
  if (!row.role && !user.isAdmin) return { ok: false, status: HTTP_FORBIDDEN, body: { error: "forbidden" } };
  return { ok: true, user, role: row.role };
}

/** Plugin route layout (lihat kontrak di src/shared/api.types.ts). */
export function layoutRoutes(deps: ApiDeps) {
  const secret = deps.config.sessionSecret;
  return new Elysia({ name: "layout" })
    .get("/rooms/:roomId/layout", ({ request, params, status }) => {
      const access = checkAccess(request, deps.db, secret, params.roomId);
      if (!access.ok) return status(access.status, access.body);
      return getLayout(deps.db, params.roomId);
    })
    .put(
      "/rooms/:roomId/layout",
      async ({ request, params, body, status }) => {
        const access = checkAccess(request, deps.db, secret, params.roomId);
        if (!access.ok) return status(access.status, access.body);
        if (access.role !== "admin" && !access.user.isAdmin) {
          return status(HTTP_FORBIDDEN, { error: "hanya admin room yang boleh mengubah layout" } satisfies ApiError);
        }
        let layout;
        try {
          // layout absen -> stringify undefined; "" membuat parseLayout melempar error validasi di path "$".
          layout = parseLayout(JSON.stringify(body.layout) ?? "");
        } catch (e) {
          if (!(e instanceof LayoutValidationError)) throw e;
          return status(HTTP_BAD_REQUEST, { error: e.message, path: e.path } satisfies ApiError);
        }
        try {
          return await putLayout(deps, { roomId: params.roomId, baseVersion: body.baseVersion, layout, by: access.user.id });
        } catch (e) {
          if (!(e instanceof LayoutConflictError)) throw e;
          const conflict: LayoutConflictBody = { error: "layout conflict", currentVersion: e.currentVersion };
          return status(HTTP_CONFLICT, conflict);
        }
      },
      { body: t.Object({ baseVersion: t.Integer({ minimum: 0 }), layout: t.Unknown() }) },
    );
}
