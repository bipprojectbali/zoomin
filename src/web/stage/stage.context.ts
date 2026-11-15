/** Context stage: aksi admin, perbesar lokal, dan lookup peserta untuk tile (menghindari prop drilling). */
import type { Participant } from "livekit-client";
import { createContext, useContext } from "react";
import type { LayoutState, TrackRef } from "../../shared/layout.model";
import type { PersonInfo } from "./stage.tile.logic";
import type { TileMenuItem } from "./TileMenu";

/** Aksi edit stage (bersama bila boleh edit & mengikuti host, selain itu lokal, S12); null = tanpa kontrol edit. */
export type StageActions = {
  swap(i: number, j: number): void;
  focus(ref: TrackRef): void;
  place(index: number | null, ref: TrackRef): void;
  remove(index: number): void;
  resize(sizes: number[]): void;
  setTemplate(t: LayoutState["template"]): void;
  /** custom-grid: taruh track di sel (sel terisi = tukar). */
  placeCell(cell: number, ref: TrackRef): void;
  addRow(): void;
  addColumn(): void;
  removeLastRow(): void;
  removeLastColumn(): void;
};

/** Item menu tambahan per tile dari luar stage (mis. "Request to show", S7). */
export type TileActions = (ref: TrackRef, isOwn: boolean) => TileMenuItem[];

/** Data drag: slot layout (tukar) atau track dari strip "lainnya" (ganti isi slot). */
export type DragData = { kind: "slot"; index: number } | { kind: "extra"; ref: TrackRef };
/** Target drop: slot layout, atau sel custom-grid (termasuk sel kosong). */
export type DropData = { index: number } | { cell: number };

export type StageCtx = {
  actions: StageActions | null;
  /** true = edit hanya berlaku untuk diri sendiri (tidak boleh edit layout bersama, atau tidak mengikuti host). */
  local: boolean;
  tileActions?: TileActions;
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
  if (!ctx) throw new Error("useStage: must be used inside <Stage>");
  return ctx;
}
