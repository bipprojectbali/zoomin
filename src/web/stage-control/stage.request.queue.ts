/** Logika murni antrean request stage di klien (S4/S5): parse event data channel + upsert/hapus/kedaluwarsa. */
import type { StageEvent, StageRequest } from "../../shared/api.types";

const EVENT_TYPES: readonly StageEvent["type"][] = ["request.created", "request.resolved"];
const STATUSES: readonly StageRequest["status"][] = ["pending", "approved", "denied", "canceled", "expired"];
const ACTIONS: readonly StageRequest["action"][] = ["show", "focus"];
const STRING_FIELDS = ["id", "roomId", "userId", "userName", "trackName"] as const;

/** Payload data channel → StageEvent; bentuk tak dikenal → null (peserta lain bisa mengirim apa saja). */
export function parseStageEvent(payload: Uint8Array): StageEvent | null {
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(payload));
  } catch {
    return null; // bukan JSON = bukan event stage; diabaikan, bukan error aplikasi.
  }
  const ev = raw as Partial<StageEvent> | null;
  const r = ev?.request as Record<string, unknown> | undefined;
  if (!ev || !EVENT_TYPES.includes(ev.type as StageEvent["type"]) || !r || typeof r !== "object") return null;
  if (!STRING_FIELDS.every((k) => typeof r[k] === "string")) return null;
  if (!STATUSES.includes(r.status as StageRequest["status"]) || !ACTIONS.includes(r.action as StageRequest["action"])) return null;
  if (typeof r.createdAt !== "number" || typeof r.expiresAt !== "number") return null;
  return ev as StageEvent;
}

/** Satu pending per user (request baru menggantikan yang lama, S4); urut waktu masuk. */
export const upsertRequest = (items: StageRequest[], req: StageRequest): StageRequest[] => [
  ...items.filter((x) => x.id !== req.id && x.userId !== req.userId),
  req,
];

export const removeRequest = (items: StageRequest[], id: string): StageRequest[] => items.filter((x) => x.id !== id);

/** Buang yang lewat expiresAt (server purge lazy; klien tidak menunggu event expired). */
export const livePending = (items: StageRequest[], now: number): StageRequest[] =>
  items.filter((x) => x.status === "pending" && x.expiresAt > now);

/** Interval cek kedaluwarsa lokal; kasar dibanding TTL 60 s. */
export const EXPIRY_TICK_MS = 1_000;
