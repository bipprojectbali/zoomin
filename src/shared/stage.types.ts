// Kontrak stage control (RND/plan/11-stage-control.md S1–S5); di-re-export dari api.types.ts.
//
// PUT    /api/rooms/:roomId/stage-mode SetStageModeBody (pengelola)       -> RoomSummary | 403 forbidden
// POST   /api/rooms/:roomId/stage-requests CreateStageRequestBody (participant, mode request) -> StageRequest
//                                                  | 403 forbidden | 409 stage_mode_mismatch | 429 rate_limited
// GET    /api/rooms/:roomId/stage-requests (pengelola)                   -> { items: StageRequest[] } (pending saja)
// POST   /api/rooms/:roomId/stage-requests/:id/approve | /deny (pengelola) -> 204 | 404 stage_request_not_found
// DELETE /api/rooms/:roomId/stage-requests/:id (pemilik)                 -> 204 | 404 stage_request_not_found

/** Kebijakan siapa yang boleh mengubah panggung bersama (S1). */
export type StageMode = "host" | "request" | "open";
export const STAGE_MODES: readonly StageMode[] = ["host", "request", "open"];

export type StageRequestAction = "show" | "focus";
export type StageRequestStatus = "pending" | "approved" | "denied" | "canceled" | "expired";

/** Permintaan participant agar layarnya tampil/difokuskan di panggung (S4). Waktu = epoch ms. */
export type StageRequest = {
  id: string;
  roomId: string;
  userId: string;
  userName: string;
  trackName: string;
  action: StageRequestAction;
  status: StageRequestStatus;
  createdAt: number;
  expiresAt: number;
};

export type CreateStageRequestBody = { trackName: string; action: StageRequestAction };
export type SetStageModeBody = { mode: StageMode };

/** Payload data channel LiveKit (topic STAGE_EVENT_TOPIC, reliable, S5). */
export type StageEvent = { type: "request.created" | "request.resolved"; request: StageRequest };

export const STAGE_EVENT_TOPIC = "zoomin.stage";
export const STAGE_REQUEST_TTL_MS = 60_000;
