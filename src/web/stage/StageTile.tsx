/** Tile slot layout & tile di luar panggung (strip/gallery); varian edit menambah drag/drop + item menu edit. */
import { useDraggable, useDroppable } from "@dnd-kit/react";
import type { TrackReference } from "@livekit/components-react";
import { Track } from "livekit-client";
import { ArrowLeft, ArrowRight, Focus, Plus, Star, Trash2 } from "lucide-react";
import { useCallback } from "react";
import { useStage, type DragData, type DropData, type StageActions } from "./stage.context";
import { STAGE_LABELS } from "./stage.labels";
import { keyOf, type ExtraItem, type ResolvedSlot } from "./stage.resolve";
import type { TileMenuItem } from "./TileMenu";
import { TileView } from "./TileView";

type Item = ResolvedSlot<TrackReference>;

/** Slot layout; editor: bisa diseret (via handle), jadi target drop, dan punya menu edit. `cell` = sel custom-grid. */
export function SlotTile({ item, cell }: { item: Item; cell?: number }) {
  const { actions, template } = useStage();
  const badge = template === "focus" && item.index === 0 ? STAGE_LABELS.focused : undefined;
  if (!actions) return <TileView trackRef={item.slot.trackRef} track={item.track} slotIndex={item.index} badge={badge} />;
  return <EditableSlotTile item={item} actions={actions} badge={badge} cell={cell} />;
}

function slotItems(item: Item, actions: StageActions, count: number, focused: boolean, local: boolean): TileMenuItem[] {
  const i = item.index;
  const focusLabel = local ? STAGE_LABELS.focusForMe : STAGE_LABELS.focusForAll;
  return [
    ...(focused ? [] : [{ label: focusLabel, icon: Focus, onSelect: () => actions.focus(item.slot.trackRef) }]),
    ...(i > 0 ? [{ label: STAGE_LABELS.moveLeft, icon: ArrowLeft, onSelect: () => actions.swap(i, i - 1) }] : []),
    ...(i < count - 1 ? [{ label: STAGE_LABELS.moveRight, icon: ArrowRight, onSelect: () => actions.swap(i, i + 1) }] : []),
    { label: STAGE_LABELS.removeFromLayout, icon: Trash2, onSelect: () => actions.remove(i), destructive: true },
  ];
}

function EditableSlotTile({ item, actions, badge, cell }: { item: Item; actions: StageActions; badge?: string; cell?: number }) {
  const { slotCount, local } = useStage();
  const id = `slot-${item.index}`;
  const drag = useDraggable({ id, data: { kind: "slot", index: item.index } satisfies DragData });
  const dropData: DropData = cell === undefined ? { index: item.index } : { cell };
  const drop = useDroppable({ id, data: dropData });
  const { ref: dragRef } = drag;
  const { ref: dropRef } = drop;
  const ref = useCallback(
    (el: Element | null) => {
      dragRef(el);
      dropRef(el);
    },
    [dragRef, dropRef],
  );
  return (
    <TileView
      trackRef={item.slot.trackRef}
      track={item.track}
      slotIndex={item.index}
      badge={badge}
      adminItems={slotItems(item, actions, slotCount, badge !== undefined, local)}
      drag={{ ref, handleRef: drag.handleRef, isDragging: drag.isDragging, isDropTarget: drop.isDropTarget }}
    />
  );
}

/** Track/avatar di luar panggung; editor: seret ke slot = ganti, menu = tambah ke panggung (kamera: "Spotlight"). */
export function ExtraTile({ item }: { item: ExtraItem<TrackReference> }) {
  const { actions } = useStage();
  if (!actions) return <TileView trackRef={item.ref} track={item.track} slotIndex={null} />;
  return <EditableExtraTile item={item} actions={actions} />;
}

function EditableExtraTile({ item, actions }: { item: ExtraItem<TrackReference>; actions: StageActions }) {
  const trackRef = item.ref;
  const drag = useDraggable({ id: `extra-${keyOf(trackRef)}`, data: { kind: "extra", ref: trackRef } satisfies DragData });
  return (
    <TileView
      trackRef={trackRef}
      track={item.track}
      slotIndex={null}
      adminItems={[
        item.track?.source === Track.Source.ScreenShare
          ? { label: STAGE_LABELS.addToLayout, icon: Plus, onSelect: () => actions.place(null, trackRef) }
          : { label: STAGE_LABELS.spotlight, icon: Star, onSelect: () => actions.place(null, trackRef) },
      ]}
      drag={{ ref: drag.ref, handleRef: drag.handleRef, isDragging: drag.isDragging }}
    />
  );
}
