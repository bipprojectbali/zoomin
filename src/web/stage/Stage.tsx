/** Stage room: render LayoutState (atau layout otomatis) + kontrol edit admin + perbesar lokal. */
import { DragDropProvider, type DragEndEvent } from "@dnd-kit/react";
import { useRemoteParticipants, useTracks } from "@livekit/components-react";
import { RoomEvent, Track, type Room } from "livekit-client";
import { Minimize2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { setFocus, setPanelSizes, setTemplate, swapSlots, type LayoutState } from "../../shared/layout.model";
import { StageContext, type DragData, type DropData, type StageActions, type StageCtx } from "./stage.context";
import { placeTrack, removeSlot } from "./stage.edit";
import { STAGE_LABELS } from "./stage.labels";
import { autoLayout, keyOf, refOf, resolveSlots } from "./stage.resolve";
import { personOf } from "./stage.tile.logic";
import { OthersStrip, TemplateView } from "./StageTemplates";
import { StageToolbar } from "./StageToolbar";
import { TileView } from "./TileView";

const SOURCES = [Track.Source.Camera, Track.Source.ScreenShare];
// Join/leave selalu memicu update; nama ikut agar label tile tidak basi. Event lain (speaking dsb) ditangani per tile.
const PARTICIPANT_EVENTS = [RoomEvent.ParticipantNameChanged];

export function Stage({ room, layout, editable, onCommit }: {
  room: Room;
  layout: LayoutState | null;
  editable: boolean;
  onCommit: (next: LayoutState) => void;
}) {
  // onlySubscribed false: publikasi yang belum ter-subscribe tetap mengisi slot (bukan dianggap kosong).
  const tracks = useTracks(SOURCES, { room, onlySubscribed: false });
  const remotes = useRemoteParticipants({ room, updateOnlyOn: PARTICIPANT_EVENTS });
  const effective = useMemo(() => layout ?? autoLayout(tracks), [layout, tracks]);
  const { slots, extras } = useMemo(() => resolveSlots(effective, tracks), [effective, tracks]);
  const [editError, setEditError] = useState<string | null>(null);
  const [expandedKey, setExpanded] = useState<string | null>(null);
  // Track yang diperbesar hilang (berhenti share/keluar) → otomatis kembali ke layout.
  const expandedTrack = expandedKey ? tracks.find((t) => keyOf(refOf(t)) === expandedKey) : undefined;

  useEffect(() => {
    if (!expandedTrack) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.fullscreenElement) setExpanded(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expandedTrack]);

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
      remove: (index) => edit((s) => removeSlot(s, index, by)),
      resize: (sizes) => edit((s) => setPanelSizes(s, sizes, by)),
      setTemplate: (t) => edit((s) => (s.template === t ? s : setTemplate(s, t, by))),
    };
  }, [editable, effective, onCommit, room]);

  const ctx = useMemo<StageCtx>(() => {
    const people = [room.localParticipant, ...remotes];
    const localIdentity = room.localParticipant.identity;
    return {
      actions,
      template: effective.template,
      slotCount: effective.slots.length,
      expanded: expandedTrack ? expandedKey : null,
      setExpanded,
      who: (identity) => ({
        person: personOf(identity, people, localIdentity),
        participant: people.find((p) => p.identity === identity),
      }),
    };
  }, [actions, effective, expandedKey, expandedTrack, remotes, room]);

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

  const expandedView = expandedTrack && (
    <div data-testid="tile-expanded" className="flex h-full flex-col gap-1 p-1">
      <Button type="button" size="sm" variant="secondary" className="self-start" onClick={() => setExpanded(null)}>
        <Minimize2 />
        {STAGE_LABELS.backToLayout}
      </Button>
      <div className="min-h-0 flex-1">
        <TileView
          trackRef={refOf(expandedTrack)}
          track={expandedTrack}
          slotIndex={slots.find((s) => s.track === expandedTrack)?.index ?? null}
        />
      </div>
    </div>
  );

  const body = (
    <div data-testid="stage" data-template={layout ? layout.template : "auto"} className="flex h-full w-full flex-col">
      {actions && !expandedView && <StageToolbar template={effective.template} onSelect={actions.setTemplate} />}
      {!layout && <p className="shrink-0 px-2 text-xs text-muted-foreground">{STAGE_LABELS.autoLayout}</p>}
      {editError && (
        <p role="alert" className="shrink-0 px-2 text-xs text-destructive">
          {editError}
        </p>
      )}
      {expandedView || (
        <>
          <div className="min-h-0 flex-1">
            <TemplateView layout={effective} slots={slots} />
          </div>
          {extras.length > 0 && <OthersStrip extras={extras} />}
        </>
      )}
    </div>
  );
  return (
    <StageContext.Provider value={ctx}>
      {actions ? <DragDropProvider onDragEnd={onDragEnd}>{body}</DragDropProvider> : body}
    </StageContext.Provider>
  );
}
