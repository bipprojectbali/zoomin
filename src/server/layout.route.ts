import { Elysia, t } from "elysia";
import type { ApiError, LayoutConflictError as LayoutConflictBody, RoomSummary, SessionUser } from "../shared/api.types";
import { LayoutValidationError, parseLayout } from "../shared/layout.model";
import type { ApiDeps } from "./api.deps";
import { apiError } from "./api.error";
import { getSessionState, hasRole, requireRole } from "./auth.guard";
import { getLayout, LayoutConflictError, putLayout } from "./layout.service";
import { canEditStage, getRoomAccess } from "./room.access";

const HTTP_BAD_REQUEST = 400;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;

type Access = { ok: true; user: SessionUser; room: RoomSummary } | { ok: false; status: number; body: ApiError };

/** Sesi + keberadaan room + role member; admin/super_admin global boleh akses walau bukan member (diperlakukan host). */
async function checkAccess(request: Request, deps: ApiDeps, roomId: string): Promise<Access> {
  const access = requireRole(await getSessionState(request, deps), "user");
  if (!access.ok) return access;
  const { user } = access;
  const room = getRoomAccess(deps.db, user, roomId);
  if (!room) return { ok: false, status: HTTP_NOT_FOUND, body: apiError("room_not_found", "room not found") };
  if (!room.role && !hasRole(user, "admin")) return { ok: false, status: HTTP_FORBIDDEN, body: apiError("forbidden", "forbidden") };
  return { ok: true, user, room };
}

/** Plugin route layout (lihat kontrak di src/shared/api.types.ts). */
export function layoutRoutes(deps: ApiDeps) {
  return new Elysia({ name: "layout" })
    .get("/rooms/:roomId/layout", async ({ request, params, status }) => {
      const access = await checkAccess(request, deps, params.roomId);
      if (!access.ok) return status(access.status, access.body);
      return getLayout(deps.db, params.roomId);
    })
    .put(
      "/rooms/:roomId/layout",
      async ({ request, params, body, status }) => {
        const access = await checkAccess(request, deps, params.roomId);
        if (!access.ok) return status(access.status, access.body);
        // S3: pengelola selalu; mode open → juga participant; viewer tidak pernah.
        if (!canEditStage(access.room)) return status(HTTP_FORBIDDEN, apiError("stage_locked", "stage is locked by the room host"));
        let layout;
        try {
          // layout absen -> stringify undefined; "" membuat parseLayout melempar error validasi di path "$".
          layout = parseLayout(JSON.stringify(body.layout) ?? "");
        } catch (e) {
          if (!(e instanceof LayoutValidationError)) throw e;
          return status(HTTP_BAD_REQUEST, apiError("invalid_input", e.message, e.path));
        }
        try {
          return await putLayout(deps, { roomId: params.roomId, baseVersion: body.baseVersion, layout, by: access.user.id });
        } catch (e) {
          if (!(e instanceof LayoutConflictError)) throw e;
          const conflict: LayoutConflictBody = { error: "layout conflict", code: "layout_conflict", currentVersion: e.currentVersion };
          return status(HTTP_CONFLICT, conflict);
        }
      },
      { body: t.Object({ baseVersion: t.Integer({ minimum: 0 }), layout: t.Unknown() }) },
    );
}
