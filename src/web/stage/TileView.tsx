/** Tile stage ala Meet/Zoom: video/avatar, label bawah-kiri, indikator bicara/mic, toolbar hover (drag + menu ⋯). */
import type { TrackReference } from "@livekit/components-react";
import { Track } from "livekit-client";
import { Expand, GripVertical, Maximize, Minimize2 } from "lucide-react";
import { useCallback, useRef } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { TrackRef } from "../../shared/layout.model";
import { parseTrackName } from "../../shared/track.naming";
import { useStage } from "./stage.context";
import { STAGE_LABELS } from "./stage.labels";
import { keyOf } from "./stage.resolve";
import { kindLabel, shouldMirror, tileTitle } from "./stage.tile.logic";
import { TileMenu, type TileMenuItem } from "./TileMenu";
import { MicOffBadge, SpeakingRing, TileAvatar, TileMedia } from "./TileParts";

/** Ref & state dnd-kit untuk tile admin; handleRef = tombol seret terpisah (bukan seluruh tile, UX-16). */
export type TileDrag = {
  ref?: (el: Element | null) => void;
  handleRef?: (el: Element | null) => void;
  isDragging?: boolean;
  isDropTarget?: boolean;
};

// Toolbar muncul saat hover/focus-within/menu terbuka; perangkat sentuh (tanpa hover) selalu tampil (UX-21).
const TOOLBAR_VISIBILITY =
  "opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 has-[[data-state=open]]:opacity-100 [@media(hover:none)]:opacity-100";

export function TileView({ trackRef, track, slotIndex, adminItems = [], drag, badge }: {
  trackRef: TrackRef;
  track: TrackReference | null;
  slotIndex: number | null;
  adminItems?: TileMenuItem[];
  drag?: TileDrag;
  badge?: string;
}) {
  const { who, expanded, setExpanded } = useStage();
  const { person, participant } = who(trackRef.identity);
  const title = tileTitle(person, trackRef.trackName);
  const key = keyOf(trackRef);
  const isCamera = track ? track.source === Track.Source.Camera : parseTrackName(trackRef.trackName)?.kind === "camera";

  const root = useRef<HTMLDivElement | null>(null);
  const dragRef = drag?.ref;
  const setRoot = useCallback(
    (el: HTMLDivElement | null) => {
      root.current = el;
      dragRef?.(el);
    },
    [dragRef],
  );

  const toggleExpand = () => setExpanded(expanded === key ? null : key);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch((e) => console.error(`[stage] exitFullscreen tile=${key} gagal`, e));
      return;
    }
    root.current?.requestFullscreen().catch((e) => {
      console.error(`[stage] requestFullscreen tile=${key} gagal`, e);
      toast.error(STAGE_LABELS.fullscreenFailed);
    });
  };
  const localItems: TileMenuItem[] = track
    ? [
        expanded === key
          ? { label: STAGE_LABELS.backToLayout, icon: Minimize2, onSelect: toggleExpand }
          : { label: STAGE_LABELS.expand, icon: Expand, onSelect: toggleExpand },
        ...(document.fullscreenEnabled ? [{ label: STAGE_LABELS.fullscreen, icon: Maximize, onSelect: toggleFullscreen }] : []),
      ]
    : [];

  const inactiveStatus = person.present && isCamera ? STAGE_LABELS.cameraOff : `${kindLabel(trackRef.trackName)} · ${STAGE_LABELS.inactive}`;
  const avatar = <TileAvatar name={person.name} status={track ? STAGE_LABELS.cameraOff : inactiveStatus} />;

  return (
    <div
      ref={setRoot}
      data-testid="stage-tile"
      data-identity={trackRef.identity}
      data-track-name={trackRef.trackName}
      data-slot-index={slotIndex ?? ""}
      data-state={track ? "active" : "inactive"}
      aria-label={title}
      role="group"
      onDoubleClick={track ? toggleExpand : undefined}
      className={cn(
        "group relative h-full w-full overflow-hidden rounded-xl bg-muted [&:fullscreen]:rounded-none [&:fullscreen]:bg-black",
        drag?.isDragging && "opacity-50",
      )}
    >
      {track ? (
        <TileMedia key={track.publication.trackSid} track={track} mirror={shouldMirror(track.source, person.isLocal)} fallback={avatar} />
      ) : (
        avatar
      )}
      {participant && isCamera && <SpeakingRing participant={participant} />}
      <div className="absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] items-center gap-1.5 rounded-md bg-black/60 px-2 py-0.5 text-xs text-white">
        {participant && isCamera && <MicOffBadge participant={participant} />}
        <span className="truncate">{title}</span>
        {badge && <span className="shrink-0 rounded bg-primary px-1 text-[10px] text-primary-foreground">{badge}</span>}
      </div>
      <div className={cn("absolute top-2 right-2 flex gap-0.5 rounded-md bg-black/50 p-0.5 backdrop-blur-sm", TOOLBAR_VISIBILITY)}>
        {drag?.handleRef && (
          <button
            type="button"
            ref={drag.handleRef}
            aria-label={STAGE_LABELS.dragHandle(title)}
            className="flex size-6 cursor-grab items-center justify-center rounded-md text-white hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <GripVertical className="size-3.5" />
          </button>
        )}
        <TileMenu title={title} groups={[adminItems, localItems]} />
      </div>
      {drag?.isDropTarget && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl border-4 border-dashed border-primary bg-primary/20 text-sm font-medium text-white">
          {STAGE_LABELS.dropHere}
        </div>
      )}
    </div>
  );
}
