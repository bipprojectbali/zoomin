/** Bagian visual tile: video + skeleton, avatar inisial, indikator bicara & mic mati. */
import { useIsMuted, useIsSpeaking, VideoTrack, type TrackReference } from "@livekit/components-react";
import { Track, type Participant } from "livekit-client";
import { MicOff } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { STAGE_LABELS } from "./stage.labels";
import { initialsOf } from "./stage.tile.logic";

/** Avatar inisial besar + nama (+ status) untuk kamera mati / slot tidak aktif. */
export function TileAvatar({ name, status }: { name: string; status?: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-2 text-center">
      <Avatar className="size-12 sm:size-20">
        <AvatarFallback className="bg-primary/15 text-lg font-semibold sm:text-2xl">{initialsOf(name)}</AvatarFallback>
      </Avatar>
      <span className="max-w-full truncate text-sm font-medium">{name}</span>
      {status && <span className="text-xs text-muted-foreground">{status}</span>}
    </div>
  );
}

/**
 * Video track; kamera yang di-mute → fallback (avatar). Skeleton tampil sampai frame pertama tiba (UX-27).
 * Parent memberi key per track agar state `ready` reset saat track berganti.
 */
export function TileMedia({ track, mirror, fallback }: { track: TrackReference; mirror: boolean; fallback: ReactNode }) {
  const muted = useIsMuted(track);
  const [ready, setReady] = useState(false);
  if (muted && track.source === Track.Source.Camera) return fallback;
  const isScreen = track.source === Track.Source.ScreenShare;
  return (
    <>
      <VideoTrack
        trackRef={track}
        onLoadedData={() => setReady(true)}
        className={cn("h-full w-full", isScreen ? "object-contain" : "object-cover", mirror && "-scale-x-100")}
      />
      {!ready && (
        <Skeleton role="status" aria-label={STAGE_LABELS.loading} className="absolute inset-0 rounded-none bg-muted-foreground/15" />
      )}
    </>
  );
}

/** Border hijau saat peserta bicara (overlay, tidak menggeser layout). */
export function SpeakingRing({ participant }: { participant: Participant }) {
  const speaking = useIsSpeaking(participant);
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 rounded-xl transition-shadow",
        speaking && "shadow-[inset_0_0_0_3px_var(--color-green-500)]",
      )}
    />
  );
}

/** Ikon mic mati merah di label tile (UX-03). */
export function MicOffBadge({ participant }: { participant: Participant }) {
  const muted = useIsMuted({ participant, source: Track.Source.Microphone });
  if (!muted) return null;
  return (
    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-red-600" role="img" aria-label={STAGE_LABELS.micOff}>
      <MicOff className="size-3 text-white" />
    </span>
  );
}
