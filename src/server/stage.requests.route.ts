import { Elysia, t } from "elysia";
import { SAFE_ID_PATTERN, type SessionUser, type StageRequest } from "../shared/api.types";
import { parseTrackName } from "../shared/track.naming";
import type { ApiDeps } from "./api.deps";
import { apiError } from "./api.error";
import { authGuard, hasRole } from "./auth.guard";
import { recordAudit } from "./audit.repository";
import { createRateLimiter } from "./auth.ratelimit";
import { getRoomAccess } from "./room.access";
import { notifyStage } from "./stage.notify";
import type { StageRequestStore } from "./stage.requests.store";

/** S4: maks request stage per `userId:roomId` per jendela. */
export const STAGE_REQUESTS_MAX = 5;
export const STAGE_REQUESTS_WINDOW_MS = 60 * 1000;

const HTTP_BAD_REQUEST = 400;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_NO_CONTENT = 204;

const roomParams = t.Object({ roomId: t.String({ pattern: SAFE_ID_PATTERN }) });
const requestParams = t.Object({ roomId: t.String({ pattern: SAFE_ID_PATTERN }), id: t.String({ minLength: 1, maxLength: 64 }) });
const notFound = () => apiError("stage_request_not_found", "stage request not found or expired");

/** Request stage (S4/S5): participant meminta layarnya tampil, pengelola approve/deny; event lewat data channel. */
export function stageRequestsRoutes(deps: ApiDeps, store: StageRequestStore) {
  const limiter = createRateLimiter(STAGE_REQUESTS_MAX, STAGE_REQUESTS_WINDOW_MS);

  // 404 bila room tidak ada; selain itu room + role efektif (admin+ global non-member → host).
  const roomOf = (user: SessionUser, roomId: string) => {
    const room = getRoomAccess(deps.db, user, roomId);
    if (!room) return null;
    return { ...room, role: room.role ?? (hasRole(user, "admin") ? "host" : null) };
  };

  // Pengelola: approve/deny → hapus dari store, audit, event resolved (via onResolved). null = sukses.
  const decide = (user: SessionUser, roomId: string, id: string, decision: "approved" | "denied") => {
    const room = roomOf(user, roomId);
    if (!room) return { code: HTTP_NOT_FOUND, body: apiError("room_not_found", "room not found") };
    if (!room.canManage) return { code: HTTP_FORBIDDEN, body: apiError("forbidden", "room manager only") };
    const done = store.resolve(roomId, id, decision);
    if (!done) return { code: HTTP_NOT_FOUND, body: notFound() };
    const detail = { action: done.action, decision };
    recordAudit(deps.db, { actorId: user.id, actorEmail: user.email, action: "room.stage_request", targetType: "room", targetId: roomId, detail });
    return null;
  };
  return new Elysia({ name: "stage.requests" })
    .use(authGuard(deps))
    .post(
      "/rooms/:roomId/stage-requests",
      async ({ user, params: { roomId }, body, set, status }) => {
        const room = roomOf(user, roomId);
        if (!room) return status(HTTP_NOT_FOUND, apiError("room_not_found", "room not found"));
        if (room.role !== "host" && room.role !== "participant") return status(HTTP_FORBIDDEN, apiError("forbidden", "participants only"));
        if (room.stageMode !== "request") return status(HTTP_CONFLICT, apiError("stage_mode_mismatch", "room is not in request mode"));
        const key = `${user.id}:${roomId}`;
        const retryAfter = limiter.retryAfter(key);
        if (retryAfter > 0) {
          set.headers["retry-after"] = String(retryAfter);
          return status(HTTP_TOO_MANY_REQUESTS, apiError("rate_limited", `too many stage requests, retry in ${retryAfter}s`));
        }
        limiter.hit(key);
        // identity = user.id: request selalu untuk track milik pemanggil sendiri, jadi cukup cek nama layar.
        if (parseTrackName(body.trackName)?.kind !== "screen") {
          return status(HTTP_BAD_REQUEST, apiError("invalid_input", "trackName must be a screen share track", "/trackName"));
        }
        const request: StageRequest = store.add({ roomId, userId: user.id, userName: user.name, trackName: body.trackName, action: body.action });
        await notifyStage(deps, { type: "request.created", request });
        return request;
      },
      {
        auth: "user",
        params: roomParams,
        body: t.Object({ trackName: t.String({ minLength: 1, maxLength: 64 }), action: t.Union([t.Literal("show"), t.Literal("focus")]) }),
      },
    )
    .get(
      "/rooms/:roomId/stage-requests",
      ({ user, params: { roomId }, status }) => {
        const room = roomOf(user, roomId);
        if (!room) return status(HTTP_NOT_FOUND, apiError("room_not_found", "room not found"));
        if (!room.canManage) return status(HTTP_FORBIDDEN, apiError("forbidden", "room manager only"));
        return { items: store.pending(roomId) };
      },
      { auth: "user", params: roomParams },
    )
    .post("/rooms/:roomId/stage-requests/:id/approve", ({ user, params: { roomId, id }, set, status }) => {
      const denied = decide(user, roomId, id, "approved");
      if (denied) return status(denied.code, denied.body);
      set.status = HTTP_NO_CONTENT;
      return null;
    }, { auth: "user", params: requestParams })
    .post("/rooms/:roomId/stage-requests/:id/deny", ({ user, params: { roomId, id }, set, status }) => {
      const denied = decide(user, roomId, id, "denied");
      if (denied) return status(denied.code, denied.body);
      set.status = HTTP_NO_CONTENT;
      return null;
    }, { auth: "user", params: requestParams })
    .delete(
      "/rooms/:roomId/stage-requests/:id",
      ({ user, params: { roomId, id }, set, status }) => {
        // Hanya pemilik; request orang lain diperlakukan tidak ada (tidak membocorkan keberadaannya).
        if (store.get(roomId, id)?.userId !== user.id || !store.resolve(roomId, id, "canceled")) return status(HTTP_NOT_FOUND, notFound());
        set.status = HTTP_NO_CONTENT;
        return null;
      },
      { auth: "user", params: requestParams },
    );
}
