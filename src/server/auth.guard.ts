import { Elysia } from "elysia";
import type { ApiError, GlobalRole, SessionUser } from "../shared/api.types";
import type { ApiDeps } from "./api.deps";
import { apiError } from "./api.error";

const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;

/** Urutan peran global untuk cek minimum. */
export const GLOBAL_ROLE_RANK: Record<GlobalRole, number> = { user: 1, admin: 2, super_admin: 3 };

/** Sesi aktif: user (bentuk kontrak), id sesi Better Auth, dan status ban. */
export type SessionState = { user: SessionUser; sessionId: string; banned: boolean };

/** Hasil cek akses: user yang lolos, atau status HTTP + body error kontrak. */
export type Authorized = { ok: true; user: SessionUser; sessionId: string } | { ok: false; status: number; body: ApiError };

type BetterAuthUser = { id: string; name: string; email: string; image?: string | null; role?: string | null; banned?: boolean | null; banExpires?: Date | null };

/** Peran tersimpan → GlobalRole (null/asing = user). */
export const toGlobalRole = (role: string | null | undefined): GlobalRole =>
  role === "admin" || role === "super_admin" ? role : "user";

/** User Better Auth → SessionUser kontrak. */
export const toSessionUser = (u: BetterAuthUser): SessionUser => ({
  id: u.id,
  name: u.name,
  email: u.email,
  image: u.image ?? null,
  role: toGlobalRole(u.role),
});

/** true bila ban masih berlaku (banExpires kosong = permanen). */
export const isBanActive = (u: Pick<BetterAuthUser, "banned" | "banExpires">, now = Date.now()): boolean =>
  Boolean(u.banned) && (!u.banExpires || new Date(u.banExpires).getTime() > now);

/** Sesi dari cookie Better Auth (`auth.api.getSession`); null bila tanpa sesi valid. */
export async function getSessionState(request: Request, deps: Pick<ApiDeps, "auth">): Promise<SessionState | null> {
  const result = await deps.auth.api.getSession({ headers: request.headers });
  if (!result) return null;
  return { user: toSessionUser(result.user), sessionId: result.session.id, banned: isBanActive(result.user) };
}

/** User sesi; null bila tanpa sesi atau user sedang di-ban. */
export async function getSessionUser(request: Request, deps: Pick<ApiDeps, "auth">): Promise<SessionUser | null> {
  const state = await getSessionState(request, deps);
  return state && !state.banned ? state.user : null;
}

/** true bila peran user ≥ `min`. */
export const hasRole = (user: Pick<SessionUser, "role">, min: GlobalRole): boolean => GLOBAL_ROLE_RANK[user.role] >= GLOBAL_ROLE_RANK[min];

/** Cek akses minimum: tanpa sesi → 401 `unauthorized`, ban → 403 `banned`, peran kurang → 403 `insufficient_role`. */
export function requireRole(state: SessionState | null, min: GlobalRole): Authorized {
  if (!state) return { ok: false, status: HTTP_UNAUTHORIZED, body: apiError("unauthorized", "unauthorized") };
  if (state.banned) return { ok: false, status: HTTP_FORBIDDEN, body: apiError("banned", "user is banned") };
  if (!hasRole(state.user, min)) return { ok: false, status: HTTP_FORBIDDEN, body: apiError("insufficient_role", `requires role ${min}`) };
  return { ok: true, user: state.user, sessionId: state.sessionId };
}

/**
 * Plugin Elysia dengan macro `auth: <GlobalRole>`: route ber-opsi `{ auth: "admin" }` hanya jalan bila sesi valid,
 * tidak di-ban, dan peran ≥ minimum; handler menerima `user` (SessionUser) dan `sessionId`.
 * Contoh: `.use(authGuard(deps)).get("/x", ({ user }) => user, { auth: "user" })`.
 */
export function authGuard(deps: Pick<ApiDeps, "auth">) {
  return new Elysia().macro({
    auth: (min: GlobalRole) => ({
      async resolve({ request, status }) {
        const access = requireRole(await getSessionState(request, deps), min);
        if (!access.ok) return status(access.status, access.body);
        return { user: access.user, sessionId: access.sessionId };
      },
    }),
  });
}
