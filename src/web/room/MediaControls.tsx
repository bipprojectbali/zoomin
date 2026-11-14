import { RoomEvent, type Room } from "livekit-client";
import { Mic, MicOff, Video, VideoOff } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/error.message";
import { CAMERA_TRACK, MIC_TRACK } from "../../shared/track.naming";
import { ControlTooltip } from "./ControlTooltip";
import { DeviceMenu } from "./DeviceMenu";
import { logMediaFailure } from "./room.connection";
import { ROOM_LABELS, toggleState } from "./room.labels";
import { IS_MAC, shortcutLabel, useRoomShortcuts } from "./room.shortcuts";

type Device = "camera" | "mic";

const LOCAL_TRACK_EVENTS = [
  RoomEvent.LocalTrackPublished,
  RoomEvent.LocalTrackUnpublished,
  RoomEvent.TrackMuted,
  RoomEvent.TrackUnmuted,
] as const;

const MIC_GROUPS = [
  { kind: "audioinput" as const, title: ROOM_LABELS.micDevices },
  { kind: "audiooutput" as const, title: ROOM_LABELS.speakerDevices },
];
const CAMERA_GROUPS = [{ kind: "videoinput" as const, title: ROOM_LABELS.cameraDevices }];

/**
 * Toggle mikrofon & kamera (nama track `mic`/`camera`) + pilih perangkat + shortcut Ctrl/⌘+D/E.
 * Jangan render untuk viewer: penolakan publish oleh server baru datang setelah timeout.
 */
export function MediaControls({ room, disabled }: { room: Room; disabled: boolean }) {
  const lp = room.localParticipant;
  const [enabled, setEnabled] = useState({ camera: lp.isCameraEnabled, mic: lp.isMicrophoneEnabled });
  const [pending, setPending] = useState<Device | null>(null);

  useEffect(() => {
    const sync = () => setEnabled({ camera: lp.isCameraEnabled, mic: lp.isMicrophoneEnabled });
    for (const ev of LOCAL_TRACK_EVENTS) room.on(ev, sync);
    sync();
    return () => {
      for (const ev of LOCAL_TRACK_EVENTS) room.off(ev, sync);
    };
  }, [room, lp]);

  async function toggle(device: Device) {
    if (pending) return;
    setPending(device);
    const next = !enabled[device];
    try {
      // Nama track hanya berlaku saat publish pertama; berikutnya LiveKit cukup mute/unmute track yang sama.
      if (device === "camera") await lp.setCameraEnabled(next, undefined, { name: CAMERA_TRACK });
      else await lp.setMicrophoneEnabled(next, undefined, { name: MIC_TRACK });
    } catch (err) {
      logMediaFailure(`media: toggle ${device} → ${next} gagal`, err);
      toast.error(`${device === "camera" ? ROOM_LABELS.camera : ROOM_LABELS.mic}: ${errorMessage(err)}`);
    } finally {
      setPending(null);
      setEnabled({ camera: lp.isCameraEnabled, mic: lp.isMicrophoneEnabled });
    }
  }

  useRoomShortcuts({ mic: () => void toggle("mic"), camera: () => void toggle("camera") }, !disabled);

  return (
    <>
      <MediaToggle
        device="mic"
        enabled={enabled.mic}
        busy={disabled || pending !== null}
        onToggle={() => void toggle("mic")}
        menu={<DeviceMenu room={room} label={ROOM_LABELS.chooseMic} groups={MIC_GROUPS} disabled={disabled} testId="mic-devices" />}
      />
      <MediaToggle
        device="camera"
        enabled={enabled.camera}
        busy={disabled || pending !== null}
        onToggle={() => void toggle("camera")}
        menu={<DeviceMenu room={room} label={ROOM_LABELS.chooseCamera} groups={CAMERA_GROUPS} disabled={disabled} testId="camera-devices" />}
      />
    </>
  );
}

function MediaToggle({ device, enabled, busy, onToggle, menu }: {
  device: Device;
  enabled: boolean;
  busy: boolean;
  onToggle: () => void;
  menu: ReactNode;
}) {
  const s = toggleState(device, enabled, busy);
  const Icon = device === "mic" ? (enabled ? Mic : MicOff) : enabled ? Video : VideoOff;
  return (
    <div className="flex items-center rounded-full bg-muted/60 pr-1">
      <ControlTooltip label={s.label} shortcut={shortcutLabel(device, IS_MAC)}>
        <Button
          type="button"
          variant={s.variant}
          size="icon-lg"
          className="rounded-full"
          aria-pressed={s.pressed}
          aria-label={device === "mic" ? ROOM_LABELS.mic : ROOM_LABELS.camera}
          aria-keyshortcuts={device === "mic" ? "Control+D Meta+D" : "Control+E Meta+E"}
          disabled={s.disabled}
          onClick={onToggle}
          data-testid={device === "mic" ? "toggle-mic" : "toggle-camera"}
        >
          <Icon />
        </Button>
      </ControlTooltip>
      {menu}
    </div>
  );
}
