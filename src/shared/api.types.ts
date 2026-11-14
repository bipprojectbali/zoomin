// Kontrak API HTTP server <-> web. Tipe saja (plus satu konstanta pola), tanpa logika.
// Semua endpoint JSON, prefix /api, sesi via cookie `zm_session`.
//
// GET  /api/me                                  -> { user: SessionUser }                 | 401
// POST /api/auth/admin-login  AdminLoginBody    -> { user: SessionUser } + cookie        | 401
// POST /api/auth/logout                         -> 204
// POST /api/rooms/:roomId/invites CreateInviteBody (admin room / admin global) -> CreateInviteResponse
// GET  /api/invites/preview?invite=            -> InvitePreview (sesi opsional)         | 400 invite_invalid | 404 room_not_found
// POST /api/invites/accept    AcceptInviteBody  -> AcceptInviteResponse + cookie
// GET  /api/rooms?limit=&cursor=                -> Page<RoomSummary> (limit default 20, max 100)
// POST /api/rooms             CreateRoomBody (admin global) -> RoomSummary (creator jadi member role admin)
// GET  /api/rooms/:roomId                       -> RoomSummary (member / admin global)   | 401 | 403 | 404 room_not_found
// POST /api/rooms/:roomId/token                 -> TokenResponse
// GET  /api/rooms/:roomId/layout                -> LayoutResponse
// PUT  /api/rooms/:roomId/layout PutLayoutBody  -> PutLayoutResponse | 409 LayoutConflictError

import type { LayoutState } from "./layout.model";

/** Pola aman untuk id room/user (= nama room & identity LiveKit). */
export const SAFE_ID_PATTERN = "^[A-Za-z0-9_-]{1,64}$";

/**
 * Padanan SAFE_ID_PATTERN untuk atribut HTML `pattern`: browser meng-compile-nya dengan flag `v`
 * (tanpa anchor, otomatis full-match), dan di mode `v` tanda `-` di dalam kelas karakter wajib di-escape.
 */
export const SAFE_ID_HTML_PATTERN = "[A-Za-z0-9_\\-]{1,64}";

/** Role anggota di satu room. */
export type Role = "admin" | "participant" | "viewer";

/** User yang sedang login (dari cookie sesi). */
export type SessionUser = { id: string; name: string; isAdmin: boolean };

/** Kode error mesin-terbaca; web menerjemahkan `code` ke pesan user, `error` hanya teks teknis. */
export type ApiErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "room_not_found"
  | "room_exists"
  | "invalid_input"
  | "invite_invalid"
  | "invalid_credentials"
  | "rate_limited"
  | "layout_conflict";

/** Bentuk body error semua endpoint; `path` = field yang gagal validasi. */
export type ApiError = { error: string; code?: ApiErrorCode; path?: string };

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

/** Body POST /api/invites/accept; `name` wajib (1-60, trim) bila tanpa sesi, diabaikan bila bersesi. */
export type AcceptInviteBody = { invite: string; name?: string };

/** Respons terima undangan (cookie sesi ikut diset); `role` = role efektif di room. */
export type AcceptInviteResponse = { user: SessionUser; roomId: string; role: Role };

/** Respons GET /api/invites/preview. */
export type InvitePreview = {
  roomId: string;
  roomTitle: string;
  /** Role yang tertulis di undangan. */
  role: Role;
  /** Kedaluwarsa undangan, epoch ms. */
  expiresAt: number;
  currentUser: SessionUser | null;
  /** Role yang akan didapat bila diterima: max(role undangan, role existing) bila bersesi. */
  effectiveRole: Role;
};

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
