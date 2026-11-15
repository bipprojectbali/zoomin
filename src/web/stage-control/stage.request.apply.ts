/** Layout berikutnya saat pengelola menyetujui request stage (S6); fungsi murni, version tidak diubah. */
import type { StageRequest } from "../../shared/api.types";
import { addRow, placeInCell } from "../../shared/layout.grid";
import { refKey, setFocus, type LayoutState, type TrackRef } from "../../shared/layout.model";
import { placeTrack } from "../stage/stage.edit";

/** `effective` = layout bersama atau layout otomatis; request identity = userId (R7). */
export function applyStageRequest(
  effective: LayoutState,
  req: Pick<StageRequest, "userId" | "trackName" | "action">,
  by: string,
): LayoutState {
  const ref: TrackRef = { identity: req.userId, trackName: req.trackName };
  const placed = place(effective, ref, by);
  return req.action === "focus" ? setFocus(placed, ref, by) : placed;
}

function place(state: LayoutState, ref: TrackRef, by: string): LayoutState {
  if (state.slots.some((s) => refKey(s.trackRef) === refKey(ref))) return state;
  if (!state.grid) return placeTrack(state, null, ref, by);
  // custom-grid: sel kosong pertama; penuh → tambah baris (melempar bila grid sudah maksimum).
  let grid = state;
  let empty = grid.grid!.cells.findIndex((c) => c.trackRef === null);
  if (empty < 0) {
    grid = addRow(grid, by);
    empty = grid.grid!.cells.findIndex((c) => c.trackRef === null);
  }
  return placeInCell(grid, empty, ref, by);
}
