import { AccessToken, TrackSource, type VideoGrant } from "livekit-server-sdk";
import { SAFE_ID_PATTERN, type Role } from "../shared/api.types";
import type { Config } from "./config";

/** Masa berlaku token join: 2 jam. */
export const JOIN_TOKEN_TTL_SECONDS = 2 * 60 * 60;

const SAFE_ID = new RegExp(SAFE_ID_PATTERN);
const ROLES: readonly Role[] = ["admin", "participant", "viewer"];
const PUBLISH_SOURCES = [
  TrackSource.CAMERA,
  TrackSource.MICROPHONE,
  TrackSource.SCREEN_SHARE,
  TrackSource.SCREEN_SHARE_AUDIO,
];

/** Input token join; identity = user.id, role dari room_members (bukan dari client). */
export type JoinTokenInput = { room: string; identity: string; name?: string; role: Role };

/**
 * Pemetaan role -> VideoGrant (tanpa field `room`).
 * Sengaja tanpa `roomAdmin` (pemegangnya bisa UpdateRoomMetadata langsung, melewati validasi layout) dan tanpa
 * `canUpdateOwnMetadata`; `canPublishData` false sampai ada fitur yang butuh (01-arsitektur §Keamanan).
 */
export function grantsForRole(role: Role): VideoGrant {
  const base: VideoGrant = { roomJoin: true, canSubscribe: true, canPublishData: false };
  if (role === "viewer") return { ...base, canPublish: false };
  return { ...base, canPublish: true, canPublishSources: PUBLISH_SOURCES };
}

/** Membuat JWT join room LiveKit sesuai role; throw bila room/identity/role tidak valid. */
export async function createJoinToken(
  { room, identity, name, role }: JoinTokenInput,
  config: Pick<Config, "livekitApiKey" | "livekitApiSecret">,
): Promise<string> {
  if (!SAFE_ID.test(room)) throw new Error(`createJoinToken: room tidak valid (${JSON.stringify(room)})`);
  if (!SAFE_ID.test(identity)) throw new Error(`createJoinToken: identity tidak valid (${JSON.stringify(identity)})`);
  if (!ROLES.includes(role)) throw new Error(`createJoinToken: role tidak dikenal (${JSON.stringify(role)})`);

  const at = new AccessToken(config.livekitApiKey, config.livekitApiSecret, {
    identity,
    name: name ?? identity,
    ttl: JOIN_TOKEN_TTL_SECONDS,
    metadata: JSON.stringify({ role }),
  });
  at.addGrant({ ...grantsForRole(role), room });
  return at.toJwt();
}
