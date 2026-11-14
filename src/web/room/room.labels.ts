/** Label UI shell room (header, control bar, dialog) terpusat + pemetaan state tombol. */
import { ConnectionQuality } from "livekit-client";
import { parseTrackName } from "../../shared/track.naming";
import type { ConnectionStatus } from "./room.connection";
import type { RoomStatusKind } from "./RoomStatusScreen";

export const ROOM_LABELS = {
  mic: "Microphone",
  camera: "Camera",
  micOn: "Turn off microphone",
  micOff: "Turn on microphone",
  cameraOn: "Turn off camera",
  cameraOff: "Turn on camera",
  chooseMic: "Choose microphone & speaker",
  chooseCamera: "Choose camera",
  micDevices: "Microphone",
  speakerDevices: "Speaker",
  cameraDevices: "Camera",
  noDevices: "No devices",
  device: (n: number) => `Device ${n}`,
  deviceFailed: "Couldn't switch device",
  share: "Share screen",
  shareCount: (n: number) => `Share screen (${n} active)`,
  addScreen: "Add screen",
  picking: "Choosing screen…",
  stop: "Stop",
  stopScreen: (label: string) => `Stop ${label}`,
  activeScreens: "Active screens",
  shareFailed: "Couldn't share screen",
  noScreenAudio: "Screen audio isn't shared. Audio is only available in Chrome/Edge when sharing a tab.",
  participants: (n: number) => `Participants (${n})`,
  invite: "Invite",
  inviteTitle: "Invite to room",
  inviteDescription: "Create an invite link for a role, then copy and send it.",
  more: "More",
  leave: "Leave",
  leaveTitle: "Leave the room?",
  leaveDescription: "Your camera, microphone, and shared screens will stop.",
  leaveConfirm: "Leave",
  cancel: "Cancel",
  controls: "Room controls",
  audioBlocked: "Audio blocked by the browser",
  audioStart: "Click to enable audio",
  loading: "Loading room…",
  joinAs: (role: string) => `You'll join as ${role}`,
  status: {
    idle: "Not joined",
    connecting: "Connecting…",
    connected: "Connected",
    reconnecting: "Reconnecting…",
    disconnected: "Disconnected",
    left: "Left",
    error: "Couldn't join",
  } satisfies Record<ConnectionStatus, string>,
} as const;

/** Label layar konsisten dengan tile stage: `screen-2` → "Layar 2"; nama di luar konvensi apa adanya. */
export function screenLabel(trackName: string): string {
  const parsed = parseTrackName(trackName);
  return parsed?.kind === "screen" ? `Screen ${parsed.index}` : trackName;
}

export type ToggleState = {
  pressed: boolean;
  variant: "secondary" | "destructive";
  label: string;
  disabled: boolean;
};

/** State tombol mic/kamera: nyala = netral, mati = merah (pola Meet/Zoom); label = aksi berikutnya. */
export function toggleState(device: "mic" | "camera", enabled: boolean, busy: boolean): ToggleState {
  const L = ROOM_LABELS;
  const label = device === "mic" ? (enabled ? L.micOn : L.micOff) : enabled ? L.cameraOn : L.cameraOff;
  return { pressed: enabled, variant: enabled ? "secondary" : "destructive", label, disabled: busy };
}

/** Label perangkat; sebelum izin media browser memberi label kosong → "Perangkat N". */
export function deviceLabel(device: Pick<MediaDeviceInfo, "label">, index: number): string {
  return device.label || ROOM_LABELS.device(index + 1);
}

/** Layar status room: keluar, terputus, gagal bergabung, sesi ganda. */
export const ROOM_STATUS_TEXT = {
  title: {
    left: "You left the room",
    disconnected: "You were disconnected from the room",
    error: "Couldn't join the room",
  } satisfies Record<RoomStatusKind, string>,
  duplicateTitle: "Room open in another tab",
  leftHint: "Left by accident? You can join again.",
  duplicateHint: "Using the room in this tab will close it in the other tab or device.",
  noRetryHint: "Go back to the lobby to pick another room.",
  rejoin: "Join again",
  reconnect: "Reconnect",
  useHere: "Use in this tab",
  retry: "Try again",
  lobby: "Back to lobby",
};

/** Panel daftar peserta. */
export const PARTICIPANTS_TEXT = {
  title: (n: number) => `Participants (${n})`,
  description: "Everyone in this room, including viewers and people without a camera.",
  you: "(you)",
  speaking: "Speaking",
  micOn: "Microphone on",
  micOff: "Microphone off",
  screens: (n: number) => `Sharing ${n} ${n === 1 ? "screen" : "screens"}`,
  quality: {
    [ConnectionQuality.Excellent]: "Excellent connection",
    [ConnectionQuality.Good]: "Good connection",
    [ConnectionQuality.Poor]: "Poor connection",
    [ConnectionQuality.Lost]: "Connection lost",
    [ConnectionQuality.Unknown]: "Connection quality unknown",
  } satisfies Record<ConnectionQuality, string>,
};
