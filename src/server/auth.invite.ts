import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { type RoomRole, SAFE_ID_PATTERN } from "../shared/api.types";

/** Masa berlaku undangan bila `ttlHours` tidak diisi. */
export const INVITE_DEFAULT_TTL_HOURS = 72;
/** Batas atas masa berlaku undangan (30 hari). */
export const INVITE_MAX_TTL_HOURS = 720;

const NONCE_BYTES = 16;
const ROLES: readonly RoomRole[] = ["host", "participant", "viewer"];
const SAFE_ID = new RegExp(SAFE_ID_PATTERN);

type InvitePayload = { r: string; role: RoomRole; exp: number; n: string };

/** Isi undangan yang sudah terverifikasi; `exp` dalam detik epoch. */
export type VerifiedInvite = { roomId: string; role: RoomRole; exp: number };

// Kunci turunan berprefix domain: signature undangan tidak pernah bisa dipakai ulang untuk tanda tangan lain yang memakai
// BETTER_AUTH_SECRET yang sama (cookie Better Auth, state OAuth).
const inviteKey = (secret: string) => createHmac("sha256", secret).update("invite:").digest();
const sign = (data: string, secret: string) => createHmac("sha256", inviteKey(secret)).update(data).digest("base64url");

const nowSeconds = () => Math.floor(Date.now() / 1000);

// ponytail: undangan multi-pakai sampai kedaluwarsa (stateless, tanpa tabel revocation). Bila perlu bisa dicabut,
// upgrade = tabel `invites` (nonce, revoked_at) dan cek nonce saat verify.
/** Membuat undangan `base64url(json).sig` bertanda tangan HMAC-SHA256 untuk satu room + role. */
export function createInvite(
  { roomId, role, ttlSeconds }: { roomId: string; role: RoomRole; ttlSeconds: number },
  secret: string,
  now: number = nowSeconds(),
): string {
  const payload: InvitePayload = { r: roomId, role, exp: now + ttlSeconds, n: randomBytes(NONCE_BYTES).toString("base64url") };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${data}.${sign(data, secret)}`;
}

function parsePayload(data: string): InvitePayload | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
  } catch {
    // Signature sudah valid, jadi payload rusak = bug penerbit; perlakukan sebagai undangan tidak valid.
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const { r, role, exp, n } = parsed as Record<string, unknown>;
  if (typeof r !== "string" || !SAFE_ID.test(r)) return null;
  if (typeof role !== "string" || !ROLES.includes(role as RoomRole)) return null;
  if (typeof exp !== "number" || typeof n !== "string") return null;
  return { r, role: role as RoomRole, exp, n };
}

/** Isi undangan bila signature valid (constant-time), belum kedaluwarsa, role & roomId valid; selain itu null. */
export function verifyInvite(invite: string, secret: string, now: number = nowSeconds()): VerifiedInvite | null {
  const dot = invite.lastIndexOf(".");
  if (dot <= 0) return null;
  const data = invite.slice(0, dot);
  const given = Buffer.from(invite.slice(dot + 1));
  const expected = Buffer.from(sign(data, secret));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const payload = parsePayload(data);
  if (!payload || payload.exp <= now) return null;
  return { roomId: payload.r, role: payload.role, exp: payload.exp };
}
