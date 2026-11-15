/** Follow host (S12), murni: null = mengikuti layout bersama; selain itu salinan lokal milik penonton. */
import type { LayoutState } from "../../shared/layout.model";

export type LocalStage = { local: LayoutState; baseVersion: number } | null;

/** Version layout bersama; -1 = belum ada (layout otomatis). */
export const sharedVersion = (layout: LayoutState | null): number => layout?.version ?? -1;

/** Terapkan edit ke salinan lokal (dibuat dari `shared` saat edit pertama); edit no-op → state sama. */
export function editLocal(state: LocalStage, shared: LayoutState, version: number, fn: (s: LayoutState) => LayoutState): LocalStage {
  const base = state?.local ?? shared;
  const next = fn(base);
  if (next === base) return state;
  return { local: next, baseVersion: state?.baseVersion ?? version };
}

/** Layout bersama berubah sejak penonton mulai menata sendiri. */
export const hostChanged = (state: LocalStage, version: number): boolean => state !== null && state.baseVersion !== version;
