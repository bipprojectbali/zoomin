/** Logika murni sinkronisasi layout (tanpa React/SDK) agar bisa dites. */
import type { LayoutResponse } from "../../shared/api.types";
import { parseLayout, type LayoutState } from "../../shared/layout.model";
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

/** Baca layout dari room.metadata; kosong → null tanpa error, invalid → null + pesan error. */
export function layoutFromMetadata(metadata: string | undefined): { layout: LayoutState | null; error: Error | null } {
  if (!metadata) return { layout: null, error: null };
  try {
    return { layout: parseLayout(metadata), error: null };
  } catch (e) {
    return { layout: null, error: new Error("layoutFromMetadata: room.metadata is not a valid layout", { cause: e }) };
  }
}

/** Layout dari GET; version diambil dari kolom server (sumber kebenaran CAS). */
export const layoutFromResponse = (res: LayoutResponse): LayoutState | null =>
  res.layout ? { ...res.layout, version: res.version } : null;

/** PUT ditolak karena baseVersion usang. */
export const isConflict = (e: unknown): boolean => e instanceof ApiRequestError && e.status === HTTP_CONFLICT;
