/** Template custom-grid (S8/S8a): sel cols×rows sama besar, sel kosong = target drop, toolbar baris/kolom untuk editor. */
import { useDroppable } from "@dnd-kit/react";
import type { TrackReference } from "@livekit/components-react";
import { Columns3, Rows3 } from "lucide-react";
import type { CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LayoutState } from "../../shared/layout.model";
import { useStage, type DropData, type StageActions } from "./stage.context";
import { canRemoveLast } from "./stage.edit";
import { STAGE_LABELS } from "./stage.labels";
import type { ResolvedSlot } from "./stage.resolve";
import { SlotTile } from "./StageTile";

function GridToolbar({ layout, actions }: { layout: LayoutState; actions: StageActions }) {
  const btn = (label: string, onClick: () => void, Icon: typeof Rows3, disabled = false) => (
    <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={onClick}>
      <Icon />
      {label}
    </Button>
  );
  return (
    <div role="toolbar" aria-label={STAGE_LABELS.gridToolbar} data-testid="grid-toolbar" className="flex shrink-0 flex-wrap gap-1 p-1">
      {btn(STAGE_LABELS.addRow, actions.addRow, Rows3)}
      {btn(STAGE_LABELS.addColumn, actions.addColumn, Columns3)}
      {btn(STAGE_LABELS.removeRow, actions.removeLastRow, Rows3, !canRemoveLast(layout, "row"))}
      {btn(STAGE_LABELS.removeColumn, actions.removeLastColumn, Columns3, !canRemoveLast(layout, "column"))}
    </div>
  );
}

function EmptyCell({ cell }: { cell: number }) {
  const { actions } = useStage();
  if (!actions) return <div data-testid="stage-empty-cell" data-cell-index={cell} aria-label={STAGE_LABELS.emptyCell} className="h-full rounded-xl border border-dashed" />;
  return <DroppableCell cell={cell} />;
}

function DroppableCell({ cell }: { cell: number }) {
  const drop = useDroppable({ id: `cell-${cell}`, data: { cell } satisfies DropData });
  return (
    <div
      ref={drop.ref}
      data-testid="stage-empty-cell"
      data-cell-index={cell}
      className={cn(
        "flex h-full items-center justify-center rounded-xl border-2 border-dashed p-2 text-center text-sm text-muted-foreground",
        drop.isDropTarget && "border-primary bg-primary/20 text-foreground",
      )}
    >
      {STAGE_LABELS.dropScreen}
    </div>
  );
}

export function CustomGridView({ layout, slots }: { layout: LayoutState; slots: ResolvedSlot<TrackReference>[] }) {
  const { actions } = useStage();
  const grid = layout.grid!;
  const style: CSSProperties = {
    gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${grid.rows}, minmax(0, 1fr))`,
  };
  let k = 0; // slot ke-k = sel terisi ke-k (gridSlots)
  return (
    <div className="flex h-full flex-col">
      {actions && <GridToolbar layout={layout} actions={actions} />}
      <div style={style} data-testid="custom-grid" className="grid min-h-0 flex-1 gap-2 p-1">
        {grid.cells.map((c, i) => (
          <div key={i} className="min-h-0 min-w-0">
            {c.trackRef ? <SlotTile item={slots[k++]!} cell={i} /> : <EmptyCell cell={i} />}
          </div>
        ))}
      </div>
    </div>
  );
}
