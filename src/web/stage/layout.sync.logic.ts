/** Logika murni sinkronisasi layout (tanpa React/SDK) agar bisa dites. */
import type { LayoutResponse } from "../../shared/api.types";
import type { LayoutState } from "../../shared/layout.model";
import { parseRoomStage } from "../../shared/stage.model";
import type { StageMode } from "../../shared/stage.types";
import { ApiRequestError } from "../api.client";

const HTTP_CONFLICT = 409;

/**
 * Pilih state yang dipegang: incoming hanya menang bila version-nya lebih besar
 * (publish metadata bisa tiba tidak berurutan; version sama = isi sama, abaikan).
 */
export function pickNewer(current: LayoutState | null, incoming: LayoutState | null): LayoutState | null {
  if (!incoming) return current;
  if (!current || incoming.version > current.version) return incoming;
  return current;
}

/** baseVersion untuk PUT: version state yang dipegang, 0 bila belum ada layout. */
export const baseVersionOf = (current: LayoutState | null): number => current?.version ?? 0;

/**
 * Baca envelope room.metadata (S2; metadata lama = LayoutState → mode host). Kosong → layout null, mode host
 * tanpa error; invalid → layout & mode null (pertahankan state) + pesan error.
 */
export function stageFromMetadata(metadata: string | undefined): {
  layout: LayoutState | null;
  stageMode: StageMode | null;
  error: Error | null;
} {
  try {
    return { ...parseRoomStage(metadata), error: null };
  } catch (e) {
    return { layout: null, stageMode: null, error: new Error("stageFromMetadata: room.metadata is not a valid stage envelope", { cause: e }) };
  }
}

/** Layout dari GET; version diambil dari kolom server (sumber kebenaran CAS). */
export const layoutFromResponse = (res: LayoutResponse): LayoutState | null =>
  res.layout ? { ...res.layout, version: res.version } : null;

/** PUT ditolak karena baseVersion usang. */
export const isConflict = (e: unknown): boolean => e instanceof ApiRequestError && e.status === HTTP_CONFLICT;
