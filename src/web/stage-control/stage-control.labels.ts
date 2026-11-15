import type { StageMode, StageRequestAction, StageRequestStatus } from "../../shared/api.types";

/** Label UI stage control (RND/plan/11-stage-control.md S7). */
export const STAGE_CONTROL_TEXT = {
  title: "Stage control",
  mode: { host: "Host only", request: "Request", open: "Open" } satisfies Record<StageMode, string>,
  modeHint: {
    host: "Only hosts arrange the stage.",
    request: "Participants ask to show their screen; hosts approve.",
    open: "Participants can arrange the stage too.",
  } satisfies Record<StageMode, string>,
  badge: (mode: string) => `Stage: ${mode}`,
  modeChanged: (mode: string) => `Stage control: ${mode}`,
  requestShow: "Request to show",
  requestFocus: "Request full stage",
  cancelRequest: "Cancel request",
  requestSent: "Request sent to the host",
  requestAction: { show: "show a screen", focus: "take the full stage" } satisfies Record<StageRequestAction, string>,
  incoming: (name: string, action: string) => `${name} asks to ${action}`,
  approve: "Approve",
  deny: "Deny",
  queue: (n: number) => `Stage requests (${n})`,
  queueEmpty: "No pending requests",
  approveFailed: "Couldn't apply the request to the stage",
  result: {
    approved: "Your stage request was approved",
    denied: "Your stage request was declined",
    expired: "Your stage request expired",
  } satisfies Partial<Record<StageRequestStatus, string>>,
} as const;
