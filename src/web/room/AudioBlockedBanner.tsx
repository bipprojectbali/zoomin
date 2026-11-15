import { useAudioPlayback } from "@livekit/components-react";
import type { Room } from "livekit-client";
import { VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ROOM_LABELS } from "./room.labels";

/** Autoplay diblokir (UX-10): ajakan mencolok di atas stage; klik = gesture yang membuka audio. */
export function AudioBlockedBanner({ room }: { room: Room }) {
  const { canPlayAudio, startAudio } = useAudioPlayback(room);
  if (canPlayAudio) return null;
  return (
    <div className="absolute inset-x-0 top-3 z-20 flex justify-center px-3">
      <Button
        type="button"
        size="lg"
        className="rounded-full shadow-lg"
        // Masih diblokir walau sudah diklik = kebijakan browser, bukan bug → warn; banner tetap tampil.
        onClick={() => startAudio().catch((err: unknown) => console.warn("room: startAudio ditolak", err))}
        data-testid="start-audio"
      >
        <VolumeX />
        {ROOM_LABELS.audioBlocked} · {ROOM_LABELS.audioStart}
      </Button>
    </div>
  );
}
