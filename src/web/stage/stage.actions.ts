/** Hook aksi edit stage: bersama (onCommit → PUT) bila boleh edit & mengikuti host, selain itu salinan lokal (S12). */
import { useMemo, useState } from "react";
import { addColumn, addRow, placeInCell, removeColumn, removeRow } from "../../shared/layout.grid";
import { setFocus, setPanelSizes, setTemplate, swapSlots, type LayoutState } from "../../shared/layout.model";
import type { StageActions } from "./stage.context";
import { placeTrack, removeSlot } from "./stage.edit";
import { editLocal, sharedVersion, type LocalStage } from "./stage.follow";
import { STAGE_LABELS } from "./stage.labels";

export function useStageActions({ by, layout, sharedEffective, editable, onCommit }: {
  by: string;
  /** Layout bersama dari server (null = otomatis). */
  layout: LayoutState | null;
  /** Layout bersama efektif (layout ?? otomatis). */
  sharedEffective: LayoutState;
  editable: boolean;
  onCommit: (next: LayoutState) => void;
}) {
  const [localStage, setLocalStage] = useState<LocalStage>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const shared = editable && localStage === null;

  const actions = useMemo<StageActions>(() => {
    const fail = (e: unknown) => {
      console.error("[stage] edit layout gagal", e);
      setEditError(`${STAGE_LABELS.editFailed}: ${e instanceof Error ? e.message : String(e)}`);
    };
    const edit = (fn: (s: LayoutState) => LayoutState) => {
      try {
        if (shared) {
          const next = fn(sharedEffective);
          if (next === sharedEffective) return;
          onCommit(next);
        } else {
          // Hitung di luar setState agar error validasi tertangkap di sini.
          const next = editLocal(localStage, sharedEffective, sharedVersion(layout), fn);
          setLocalStage(next);
        }
        setEditError(null);
      } catch (e) {
        fail(e);
      }
    };
    return {
      swap: (i, j) => edit((s) => swapSlots(s, i, j, by)),
      focus: (ref) => edit((s) => setFocus(s, ref, by)),
      place: (index, ref) => edit((s) => placeTrack(s, index, ref, by)),
      remove: (index) => edit((s) => removeSlot(s, index, by)),
      resize: (sizes) => edit((s) => setPanelSizes(s, sizes, by)),
      setTemplate: (t) => edit((s) => (s.template === t ? s : setTemplate(s, t, by))),
      placeCell: (cell, ref) => edit((s) => placeInCell(s, cell, ref, by)),
      addRow: () => edit((s) => addRow(s, by)),
      addColumn: () => edit((s) => addColumn(s, by)),
      removeLastRow: () => edit((s) => removeRow(s, s.grid!.rows - 1, by)),
      removeLastColumn: () => edit((s) => removeColumn(s, s.grid!.cols - 1, by)),
    };
  }, [by, layout, sharedEffective, shared, localStage, onCommit]);

  return { actions, localStage, followHost: () => setLocalStage(null), local: !shared, editError };
}
