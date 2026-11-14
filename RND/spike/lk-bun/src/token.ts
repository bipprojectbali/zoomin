import { AccessToken, TrackSource, type VideoGrant } from "livekit-server-sdk";
import { livekitConfig } from "./config";

/** Masa berlaku token join. */
export const JOIN_TOKEN_TTL_SECONDS = 2 * 60 * 60;

/** Pola aman untuk nama room & identity (dipakai juga oleh validasi API). */
export const SAFE_ID_PATTERN = "^[A-Za-z0-9_-]{1,64}$";
const SAFE_ID = new RegExp(SAFE_ID_PATTERN);

export const ROLES = ["admin", "participant", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export interface JoinTokenInput {
  room: string;
  identity: string;
  name?: string;
  role: Role;
}

const PUBLISH_SOURCES = [
  TrackSource.CAMERA,
  TrackSource.MICROPHONE,
  TrackSource.SCREEN_SHARE,
  TrackSource.SCREEN_SHARE_AUDIO,
];

/** Pemetaan role -> VideoGrant LiveKit. */
export function grantsForRole(room: string, role: Role): VideoGrant {
  const base: VideoGrant = { room, roomJoin: true, canSubscribe: true };
  if (role === "viewer") return { ...base, canPublish: false, canPublishData: false };
  const publisher: VideoGrant = { ...base, canPublish: true, canPublishData: true, canPublishSources: PUBLISH_SOURCES };
  return role === "admin" ? { ...publisher, roomAdmin: true } : publisher;
}

/** Membuat JWT untuk join room LiveKit sesuai role. */
export async function createJoinToken({ room, identity, name, role }: JoinTokenInput): Promise<string> {
  if (!SAFE_ID.test(room)) throw new Error(`createJoinToken: room tidak valid (${JSON.stringify(room)})`);
  if (!SAFE_ID.test(identity)) throw new Error(`createJoinToken: identity tidak valid (${JSON.stringify(identity)})`);
  if (!ROLES.includes(role)) throw new Error(`createJoinToken: role tidak dikenal (${JSON.stringify(role)})`);

  const at = new AccessToken(livekitConfig.apiKey, livekitConfig.apiSecret, {
    identity,
    name: name ?? identity,
    ttl: JOIN_TOKEN_TTL_SECONDS,
    metadata: JSON.stringify({ role }),
  });
  at.addGrant(grantsForRole(room, role));
  return at.toJwt();
}
