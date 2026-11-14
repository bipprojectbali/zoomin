import { ROOM_PASSWORD_MAX, ROOM_PASSWORD_MIN } from "../../shared/api.types";

/** Label UI room ber-password (RND/plan/08 W8). */
export const ROOM_PASSWORD_TEXT = {
  label: "Room password",
  hint: `${ROOM_PASSWORD_MIN}–${ROOM_PASSWORD_MAX} characters. Keep it safe: the password can't be viewed again after saving.`,
  show: "Show password",
  hide: "Hide password",
  generate: "Generate",
  copy: "Copy password",
  copied: "Password copied",
  copyFailed: "Couldn't copy. Copy it manually from the field.",
  change: "Change password",
  cancelChange: "Cancel password change",
  onceTitle: "Save the room password",
  onceBody: "Share this password along with the link or room ID. It can't be viewed again after you close this dialog.",
  onceClose: "I've saved it",
  clearConfirmTitle: "Remove the room password?",
  clearConfirmPublic: "The password is removed. Anyone with the invite link can join without a password.",
  clearConfirmPrivateExtra: "The password is also removed.",
  clearConfirmSubmit: "Remove password",
  gateTitle: "This room is password protected",
  gateBody: "Enter the password from the room host to join. Once accepted, you become a member of this room.",
  gateSubmit: "Join",
  gateSubmitting: "Checking…",
  gateBack: "Back to lobby",
} as const;
