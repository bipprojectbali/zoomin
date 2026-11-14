/** Stage room: render LayoutState (atau layout otomatis) + kontrol edit admin. */
import { DragDropProvider, type DragEndEvent } from "@dnd-kit/react";
import { useTracks } from "@livekit/components-react";
import { Track, type Room } from "livekit-client";
import { useMemo, useState } from "react";
import { setFocus, setPanelSizes, setTemplate, swapSlots, type LayoutState } from "../../shared/layout.model";
import { placeTrack } from "./stage.edit";
import { STAGE_LABELS } from "./stage.labels";
import { autoLayout, resolveSlots } from "./stage.resolve";
import { OthersStrip, TemplateView } from "./StageTemplates";
import type { DragData, DropData, StageActions } from "./StageTile";
import { StageToolbar } from "./StageToolbar";

const SOURCES = [Track.Source.Camera, Track.Source.ScreenShare];

export function Stage({ room, layout, editable, onCommit }: {
  room: Room;
  layout: LayoutState | null;
  editable: boolean;
  onCommit: (next: LayoutState) => void;
}) {
  // onlySubscribed false: publikasi yang belum ter-subscribe tetap mengisi slot (bukan dianggap kosong).
  const tracks = useTracks(SOURCES, { room, onlySubscribed: false });
  const effective = useMemo(() => layout ?? autoLayout(tracks), [layout, tracks]);
  const { slots, extras } = useMemo(() => resolveSlots(effective, tracks), [effective, tracks]);
  const [editError, setEditError] = useState<string | null>(null);

  const actions = useMemo<StageActions | null>(() => {
    if (!editable) return null;
    const by = room.localParticipant.identity;
    const edit = (fn: (s: LayoutState) => LayoutState) => {
      try {
        const next = fn(effective);
        if (next === effective) return;
        setEditError(null);
        onCommit(next);
      } catch (e) {
        console.error("[stage] edit layout gagal", e);
        setEditError(`${STAGE_LABELS.editFailed}: ${e instanceof Error ? e.message : String(e)}`);
      }
    };
    return {
      swap: (i, j) => edit((s) => swapSlots(s, i, j, by)),
      focus: (ref) => edit((s) => setFocus(s, ref, by)),
      place: (index, ref) => edit((s) => placeTrack(s, index, ref, by)),
      resize: (sizes) => edit((s) => setPanelSizes(s, sizes, by)),
      setTemplate: (t) => edit((s) => (s.template === t ? s : setTemplate(s, t, by))),
    };
  }, [editable, effective, onCommit, room]);

  const onDragEnd = (event: DragEndEvent) => {
    if (event.canceled || !actions) return;
    const src = event.operation.source?.data as DragData | undefined;
    const dst = event.operation.target?.data as DropData | undefined;
    if (!src || !dst) return;
    if (src.kind === "slot") {
      if (src.index !== dst.index) actions.swap(src.index, dst.index);
    } else {
      actions.place(dst.index, src.ref);
    }
  };

  const body = (
    <div className="flex h-full w-full flex-col">
      {actions && <StageToolbar template={effective.template} onSelect={actions.setTemplate} />}
      {!layout && <p className="shrink-0 px-2 text-xs text-muted-foreground">{STAGE_LABELS.autoLayout}</p>}
      {editError && (
        <p role="alert" className="shrink-0 px-2 text-xs text-destructive">
          {editError}
        </p>
      )}
      <div className="min-h-0 flex-1">
        <TemplateView layout={effective} slots={slots} actions={actions} />
      </div>
      {extras.length > 0 && <OthersStrip extras={extras} actions={actions} />}
    </div>
  );
  return actions ? <DragDropProvider onDragEnd={onDragEnd}>{body}</DragDropProvider> : body;
}
