/**
 * Envelope room metadata LiveKit (RND/plan/11-stage-control.md S2): `{ stageMode, layout }`.
 * Kompat mundur: metadata lama = LayoutState mentah (punya `template`) → mode "host". Kosong → `{ host, null }`.
 */
import { LAYOUT_MAX_BYTES, type LayoutState, LayoutValidationError, parseLayout, serializeLayout } from "./layout.model";
import { STAGE_MODES, type StageMode } from "./stage.types";

/** Isi room metadata yang sudah divalidasi. */
export type RoomStage = { stageMode: StageMode; layout: LayoutState | null };

/** Ruang untuk `{"stageMode":"request","layout":}` di atas batas layout. */
const ENVELOPE_OVERHEAD_BYTES = 64;
const ROOT = "$";

export const isStageMode = (v: unknown): v is StageMode => STAGE_MODES.includes(v as StageMode);

/** Parse room metadata (envelope atau layout lama); melempar LayoutValidationError bila rusak. */
export function parseRoomStage(json: string | null | undefined): RoomStage {
  if (!json) return { stageMode: "host", layout: null };
  if (new TextEncoder().encode(json).length > LAYOUT_MAX_BYTES + ENVELOPE_OVERHEAD_BYTES) {
    throw new LayoutValidationError(ROOT, `room metadata exceeds ${LAYOUT_MAX_BYTES} bytes`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    throw new LayoutValidationError(ROOT, `room metadata is not valid JSON: ${(e as Error).message}`, { cause: e });
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new LayoutValidationError(ROOT, "room metadata must be an object");
  const obj = raw as Record<string, unknown>;
  if ("template" in obj) return { stageMode: "host", layout: parseLayout(json) };
  if (!isStageMode(obj.stageMode)) throw new LayoutValidationError("stageMode", `unknown stage mode "${String(obj.stageMode)}"`);
  const layout = obj.layout === null || obj.layout === undefined ? null : parseLayout(JSON.stringify(obj.layout));
  return { stageMode: obj.stageMode, layout };
}

/** Serialisasi envelope; layout lewat serializeLayout (batas LAYOUT_MAX_BYTES). */
export function serializeRoomStage(stage: RoomStage): string {
  const layout = stage.layout === null ? "null" : serializeLayout(stage.layout);
  return `{"stageMode":${JSON.stringify(stage.stageMode)},"layout":${layout}}`;
}
