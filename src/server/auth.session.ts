import type { Database } from "bun:sqlite";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { SessionUser } from "../shared/api.types";

/** Nama cookie sesi. */
export const SESSION_COOKIE_NAME = "zm_session";
/** Masa berlaku sesi default: 7 hari. */
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

type SessionPayload = { uid: string; exp: number };

const sign = (data: string, secret: string) => createHmac("sha256", secret).update(data).digest("base64url");

function cookieAttrs(maxAge: number, secure: boolean): string {
  return `HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

/** Nilai header Set-Cookie untuk sesi stateless `{uid, exp}` bertanda tangan HMAC-SHA256. */
export function createSessionCookie(
  userId: string,
  secret: string,
  ttlSeconds: number = SESSION_TTL_SECONDS,
  secure: boolean,
): string {
  const payload: SessionPayload = { uid: userId, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${SESSION_COOKIE_NAME}=${data}.${sign(data, secret)}; ${cookieAttrs(ttlSeconds, secure)}`;
}

/** Nilai header Set-Cookie untuk menghapus sesi. */
export function clearSessionCookie(secure: boolean): string {
  return `${SESSION_COOKIE_NAME}=; ${cookieAttrs(0, secure)}`;
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

function parsePayload(data: string): SessionPayload | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
  } catch {
    // Signature sudah valid, jadi payload rusak = bug penerbit; perlakukan sebagai tanpa sesi.
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const { uid, exp } = parsed as Record<string, unknown>;
  return typeof uid === "string" && typeof exp === "number" ? { uid, exp } : null;
}

/** User id dari cookie sesi bila signature valid (constant-time) dan belum kedaluwarsa; selain itu null. */
export function readSessionUserId(request: Request, secret: string): string | null {
  const value = readCookie(request, SESSION_COOKIE_NAME);
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const data = value.slice(0, dot);
  const given = Buffer.from(value.slice(dot + 1));
  const expected = Buffer.from(sign(data, secret));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const payload = parsePayload(data);
  if (!payload || payload.exp <= Math.floor(Date.now() / 1000)) return null;
  return payload.uid;
}

/** User sesi dari DB; null bila tanpa sesi valid atau user sudah tidak ada. */
export function getSessionUser(request: Request, db: Database, secret: string): SessionUser | null {
  const uid = readSessionUserId(request, secret);
  if (!uid) return null;
  const row = db
    .query<{ id: string; name: string; is_admin: number }, [string]>("SELECT id, name, is_admin FROM users WHERE id = ?")
    .get(uid);
  return row ? { id: row.id, name: row.name, isAdmin: row.is_admin === 1 } : null;
}
