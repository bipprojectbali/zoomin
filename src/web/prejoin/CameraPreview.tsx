import type { LocalVideoTrack } from "livekit-client";
import { VideoOff } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { PREJOIN_TEXT } from "./prejoin.labels";

/** Preview kamera sendiri (mirror) 16:9 dengan slot kontrol di bawah tengah. */
export function CameraPreview({ track, loading, children }: { track: LocalVideoTrack | null; loading: boolean; children: ReactNode }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!track || !el) return;
    track.attach(el);
    return () => void track.detach(el);
  }, [track]);

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-neutral-900 text-white shadow-sm">
      {track ? (
        <video ref={videoRef} muted playsInline autoPlay className="size-full -scale-x-100 object-cover" />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-2 text-sm text-white/70" role="status">
          <VideoOff aria-hidden className="size-8" />
          {loading ? PREJOIN_TEXT.cameraLoading : PREJOIN_TEXT.cameraOffPreview}
        </div>
      )}
      <div className="absolute inset-x-0 bottom-3 flex justify-center gap-3">{children}</div>
    </div>
  );
}
