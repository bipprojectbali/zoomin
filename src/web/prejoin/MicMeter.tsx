import { useTrackVolume } from "@livekit/components-react";
import type { LocalAudioTrack } from "livekit-client";
import { PREJOIN_TEXT } from "./prejoin.labels";

const BARS = 8;

/** Meter level mic sederhana (bar bertingkat) dari track preview. */
export function MicMeter({ track }: { track: LocalAudioTrack | null }) {
  const volume = useTrackVolume(track ?? undefined);
  // Volume ucapan biasa jarang > 0.5; skala ×2 supaya meter terasa responsif.
  const lit = track ? Math.min(BARS, Math.round(volume * 2 * BARS)) : 0;
  return (
    <div
      role="meter"
      aria-label={PREJOIN_TEXT.micLevel}
      aria-valuemin={0}
      aria-valuemax={BARS}
      aria-valuenow={lit}
      className="flex h-4 items-end gap-0.5"
    >
      {Array.from({ length: BARS }, (_, i) => (
        <span
          key={i}
          className={i < lit ? "w-1 rounded-sm bg-emerald-500" : "w-1 rounded-sm bg-muted-foreground/30"}
          style={{ height: `${30 + (i * 70) / (BARS - 1)}%` }}
        />
      ))}
    </div>
  );
}
