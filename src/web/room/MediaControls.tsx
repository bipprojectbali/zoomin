import { RoomEvent, type Room } from "livekit-client";
import { Mic, MicOff, Video, VideoOff } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/error.message";
import { CAMERA_TRACK, MIC_TRACK } from "../../shared/track.naming";

const TEXT = {
  cameraOn: "Matikan kamera",
  cameraOff: "Nyalakan kamera",
  micOn: "Matikan mikrofon",
  micOff: "Nyalakan mikrofon",
  camera: "Kamera",
  mic: "Mikrofon",
  groupLabel: "Kontrol kamera dan mikrofon",
};

type Device = "camera" | "mic";

const LOCAL_TRACK_EVENTS = [
  RoomEvent.LocalTrackPublished,
  RoomEvent.LocalTrackUnpublished,
  RoomEvent.TrackMuted,
  RoomEvent.TrackUnmuted,
] as const;

/**
 * Toggle kamera & mikrofon dengan nama track konvensi (`camera`/`mic`).
 * Jangan render untuk viewer: penolakan publish oleh server baru datang setelah timeout.
 */
export function MediaControls({ room }: { room: Room }) {
  const lp = room.localParticipant;
  const [enabled, setEnabled] = useState({ camera: lp.isCameraEnabled, mic: lp.isMicrophoneEnabled });
  const [pending, setPending] = useState<Device | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => setEnabled({ camera: lp.isCameraEnabled, mic: lp.isMicrophoneEnabled });
    for (const ev of LOCAL_TRACK_EVENTS) room.on(ev, sync);
    sync();
    return () => {
      for (const ev of LOCAL_TRACK_EVENTS) room.off(ev, sync);
    };
  }, [room, lp]);

  async function toggle(device: Device) {
    setPending(device);
    setError(null);
    const next = !enabled[device];
    try {
      // Nama track hanya berlaku saat publish pertama; berikutnya LiveKit cukup mute/unmute track yang sama.
      if (device === "camera") await lp.setCameraEnabled(next, undefined, { name: CAMERA_TRACK });
      else await lp.setMicrophoneEnabled(next, undefined, { name: MIC_TRACK });
    } catch (err) {
      console.error(`media: toggle ${device} → ${next} gagal`, err);
      setError(`${device === "camera" ? TEXT.camera : TEXT.mic}: ${errorMessage(err)}`);
    } finally {
      setPending(null);
      setEnabled({ camera: lp.isCameraEnabled, mic: lp.isMicrophoneEnabled });
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2" role="group" aria-label={TEXT.groupLabel}>
        <Button
          type="button"
          variant={enabled.camera ? "default" : "outline"}
          size="icon"
          aria-pressed={enabled.camera}
          aria-label={TEXT.camera}
          title={enabled.camera ? TEXT.cameraOn : TEXT.cameraOff}
          disabled={pending !== null}
          onClick={() => void toggle("camera")}
        >
          {enabled.camera ? <Video /> : <VideoOff />}
        </Button>
        <Button
          type="button"
          variant={enabled.mic ? "default" : "outline"}
          size="icon"
          aria-pressed={enabled.mic}
          aria-label={TEXT.mic}
          title={enabled.mic ? TEXT.micOn : TEXT.micOff}
          disabled={pending !== null}
          onClick={() => void toggle("mic")}
        >
          {enabled.mic ? <Mic /> : <MicOff />}
        </Button>
      </div>
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
