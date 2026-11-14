/** Tile slot layout & tile strip "lainnya"; varian admin menambah drag/drop + item menu edit. */
import { useDraggable, useDroppable } from "@dnd-kit/react";
import type { TrackReference } from "@livekit/components-react";
import { ArrowLeft, ArrowRight, Focus, Plus, Trash2 } from "lucide-react";
import { useCallback } from "react";
import type { TrackRef } from "../../shared/layout.model";
import { useStage, type DragData, type DropData, type StageActions } from "./stage.context";
import { STAGE_LABELS } from "./stage.labels";
import { keyOf, refOf, type ResolvedSlot } from "./stage.resolve";
import type { TileMenuItem } from "./TileMenu";
import { TileView } from "./TileView";

type Item = ResolvedSlot<TrackReference>;

/** Slot layout; admin: bisa diseret (via handle), jadi target drop, dan punya menu edit. */
export function SlotTile({ item }: { item: Item }) {
  const { actions, template } = useStage();
  const badge = template === "focus" && item.index === 0 ? STAGE_LABELS.focused : undefined;
  if (!actions) return <TileView trackRef={item.slot.trackRef} track={item.track} slotIndex={item.index} badge={badge} />;
  return <EditableSlotTile item={item} actions={actions} badge={badge} />;
}

function slotItems(item: Item, actions: StageActions, count: number, focused: boolean): TileMenuItem[] {
  const i = item.index;
  return [
    ...(focused ? [] : [{ label: STAGE_LABELS.focusForAll, icon: Focus, onSelect: () => actions.focus(item.slot.trackRef) }]),
    ...(i > 0 ? [{ label: STAGE_LABELS.moveLeft, icon: ArrowLeft, onSelect: () => actions.swap(i, i - 1) }] : []),
    ...(i < count - 1 ? [{ label: STAGE_LABELS.moveRight, icon: ArrowRight, onSelect: () => actions.swap(i, i + 1) }] : []),
    { label: STAGE_LABELS.removeFromLayout, icon: Trash2, onSelect: () => actions.remove(i), destructive: true },
  ];
}

function EditableSlotTile({ item, actions, badge }: { item: Item; actions: StageActions; badge?: string }) {
  const { slotCount } = useStage();
  const id = `slot-${item.index}`;
  const drag = useDraggable({ id, data: { kind: "slot", index: item.index } satisfies DragData });
  const drop = useDroppable({ id, data: { index: item.index } satisfies DropData });
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
      adminItems={slotItems(item, actions, slotCount, badge !== undefined)}
      drag={{ ref, handleRef: drag.handleRef, isDragging: drag.isDragging, isDropTarget: drop.isDropTarget }}
    />
  );
}

/** Track di luar layout (strip "lainnya"); admin: seret ke slot = ganti, menu = tambah slot. */
export function ExtraTile({ track }: { track: TrackReference }) {
  const { actions } = useStage();
  const trackRef = refOf(track);
  if (!actions) return <TileView trackRef={trackRef} track={track} slotIndex={null} />;
  return <EditableExtraTile track={track} trackRef={trackRef} actions={actions} />;
}

function EditableExtraTile({ track, trackRef, actions }: { track: TrackReference; trackRef: TrackRef; actions: StageActions }) {
  const drag = useDraggable({ id: `extra-${keyOf(trackRef)}`, data: { kind: "extra", ref: trackRef } satisfies DragData });
  return (
    <TileView
      trackRef={trackRef}
      track={track}
      slotIndex={null}
      adminItems={[{ label: STAGE_LABELS.addToLayout, icon: Plus, onSelect: () => actions.place(null, trackRef) }]}
      drag={{ ref: drag.ref, handleRef: drag.handleRef, isDragging: drag.isDragging }}
    />
  );
}
