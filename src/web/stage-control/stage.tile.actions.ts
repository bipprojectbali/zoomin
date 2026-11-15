/** Aksi menu tile untuk mode request (S7): hanya layar milik sendiri; pending → "Cancel request". */
import { Maximize2, MonitorUp, X } from "lucide-react";
import type { TileMenuItem } from "@/stage/TileMenu";
import type { TrackRef } from "../../shared/layout.model";
import { parseTrackName } from "../../shared/track.naming";
import { STAGE_CONTROL_TEXT as TEXT } from "./stage-control.labels";
import type { StageRequests } from "./useStageRequests";

export function requestTileActions(ref: TrackRef, isOwn: boolean, s: Pick<StageRequests, "own" | "request" | "cancel">): TileMenuItem[] {
  if (!isOwn || parseTrackName(ref.trackName)?.kind !== "screen") return [];
  if (s.own?.trackName === ref.trackName) return [{ label: TEXT.cancelRequest, icon: X, onSelect: () => void s.cancel() }];
  return [
    { label: TEXT.requestShow, icon: MonitorUp, onSelect: () => void s.request(ref.trackName, "show") },
    { label: TEXT.requestFocus, icon: Maximize2, onSelect: () => void s.request(ref.trackName, "focus") },
  ];
}
