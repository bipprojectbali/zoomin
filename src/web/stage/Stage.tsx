/**
 * Stage room: panggung konten (LayoutState atau layout otomatis) + strip orang (S10), menu View lokal (S11),
 * Follow host (S12: edit tanpa izin/tanpa mengikuti host = salinan lokal), kontrol edit, dan perbesar lokal.
 */
import { DragDropProvider, type DragEndEvent } from "@dnd-kit/react";
import { useRemoteParticipants, useTracks, type TrackReference } from "@livekit/components-react";
import { RoomEvent, Track, type Room } from "livekit-client";
import { Minimize2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LayoutState } from "../../shared/layout.model";
import { useStageActions } from "./stage.actions";
import { StageContext, type DragData, type DropData, type StageCtx, type TileActions } from "./stage.context";
import { hostChanged, sharedVersion } from "./stage.follow";
import { STAGE_LABELS } from "./stage.labels";
import { avatarRefs, keyOf, refOf, type ExtraItem } from "./stage.resolve";
import { sceneOf, sharedEffectiveLayout, showStrip, splitStage } from "./stage.split";
import { personOf, rememberNames } from "./stage.tile.logic";
import { PeopleGrid, PeopleStrip, SpeakerView } from "./StageScenes";
import { OthersStrip, TemplateView } from "./StageTemplates";
import { StageToolbar } from "./StageToolbar";
import { TileView } from "./TileView";
import { useViewPrefs } from "./view.prefs";

export type { TileActions } from "./stage.context";
export type { TileMenuItem } from "./TileMenu";

const SOURCES = [Track.Source.Camera, Track.Source.ScreenShare];
// Join/leave selalu memicu update; nama ikut agar label tile tidak basi, metadata (role) menentukan tile avatar.
// Event lain (speaking dsb) ditangani per tile.
const PARTICIPANT_EVENTS = [RoomEvent.ParticipantNameChanged, RoomEvent.ParticipantMetadataChanged];

function FollowHostChip({ changed, onFollow }: { changed: boolean; onFollow: () => void }) {
  return (
    <div data-testid="follow-host-chip" data-changed={changed} className="m-1 flex shrink-0 items-center gap-2 self-start rounded-full border bg-muted px-3 py-0.5 text-xs">
      <span>{changed ? STAGE_LABELS.hostLayoutChanged : STAGE_LABELS.ownLayout}</span>
      <span aria-hidden>·</span>
      <Button type="button" size="xs" variant="secondary" onClick={onFollow}>
        {STAGE_LABELS.followHost}
      </Button>
    </div>
  );
}

export function Stage({ room, layout, editable, onCommit, tileActions }: {
  room: Room;
  layout: LayoutState | null;
  /** Boleh mengedit layout bersama (dihitung pemanggil dari peran + stage mode). */
  editable: boolean;
  onCommit: (next: LayoutState) => void;
  /** Item menu tambahan per tile (mis. "Request to show"). */
  tileActions?: TileActions;
}) {
  // onlySubscribed false: publikasi yang belum ter-subscribe tetap mengisi slot (bukan dianggap kosong).
  const tracks = useTracks(SOURCES, { room, onlySubscribed: false });
  const remotes = useRemoteParticipants({ room, updateOnlyOn: PARTICIPANT_EVENTS });
  const people = useMemo(() => [room.localParticipant, ...remotes], [room, remotes]);
  // Peserta yang bisa publish tanpa kamera tetap punya tile avatar (QA-01).
  const avatars = useMemo(() => avatarRefs(people, tracks), [people, tracks]);
  const sharedEffective = useMemo(() => sharedEffectiveLayout(layout, tracks, avatars), [layout, tracks, avatars]);
  const by = room.localParticipant.identity;
  const { actions, localStage, followHost, local, editError } = useStageActions({ by, layout, sharedEffective, editable, onCommit });
  const shown = localStage?.local ?? layout;
  const split = useMemo(
    () => splitStage(shown, tracks, avatars, shown ?? sharedEffective),
    [shown, tracks, avatars, sharedEffective],
  );
  const prefs = useViewPrefs();
  const scene = sceneOf(prefs.view, split.hasContent, shown !== null);
  // Nama terakhir per identity selama sesi: slot peserta yang keluar tetap bernama (QA-03).
  const knownNames = useRef(new Map<string, string>()).current;
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

  const ctx = useMemo<StageCtx>(() => {
    rememberNames(knownNames, people);
    return {
      actions,
      local,
      tileActions,
      template: split.effective.template,
      slotCount: split.effective.slots.length,
      expanded: expandedTrack ? expandedKey : null,
      setExpanded,
      who: (identity) => ({
        person: personOf(identity, people, by, knownNames),
        participant: people.find((p) => p.identity === identity),
      }),
    };
  }, [actions, local, tileActions, split.effective, expandedKey, expandedTrack, people, knownNames, by]);

  const onDragEnd = (event: DragEndEvent) => {
    if (event.canceled) return;
    const src = event.operation.source?.data as DragData | undefined;
    const dst = event.operation.target?.data as DropData | undefined;
    if (!src || !dst) return;
    if ("cell" in dst) {
      const ref = src.kind === "slot" ? split.effective.slots[src.index]?.trackRef : src.ref;
      const current = split.effective.grid?.cells[dst.cell]?.trackRef;
      if (ref && (!current || keyOf(current) !== keyOf(ref))) actions.placeCell(dst.cell, ref);
    } else if (src.kind === "slot") {
      if (src.index !== dst.index) actions.swap(src.index, dst.index);
    } else {
      actions.place(dst.index, src.ref);
    }
  };

  const expandedView = expandedTrack && (
    <div data-testid="tile-expanded" className="flex min-h-0 flex-1 flex-col gap-1 p-1">
      <Button type="button" size="sm" variant="secondary" className="self-start" onClick={() => setExpanded(null)}>
        <Minimize2 />
        {STAGE_LABELS.backToLayout}
      </Button>
      <div className="min-h-0 flex-1">
        <TileView
          trackRef={refOf(expandedTrack)}
          track={expandedTrack}
          slotIndex={split.slots.find((s) => s.track === expandedTrack)?.index ?? null}
        />
      </div>
    </div>
  );

  const strip = (items: ExtraItem<TrackReference>[]) =>
    prefs.strip !== "hidden" && showStrip(prefs.view, scene, prefs.strip, items.length) && <PeopleStrip items={items} position={prefs.strip} />;
  const main =
    scene === "gallery" ? (
      <PeopleGrid items={split.everyone} />
    ) : scene === "speaker" ? (
      <SpeakerView room={room} items={split.everyone}>{strip}</SpeakerView>
    ) : (
      <>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">
            <TemplateView layout={split.effective} slots={split.slots} />
          </div>
          {split.screens.length > 0 && <OthersStrip extras={split.screens} />}
        </div>
        {strip(split.people)}
      </>
    );

  return (
    <StageContext.Provider value={ctx}>
      <DragDropProvider onDragEnd={onDragEnd}>
        <div data-testid="stage" data-template={shown ? shown.template : "auto"} data-view={scene} className="flex h-full w-full flex-col">
          {localStage && <FollowHostChip changed={hostChanged(localStage, sharedVersion(layout))} onFollow={followHost} />}
          {scene === "stage" && !expandedView && <StageToolbar template={split.effective.template} onSelect={actions.setTemplate} />}
          {!layout && editable && <p className="shrink-0 px-2 text-xs text-muted-foreground">{STAGE_LABELS.autoLayout}</p>}
          {editError && (
            <p role="alert" className="shrink-0 px-2 text-xs text-destructive">
              {editError}
            </p>
          )}
          {expandedView || <div className={cn("flex min-h-0 flex-1", prefs.strip === "bottom" ? "flex-col" : "flex-row")}>{main}</div>}
        </div>
      </DragDropProvider>
    </StageContext.Provider>
  );
}
