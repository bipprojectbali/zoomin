// Kontrak API HTTP server <-> web. Tipe saja (plus satu konstanta pola), tanpa logika.
// Semua endpoint JSON, prefix /api, sesi via cookie `zm_session`.
//
// GET  /api/me                                  -> { user: SessionUser }                 | 401
// POST /api/auth/admin-login  AdminLoginBody    -> { user: SessionUser } + cookie        | 401
// POST /api/auth/logout                         -> 204
// POST /api/rooms/:roomId/invites CreateInviteBody (admin room / admin global) -> CreateInviteResponse
// POST /api/invites/accept    AcceptInviteBody  -> AcceptInviteResponse + cookie
// GET  /api/rooms?limit=&cursor=                -> Page<RoomSummary> (limit default 20, max 100)
// POST /api/rooms             CreateRoomBody (admin global) -> RoomSummary (creator jadi member role admin)
// POST /api/rooms/:roomId/token                 -> TokenResponse
// GET  /api/rooms/:roomId/layout                -> LayoutResponse
// PUT  /api/rooms/:roomId/layout PutLayoutBody  -> PutLayoutResponse | 409 LayoutConflictError

import type { LayoutState } from "./layout.model";

/** Pola aman untuk id room/user (= nama room & identity LiveKit). */
export const SAFE_ID_PATTERN = "^[A-Za-z0-9_-]{1,64}$";

/** Role anggota di satu room. */
export type Role = "admin" | "participant" | "viewer";

/** User yang sedang login (dari cookie sesi). */
export type SessionUser = { id: string; name: string; isAdmin: boolean };

/** Bentuk body error semua endpoint; `path` = field yang gagal validasi. */
export type ApiError = { error: string; path?: string };

/** Satu baris daftar room di lobby. */
export type RoomSummary = {
  id: string;
  title: string;
  /** null = admin global yang bukan member room ini. */
  role: Role | null;
  createdAt: number;
};

/** Halaman hasil list ber-cursor. */
export type Page<T> = { items: T[]; nextCursor: string | null };

/** Respons /api/me dan login. */
export type UserResponse = { user: SessionUser };

/** Body POST /api/auth/admin-login. */
export type AdminLoginBody = { password: string };

/** Body POST /api/rooms/:roomId/invites. */
export type CreateInviteBody = { role: Role; ttlHours?: number };

/** Respons pembuatan undangan. */
export type CreateInviteResponse = { url: string; expiresAt: number };

/** Body POST /api/invites/accept. */
export type AcceptInviteBody = { invite: string; name: string };

/** Respons terima undangan (cookie sesi ikut diset). */
export type AcceptInviteResponse = { user: SessionUser; roomId: string };

/** Query GET /api/rooms. */
export type ListRoomsQuery = { limit?: number; cursor?: string };

/** Body POST /api/rooms. */
export type CreateRoomBody = { id: string; title: string };

/** Respons POST /api/rooms/:roomId/token. */
export type TokenResponse = { token: string; url: string; role: Role };

/** Respons GET /api/rooms/:roomId/layout; layout null = belum pernah diset. */
export type LayoutResponse = { version: number; layout: LayoutState | null };

/** Body PUT /api/rooms/:roomId/layout (compare-and-set pada baseVersion). */
export type PutLayoutBody = { baseVersion: number; layout: LayoutState };

/** Respons sukses PUT layout. */
export type PutLayoutResponse = { version: number };

/** Body 409 PUT layout: baseVersion usang. */
export type LayoutConflictError = ApiError & { currentVersion: number };
