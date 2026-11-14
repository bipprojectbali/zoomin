/** Bagian visual tile: video + skeleton, avatar inisial, indikator bicara & mic mati. */
import { useIsMuted, useIsSpeaking, VideoTrack, type TrackReference } from "@livekit/components-react";
import { Track, type Participant } from "livekit-client";
import { CircleSlash, MicOff, MonitorUp, UserRound, VideoOff } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { STAGE_LABELS } from "./stage.labels";
import { initialsOf } from "./stage.tile.logic";

// Tile kecil (QA-04): root tile = size container; di bawah ROOMY cukup avatar karena nama & status sudah ada di label.
// Tinggi ikut diukur: tile strip bisa cukup lebar tapi pendek. Kelas ditulis utuh agar terdeteksi Tailwind.
const ROOMY_ONLY = "hidden [@container(min-width:200px)_and_(min-height:150px)]:block";
const SMALL_ONLY = "flex [@container(min-width:200px)_and_(min-height:150px)]:hidden";
const AVATAR_SIZE = "size-10 [@container(min-width:200px)_and_(min-height:150px)]:size-12 [@container(min-width:320px)_and_(min-height:220px)]:size-20";

/** Avatar foto profil (fallback inisial; peserta keluar: ikon netral) + nama & status di tile yang cukup lebar. */
export function TileAvatar({ name, status, left, image }: { name: string; status?: string; left?: boolean; image?: string | null }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-2 pb-8 text-center">
      <Avatar className={AVATAR_SIZE}>
        {image && !left && <AvatarImage src={image} alt={name} referrerPolicy="no-referrer" loading="lazy" className="object-cover" />}
        <AvatarFallback className="bg-primary/15 text-base font-semibold [@container(min-width:320px)_and_(min-height:220px)]:text-2xl">
          {left ? <UserRound aria-hidden className="size-1/2 text-muted-foreground" /> : initialsOf(name)}
        </AvatarFallback>
      </Avatar>
      <span className={cn("max-w-full truncate text-sm font-medium", ROOMY_ONLY)}>{name}</span>
      {status && <span className={cn("max-w-full truncate text-xs text-muted-foreground", ROOMY_ONLY)}>{status}</span>}
    </div>
  );
}

/** Layar milik sendiri tidak dirender sebagai video untuk pemiliknya (hindari efek cermin, QA-02). */
export function OwnScreenNotice({ text }: { text: string }) {
  return (
    <div data-testid="own-screen-notice" className="flex h-full w-full flex-col items-center justify-center gap-2 p-2 pb-8 text-center">
      <MonitorUp aria-hidden className="size-8 text-primary [@container(min-width:320px)_and_(min-height:220px)]:size-12" />
      <span className={cn("max-w-full text-sm font-medium", ROOMY_ONLY)}>{text}</span>
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

/** Status di label untuk tile kecil: ikon + tooltip, karena teks status di avatar disembunyikan (QA-04). */
export function StatusIcon({ text, cameraOff }: { text: string; cameraOff: boolean }) {
  const Icon = cameraOff ? VideoOff : CircleSlash;
  return (
    <span title={text} role="img" aria-label={text} className={cn("shrink-0", SMALL_ONLY)}>
      <Icon className="size-3.5" />
    </span>
  );
}

/** StatusIcon "Kamera mati" untuk publikasi kamera yang di-mute (hook butuh track nyata). */
export function CameraMutedIcon({ track }: { track: TrackReference }) {
  const muted = useIsMuted(track);
  return muted ? <StatusIcon text={STAGE_LABELS.cameraOff} cameraOff /> : null;
}
