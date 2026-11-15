import { Elysia, t } from "elysia";
import { SAFE_ID_PATTERN } from "../shared/api.types";
import type { ApiDeps } from "./api.deps";
import { apiError } from "./api.error";
import { authGuard } from "./auth.guard";
import { setStageMode } from "./layout.service";
import { getRoomAccess } from "./room.access";
import type { StageRequestStore } from "./stage.requests.store";

const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;

/** Skema StageMode (PUT stage-mode, POST/PATCH rooms). */
export const stageModeSchema = t.Union([t.Literal("host"), t.Literal("request"), t.Literal("open")]);

/** PUT /rooms/:roomId/stage-mode (S1): pengelola room; audit + siaran envelope di setStageMode. `stageRequests` = store bersama (api.ts). */
export function stageModeRoutes(deps: ApiDeps, stageRequests: StageRequestStore) {
  return new Elysia({ name: "stage.mode" }).use(authGuard(deps)).put(
    "/rooms/:roomId/stage-mode",
    async ({ user, params: { roomId }, body, status }) => {
      const room = getRoomAccess(deps.db, user, roomId);
      if (!room) return status(HTTP_NOT_FOUND, apiError("room_not_found", "room not found"));
      if (!room.canManage) return status(HTTP_FORBIDDEN, apiError("forbidden", "room manager only"));
      await setStageMode(deps, user, roomId, body.mode);
      // Keluar dari mode request → pending dibatalkan (event canceled, best effort).
      if (body.mode !== "request") stageRequests.cancelAll(roomId);
      return { ...room, stageMode: body.mode };
    },
    { auth: "user", params: t.Object({ roomId: t.String({ pattern: SAFE_ID_PATTERN }) }), body: t.Object({ mode: stageModeSchema }) },
  );
}
