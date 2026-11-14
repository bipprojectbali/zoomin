/** Context stage: aksi admin, perbesar lokal, dan lookup peserta untuk tile (menghindari prop drilling). */
import type { Participant } from "livekit-client";
import { createContext, useContext } from "react";
import type { LayoutState, TrackRef } from "../../shared/layout.model";
import type { PersonInfo } from "./stage.tile.logic";

/** Aksi edit admin; null = penonton (tanpa kontrol edit). */
export type StageActions = {
  swap(i: number, j: number): void;
  focus(ref: TrackRef): void;
  place(index: number | null, ref: TrackRef): void;
  remove(index: number): void;
  resize(sizes: number[]): void;
  setTemplate(t: LayoutState["template"]): void;
};

/** Data drag: slot layout (tukar) atau track dari strip "lainnya" (ganti isi slot). */
export type DragData = { kind: "slot"; index: number } | { kind: "extra"; ref: TrackRef };
export type DropData = { index: number };

export type StageCtx = {
  actions: StageActions | null;
  template: LayoutState["template"];
  slotCount: number;
  /** key (keyOf trackRef) tile yang diperbesar lokal, null = tampilan layout. */
  expanded: string | null;
  setExpanded(key: string | null): void;
  /** Info nama + objek participant (bila masih di room) untuk identity. */
  who(identity: string): { person: PersonInfo; participant: Participant | undefined };
};

export const StageContext = createContext<StageCtx | null>(null);

export function useStage(): StageCtx {
  const ctx = useContext(StageContext);
  if (!ctx) throw new Error("useStage: harus di dalam <Stage>");
  return ctx;
}
