import { ROLE_LABEL } from "@/role.label";
import { formatDateTime } from "@/lobby/lobby.format";
import type { RoomRole } from "../../shared/api.types";

/** Semua label UI pre-join & undangan (terpusat). */
export const PREJOIN_TEXT = {
  ready: "Ready to join?",
  join: "Join now",
  joining: "Connecting…",
  name: "Display name",
  namePlaceholder: "Your name",
  viewerInfo: "You're joining as a viewer. Camera and microphone aren't used.",
  cameraOffPreview: "Camera is off",
  cameraLoading: "Starting camera…",
  camera: "Camera",
  mic: "Microphone",
  speaker: "Speaker",
  defaultDevice: "System default",
  micLevel: "Microphone level",
  toggles: "Camera and microphone controls",
  turnOn: { camera: "Turn on camera", mic: "Turn on microphone" },
  turnOff: { camera: "Turn off camera", mic: "Turn off microphone" },
  unavailable: { camera: "Camera unavailable, click to turn off", mic: "Microphone unavailable, click to turn off" },
  noDeviceHint: "You can still join without a camera or microphone.",
  permissionHint: "After granting permission, reload this page.",
  reload: "Reload",
  back: "Back to lobby",
} as const;

export type MediaKind = "camera" | "mic";

/** Subtitle peran: "Anda akan masuk sebagai Peserta". */
export const roleSubtitle = (role: RoomRole) => `You'll join as ${ROLE_LABEL[role]}`;

/** Visual tombol toggle bulat: on = netral, off = merah, blocked = merah + badge peringatan. */
export type ToggleTone = "on" | "off" | "blocked";

/** Pemetaan state toggle → aria-pressed, label aksi, dan tone. */
export function toggleState(kind: MediaKind, enabled: boolean, failed: boolean) {
  const tone: ToggleTone = enabled ? (failed ? "blocked" : "on") : "off";
  const label = tone === "blocked" ? PREJOIN_TEXT.unavailable[kind] : enabled ? PREJOIN_TEXT.turnOff[kind] : PREJOIN_TEXT.turnOn[kind];
  return { pressed: enabled && !failed, tone, label };
}

/** State tombol gabung: nonaktif saat proses atau nama wajib masih kosong. */
export function joinButtonState(busy: boolean, askName: boolean, name: string) {
  return {
    disabled: busy || (askName && !name.trim()),
    label: busy ? PREJOIN_TEXT.joining : PREJOIN_TEXT.join,
  };
}

/** Subtitle halaman undangan; bersesi → sebut identitas yang dipakai (UX-08). */
export function inviteSubtitle(p: { effectiveRole: RoomRole; currentUser: { name: string } | null }) {
  return p.currentUser
    ? `You'll join as ${p.currentUser.name} (${ROLE_LABEL[p.effectiveRole]})`
    : roleSubtitle(p.effectiveRole);
}

/** Catatan bila peran undangan lebih rendah dari peran yang sudah dimiliki; null bila sama. */
export function roleKeptNote(p: { role: RoomRole; effectiveRole: RoomRole }) {
  return p.role === p.effectiveRole
    ? null
    : `This invite is for ${ROLE_LABEL[p.role]}, but your role in this room stays ${ROLE_LABEL[p.effectiveRole]} (roles are never downgraded).`;
}

/** Label halaman undangan (`/invite/:token`). */
export const INVITE_PAGE_TEXT = {
  loading: "Checking invite…",
  invalidTitle: "This invite can't be used",
  invalidHelp: "The link may be mistyped or expired, or the room was deleted. Ask the room host for a new invite link.",
  loadFailedTitle: "Couldn't load the invite",
  retry: "Try again",
  home: "Back to lobby",
  notYou: "Not you?",
  logout: "Switch account",
  invitedTo: "You're invited to the room",
  asRole: "Role",
  expires: (at: number) => `Valid until ${formatDateTime(at)}`,
  signInHelp: "Sign in with your Google account to join. After signing in, you'll come back to this page.",
  signIn: "Sign in with Google to join",
  redirecting: "Redirecting to Google…",
  signedInAs: (name: string, email: string) => `Signed in as ${name} (${email})`,
} as const;
