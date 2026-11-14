import { AccessToken, TrackSource, type VideoGrant } from "livekit-server-sdk";
import { type RoomRole, SAFE_ID_PATTERN } from "../shared/api.types";
import type { Config } from "./config";

/** Masa berlaku token join: 2 jam. */
export const JOIN_TOKEN_TTL_SECONDS = 2 * 60 * 60;

const SAFE_ID = new RegExp(SAFE_ID_PATTERN);
const ROLES: readonly RoomRole[] = ["host", "participant", "viewer"];
const PUBLISH_SOURCES = [
  TrackSource.CAMERA,
  TrackSource.MICROPHONE,
  TrackSource.SCREEN_SHARE,
  TrackSource.SCREEN_SHARE_AUDIO,
];

/** Batas panjang URL foto di metadata (metadata ikut ke semua peserta, jangan besar). */
export const AVATAR_URL_MAX = 2048;

/** Input token join; identity = user.id, role dari room_members (bukan dari client), image = user.image. */
export type JoinTokenInput = { room: string; identity: string; name?: string; role: RoomRole; image?: string | null };

/** URL foto aman untuk metadata: hanya https absolut ≤ AVATAR_URL_MAX; selain itu null. */
export function avatarUrlOrNull(value: string | null | undefined): string | null {
  if (!value || value.length > AVATAR_URL_MAX) return null;
  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    // URL tak bisa di-parse = foto tidak ditampilkan (fallback inisial), bukan kegagalan join.
    return null;
  }
}

/**
 * Pemetaan role -> VideoGrant (tanpa field `room`). host = grant participant; hak layout/undangan host ditegakkan
 * server lewat API (PUT layout, POST invites), bukan lewat grant LiveKit.
 * Sengaja tanpa `roomAdmin` (pemegangnya bisa UpdateRoomMetadata langsung, melewati validasi layout) dan tanpa
 * `canUpdateOwnMetadata`; `canPublishData` false sampai ada fitur yang butuh (01-arsitektur §Keamanan).
 */
export function grantsForRole(role: RoomRole): VideoGrant {
  const base: VideoGrant = { roomJoin: true, canSubscribe: true, canPublishData: false };
  if (role === "viewer") return { ...base, canPublish: false };
  return { ...base, canPublish: true, canPublishSources: PUBLISH_SOURCES };
}

/** Membuat JWT join room LiveKit sesuai role; throw bila room/identity/role tidak valid. */
export async function createJoinToken(
  { room, identity, name, role, image }: JoinTokenInput,
  config: Pick<Config, "livekitApiKey" | "livekitApiSecret">,
): Promise<string> {
  if (!SAFE_ID.test(room)) throw new Error(`createJoinToken: invalid room (${JSON.stringify(room)})`);
  if (!SAFE_ID.test(identity)) throw new Error(`createJoinToken: invalid identity (${JSON.stringify(identity)})`);
  if (!ROLES.includes(role)) throw new Error(`createJoinToken: unknown role (${JSON.stringify(role)})`);

  const at = new AccessToken(config.livekitApiKey, config.livekitApiSecret, {
    identity,
    name: name ?? identity,
    ttl: JOIN_TOKEN_TTL_SECONDS,
    metadata: JSON.stringify({ role, image: avatarUrlOrNull(image) }),
  });
  at.addGrant({ ...grantsForRole(role), room });
  return at.toJwt();
}
