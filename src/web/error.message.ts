import type { ApiErrorCode } from "../shared/api.types";
import { ApiRequestError } from "./api.client";

/** Jenis perangkat untuk pesan error media. */
export type MediaKind = "camera" | "mic" | "screen";

const TEXT = {
  unknown: "Something went wrong. Try again.",
  network: "Can't reach the server. Check your internet connection and try again.",
  aborted: "The request was canceled. Try again.",
  server: "The server is having trouble. Try again in a moment.",
  conflict: "The data just changed. Reload the page and try again.",
  invalidField: (field: string) => `${field} is not valid. Check it and try again.`,
  device: "device",
} as const;

const CODE_TEXT: Record<ApiErrorCode, string> = {
  unauthorized: "Your session has ended. Sign in again, or reopen the invite link from the room host.",
  forbidden: "You don't have access to do this. Ask the room host for access.",
  not_found: "Not found. It may have been deleted.",
  room_not_found: "Room not found. It may have been deleted, or the link is wrong.",
  room_exists: "This room ID is already taken. Change the room ID under Advanced options.",
  invalid_input: "Some fields are not valid. Check them and try again.",
  invite_invalid: "This invite link is invalid or has expired. Ask the room host for a new one.",
  rate_limited: "Too many attempts. Wait a moment and try again.", // tanpa Retry-After; lihat rateLimitedText
  layout_conflict: "Another host just changed the layout. The view has been updated; please redo your change.",
  banned: "Your account has been banned by an admin. Contact your zoomin admin if you think this is a mistake.",
  email_domain_not_allowed: "This Google account's email domain is not allowed. Sign in with your work or organization Google account.",
  cannot_modify_self: "You can't change or delete your own account from here.",
  insufficient_role: "Your account role doesn't allow this action.",
  user_not_found: "Account not found. It may have been deleted.",
  room_inactive: "This room is inactive. Ask the room host to reactivate it.",
  room_expired: "This room has expired. Ask the room host to extend it.",
  room_private: "This is a private room: only people invited by email can join. Ask the room host to add your email.",
  last_host: "A room needs at least one host. Make another member a host first.",
  member_not_found: "Member or invitation not found. It may have been removed.",
  password_required: "This room is password-protected. Enter the password from the room host to join.",
  password_invalid: "Wrong room password. Check it or ask the room host for the password.",
  stage_locked: "Only the room host can change the stage right now.",
  stage_mode_mismatch: "Stage requests are not enabled in this room.",
  stage_request_not_found: "This stage request was already handled or has expired.",
};

/**
 * Kode error login dari Better Auth: `?error=<kode>` di /login (callback OAuth) atau `error.code` dari signIn.social.
 * Kunci huruf kecil (pencocokan case-insensitive).
 */
const AUTH_ERROR_TEXT: Record<string, string> = {
  email_domain_not_allowed: CODE_TEXT.email_domain_not_allowed,
  banned: CODE_TEXT.banned,
  banned_user: CODE_TEXT.banned,
  provider_not_found: "Google sign-in hasn't been configured by the server admin.",
  access_denied: "Sign-in was canceled. Click Continue with Google to try again.",
  state_mismatch: "The sign-in session expired or was opened in another tab. Try signing in again.",
  please_restart_the_process: "The sign-in session expired. Try signing in again.",
  unable_to_get_user_info: "Couldn't read your Google account. Try again in a moment.",
  unable_to_create_user: "Couldn't create the account. Contact your zoomin admin.",
  unable_to_create_session: "Couldn't create a session. Contact your zoomin admin if this keeps happening.",
  signup_disabled: "New sign-ups are currently closed. Contact your zoomin admin.",
  too_many_requests: CODE_TEXT.rate_limited,
};

/** Pesan English untuk kode error login Better Auth; kode tak dikenal → pesan umum yang menyebut kodenya. */
export function authErrorMessage(code: string): string {
  return AUTH_ERROR_TEXT[code.trim().toLowerCase()] ?? `Sign-in failed (${code}). Try again, or contact your zoomin admin.`;
}

/** Fallback per status HTTP bila server tidak mengirim `code`. */
const STATUS_TEXT: Record<number, string> = {
  400: CODE_TEXT.invalid_input,
  401: CODE_TEXT.unauthorized,
  403: CODE_TEXT.forbidden,
  404: CODE_TEXT.not_found,
  409: TEXT.conflict,
  429: CODE_TEXT.rate_limited,
};

/** Nama field (dari `ApiError.path`) yang ditampilkan ke user. */
const FIELD_LABEL: Record<string, string> = {
  id: "Room ID (letters, numbers, - or _, max 64 characters)",
  title: "Room title",
  name: "Name",
  role: "Role",
  invite: "Invite link",
  expiresAt: "Expiry date (max 365 days from now)",
  email: "Email",
};

const HTTP_SERVER_ERROR = 500;
const HTTP_TOO_MANY_REQUESTS = 429;
const SECONDS_PER_MINUTE = 60;

const plural = (count: number, unit: string) => `${count} ${unit}${count === 1 ? "" : "s"}`;

/** "…Try again in N minutes." (dibulatkan ke atas; <60 dtk → detik) dari `Retry-After`. */
export function rateLimitedText(retryAfterSeconds: number): string {
  const wait =
    retryAfterSeconds < SECONDS_PER_MINUTE
      ? plural(Math.max(1, Math.ceil(retryAfterSeconds)), "second")
      : plural(Math.ceil(retryAfterSeconds / SECONDS_PER_MINUTE), "minute");
  return `Too many attempts. Try again in ${wait}.`;
}

const KIND_NOUN: Record<MediaKind, string> = { camera: "camera", mic: "microphone", screen: "screen" };

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function errorName(err: unknown): string | null {
  if (err && typeof err === "object" && "name" in err && typeof err.name === "string") return err.name;
  return null;
}

const MEDIA_ERROR_NAMES = new Set([
  "NotAllowedError",
  "SecurityError",
  "PermissionDeniedError",
  "NotFoundError",
  "DevicesNotFoundError",
  "NotReadableError",
  "TrackStartError",
  "OverconstrainedError",
  "ConstraintNotSatisfiedError",
  "NotSupportedError",
]);

/** Pesan error yang layak ditampilkan ke user: kode/status API, jaringan, media, pesan Error, atau teks umum. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiRequestError) {
    if (err.code === "invalid_input" && err.path) {
      const label = FIELD_LABEL[err.path.replace(/^\//, "")];
      if (label) return TEXT.invalidField(label);
    }
    const limited = err.code === "rate_limited" || (!err.code && err.status === HTTP_TOO_MANY_REQUESTS);
    if (limited && err.retryAfterSeconds !== null) return rateLimitedText(err.retryAfterSeconds);
    if (err.code && err.code in CODE_TEXT) return CODE_TEXT[err.code];
    if (err.status >= HTTP_SERVER_ERROR) return TEXT.server;
    return STATUS_TEXT[err.status] ?? TEXT.unknown;
  }
  const name = errorName(err);
  if (name && MEDIA_ERROR_NAMES.has(name)) return mediaErrorMessage(err, null);
  if (name === "AbortError") return TEXT.aborted;
  // fetch() gagal di level jaringan melempar TypeError (bukan respons HTTP).
  if (err instanceof TypeError) return TEXT.network;
  if (err instanceof Error && err.message) return err.message;
  return TEXT.unknown;
}

/** Pesan error getUserMedia/getDisplayMedia beserta saran tindakan; `kind` null = perangkat umum. */
export function mediaErrorMessage(err: unknown, kind: MediaKind | null): string {
  const noun = kind ? KIND_NOUN[kind] : TEXT.device;
  const Noun = capitalize(noun);
  const name = errorName(err);
  if (kind === "screen") {
    switch (name) {
      case "NotAllowedError":
      case "PermissionDeniedError":
        return "Screen sharing was canceled or not allowed. Click Share screen again and pick a screen, window, or tab.";
      case "NotFoundError":
        return "There's no screen or window available to share.";
      case "NotReadableError":
      case "AbortError":
        return "The screen can't be captured. Check screen recording permission in system settings (macOS: Privacy & Security → Screen Recording), then try again.";
      case "NotSupportedError":
        return "This browser doesn't support screen sharing. Use the latest Chrome, Edge, or Firefox on a computer.";
    }
  }
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
    case "PermissionDeniedError":
      return `${Noun} access was denied. Allow it via the lock icon in the browser's address bar, then try again.`;
    case "NotFoundError":
    case "DevicesNotFoundError":
      return `No ${noun} found. Make sure a ${noun} is connected, then try again.`;
    case "NotReadableError":
    case "TrackStartError":
      return `The ${noun} is in use by another app or isn't working. Close other apps (e.g. Zoom or Meet), then try again.`;
    case "OverconstrainedError":
    case "ConstraintNotSatisfiedError":
      return `The selected ${noun} doesn't support these settings. Choose another ${noun}.`;
    case "NotSupportedError":
      return `This browser doesn't support ${noun} access. Use the latest version of your browser.`;
    case "AbortError":
      return `The ${noun} failed to start. Try again.`;
  }
  return `The ${noun} can't be used. Reload the page and try again.`;
}
