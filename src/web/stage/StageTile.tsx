/** Tile video stage + varian admin (drag/drop + tombol alternatif drag). */
import { useDraggable, useDroppable } from "@dnd-kit/react";
import { VideoTrack, type TrackReference } from "@livekit/components-react";
import { ArrowLeft, ArrowRight, Focus, Plus } from "lucide-react";
import { useCallback, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LayoutState, TrackRef } from "../../shared/layout.model";
import { parseTrackName } from "../../shared/track.naming";
import { STAGE_LABELS } from "./stage.labels";
import { keyOf, type ResolvedSlot } from "./stage.resolve";

/** Aksi edit admin; null = penonton (tanpa kontrol). */
export type StageActions = {
  swap(i: number, j: number): void;
  focus(ref: TrackRef): void;
  place(index: number | null, ref: TrackRef): void;
  resize(sizes: number[]): void;
  setTemplate(t: LayoutState["template"]): void;
};

/** Data drag: slot layout (tukar) atau track dari strip "lainnya" (ganti isi slot). */
export type DragData = { kind: "slot"; index: number } | { kind: "extra"; ref: TrackRef };
export type DropData = { index: number };

function kindLabel(trackName: string): string {
  const p = parseTrackName(trackName);
  if (p?.kind === "camera") return STAGE_LABELS.camera;
  if (p?.kind === "screen") return STAGE_LABELS.screen(p.index);
  return trackName;
}

/** Tampilan tile: video (layar object-contain agar tidak terpotong) atau placeholder slot kosong. */
function TileView({ track, trackRef, children }: { track: TrackReference | null; trackRef: TrackRef; children?: ReactNode }) {
  const name = track ? track.participant.name || track.participant.identity : trackRef.identity;
  const label = `${name} · ${kindLabel(trackRef.trackName)}`;
  return (
    <div className="relative h-full w-full overflow-hidden rounded-md bg-muted" aria-label={label}>
      {track ? (
        <VideoTrack
          trackRef={track}
          className={cn("h-full w-full", track.source === "screen_share" ? "object-contain" : "object-cover")}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center p-2 text-center text-xs text-muted-foreground">
          {trackRef.identity}/{trackRef.trackName} ({STAGE_LABELS.inactive})
        </div>
      )}
      <span className="absolute bottom-1 left-1 max-w-[90%] truncate rounded bg-black/60 px-1.5 py-0.5 text-xs text-white">
        {label}
      </span>
      {children && <div className="absolute top-1 right-1 flex gap-1">{children}</div>}
    </div>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <Button type="button" size="icon-xs" variant="secondary" aria-label={label} title={label} onClick={onClick}>
      {children}
    </Button>
  );
}

/** Slot layout; admin: bisa di-drag, jadi target drop, dan punya tombol fokus/geser. */
export function SlotTile({ item, count, actions }: { item: ResolvedSlot<TrackReference>; count: number; actions: StageActions | null }) {
  if (!actions) return <TileView track={item.track} trackRef={item.slot.trackRef} />;
  return <EditableSlotTile item={item} count={count} actions={actions} />;
}

function EditableSlotTile({ item, count, actions }: { item: ResolvedSlot<TrackReference>; count: number; actions: StageActions }) {
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
  const i = item.index;
  return (
    <div ref={ref} className={cn("h-full w-full cursor-grab", drop.isDropTarget && "ring-2 ring-primary", drag.isDragging && "opacity-50")}>
      <TileView track={item.track} trackRef={item.slot.trackRef}>
        {i > 0 && (
          <IconButton label={STAGE_LABELS.moveLeft} onClick={() => actions.swap(i, i - 1)}>
            <ArrowLeft />
          </IconButton>
        )}
        {i < count - 1 && (
          <IconButton label={STAGE_LABELS.moveRight} onClick={() => actions.swap(i, i + 1)}>
            <ArrowRight />
          </IconButton>
        )}
        <IconButton label={STAGE_LABELS.focus} onClick={() => actions.focus(item.slot.trackRef)}>
          <Focus />
        </IconButton>
      </TileView>
    </div>
  );
}

/** Track di luar layout (strip "lainnya"); admin: drag ke slot = ganti, tombol + = tambah slot. */
export function ExtraTile({ track, actions }: { track: TrackReference; actions: StageActions | null }) {
  const ref = { identity: track.participant.identity, trackName: track.publication.trackName };
  if (!actions) return <TileView track={track} trackRef={ref} />;
  return <EditableExtraTile track={track} trackRef={ref} actions={actions} />;
}

function EditableExtraTile({ track, trackRef, actions }: { track: TrackReference; trackRef: TrackRef; actions: StageActions }) {
  const drag = useDraggable({ id: `extra-${keyOf(trackRef)}`, data: { kind: "extra", ref: trackRef } satisfies DragData });
  return (
    <div ref={drag.ref} className={cn("h-full w-full cursor-grab", drag.isDragging && "opacity-50")}>
      <TileView track={track} trackRef={trackRef}>
        <IconButton label={STAGE_LABELS.addToLayout} onClick={() => actions.place(null, trackRef)}>
          <Plus />
        </IconButton>
      </TileView>
    </div>
  );
}
