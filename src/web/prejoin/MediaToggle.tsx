import { AlertTriangle, Mic, MicOff, Video, VideoOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toggleState, type MediaKind } from "./prejoin.labels";

const ICON = { camera: [Video, VideoOff], mic: [Mic, MicOff] } as const;

/** Tombol bulat mic/kamera di atas preview: netral saat nyala, merah saat mati/bermasalah. */
export function MediaToggle(props: { kind: MediaKind; enabled: boolean; failed: boolean; disabled?: boolean; onToggle: () => void }) {
  const { kind, enabled, failed, disabled, onToggle } = props;
  const s = toggleState(kind, enabled, failed);
  const [On, Off] = ICON[kind];
  return (
    <Button
      type="button"
      size="icon-lg"
      data-testid={`prejoin-toggle-${kind}`}
      data-tone={s.tone}
      aria-pressed={s.pressed}
      aria-label={s.label}
      title={s.label}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "relative size-12 rounded-full border shadow-md [&_svg:not([class*='size-'])]:size-5",
        s.tone === "on"
          ? "border-white/30 bg-white/15 text-white backdrop-blur hover:bg-white/25"
          : "border-transparent bg-destructive text-white hover:bg-destructive/90",
      )}
    >
      {s.tone === "on" ? <On /> : <Off />}
      {s.tone === "blocked" && (
        <AlertTriangle aria-hidden className="absolute -top-1 -right-1 size-4 rounded-full bg-amber-400 p-0.5 text-black" />
      )}
    </Button>
  );
}
