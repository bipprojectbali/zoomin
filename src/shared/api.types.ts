// Kontrak API HTTP server <-> web. Tipe saja (plus satu konstanta pola), tanpa logika.
// Semua endpoint JSON, prefix /api, sesi = cookie Better Auth (login Google, RND/plan/05-auth-roles.md).
//
// /api/auth/*                                   -> handler Better Auth (sign-in/social, callback/google, sign-out, ...)
//                                                  /api/auth/admin/* diblok dari HTTP: aksi admin lewat /api/admin/*.
// GET    /api/me                                -> { user: SessionUser }                 | 401 | 403 banned
// PATCH  /api/me  ProfileUpdateBody             -> { user: SessionUser }
// DELETE /api/me                                -> 204 (super_admin → 403 insufficient_role)
// GET    /api/me/sessions                       -> { items: MySession[] }
// DELETE /api/me/sessions                       -> 204 (semua sesi selain yang dipakai)
// DELETE /api/me/sessions/:id                   -> 204
// POST   /api/test/login TestLoginBody          -> { user } + cookie (HANYA dev + ZOOMIN_TEST_AUTH=1; selain itu 404)
// POST /api/rooms/:roomId/invites CreateInviteBody (host room / admin global) -> CreateInviteResponse
// GET  /api/invites/preview?invite=            -> InvitePreview (sesi opsional)         | 400 invite_invalid | 404 room_not_found
// POST /api/invites/accept    AcceptInviteBody  -> AcceptInviteResponse (wajib sesi)     | 401
// GET  /api/rooms?limit=&cursor=                -> Page<RoomSummary> (limit default 20, max 100)
// POST /api/rooms             CreateRoomBody (admin+) -> RoomSummary (creator jadi host) | 403 insufficient_role
// GET  /api/users/search?q=&limit=          -> UserSearchResponse (admin+ / host room mana pun) | 403 | 429 rate_limited
// GET  /api/rooms/:roomId                       -> RoomSummary (member / admin+)         | 401 | 403 | 404 room_not_found
// PATCH  /api/rooms/:roomId UpdateRoomBody (pengelola) -> RoomSummary            | 403 forbidden | 404
// DELETE /api/rooms/:roomId (pengelola)         -> 204
// /api/rooms/:roomId/members*                   -> anggota & undangan pending (RND/plan/06-room-access.md)
// POST /api/rooms/:roomId/token                 -> TokenResponse                        | 403 room_inactive | room_expired
// GET  /api/rooms/:roomId/layout                -> LayoutResponse
// PUT  /api/rooms/:roomId/layout PutLayoutBody  -> PutLayoutResponse | 409 LayoutConflictError
// Admin (admin+) & dev (super_admin): lihat tabel endpoint di RND/plan/05-auth-roles.md dan fungsi di src/web/api.client.ts.

import type { LayoutState } from "./layout.model";

/** Pola aman untuk id room/user (= nama room & identity LiveKit). */
export const SAFE_ID_PATTERN = "^[A-Za-z0-9_-]{1,64}$";

/**
 * Padanan SAFE_ID_PATTERN untuk atribut HTML `pattern`: browser meng-compile-nya dengan flag `v`
 * (tanpa anchor, otomatis full-match), dan di mode `v` tanda `-` di dalam kelas karakter wajib di-escape.
 */
export const SAFE_ID_HTML_PATTERN = "[A-Za-z0-9_\\-]{1,64}";

/** Peran global akun (A3). super_admin hanya dari env SUPER_ADMIN_EMAILS (A4). */
export type GlobalRole = "user" | "admin" | "super_admin";

/** Peran anggota di satu room (A3); `host` menggantikan peran room `admin` lama. */
export type RoomRole = "host" | "participant" | "viewer";

/** @deprecated pakai RoomRole; alias sementara sampai web selesai migrasi (gelombang 2). */
export type Role = RoomRole;

/** User yang sedang login (dari sesi Better Auth). */
export type SessionUser = { id: string; name: string; email: string; image: string | null; role: GlobalRole };

/** User di panel admin. Waktu = epoch ms. */
export type AdminUser = SessionUser & {
  banned: boolean;
  banReason: string | null;
  banExpires: number | null;
  createdAt: number;
  lastActiveAt: number | null;
};

/** Aksi admin/dev yang wajib diaudit (A8). */
export type AuditAction =
  | "user.ban"
  | "user.unban"
  | "user.delete"
  | "user.role"
  | "user.sessions.revoke"
  | "room.create"
  | "room.delete"
  | "room.update"
  | "room.visibility"
  | "room.activate"
  | "room.deactivate"
  | "room.expiry"
  | "room.member.add"
  | "room.member.role"
  | "room.member.remove"
  | "setting.update";

/** Satu baris audit log. */
export type AuditEntry = {
  id: string;
  at: number;
  actorId: string;
  actorEmail: string;
  action: AuditAction;
  targetType: "user" | "room" | "setting" | "session";
  targetId: string;
  detail: Record<string, unknown>;
};

/** Setting proyek (tabel app_settings); allowedEmailDomains kosong = semua domain boleh (A9). */
export type AppSettings = { allowedEmailDomains: string[] };

/** Respons GET /api/dev/health. */
export type SystemHealth = {
  version: string;
  bun: string;
  uptimeSec: number;
  nodeEnv: string;
  livekit: { url: string; ok: boolean; latencyMs: number | null; error: string | null };
  db: { users: number; rooms: number; activeRooms: number; sizeBytes: number | null };
  superAdminEmailsConfigured: number;
};

/** Body PATCH /api/me: name 1–60 (trim); image URL https atau null (kembali ke foto Google). */
export type ProfileUpdateBody = { name?: string; image?: string | null };

/** Body POST /api/admin/users/:id/ban: reason 3–200; tanpa expiresInHours = permanen. */
export type BanUserBody = { reason: string; expiresInHours?: number };

/** Body PUT /api/dev/users/:id/role; super_admin tidak bisa diset lewat API. */
export type SetRoleBody = { role: "user" | "admin" };

/** Satu sesi milik user (GET /api/me/sessions). Waktu = epoch ms. */
export type MySession = { id: string; current: boolean; userAgent: string | null; ip: string | null; createdAt: number; expiresAt: number };

/** Body POST /api/test/login (test-only, A12). */
export type TestLoginBody = { email: string; name?: string };

/** Ringkasan room di panel admin; `live` = sedang ada di LiveKit (R11, beda dengan `status`). */
export type AdminRoomSummary = RoomSummary & { members: number; live: boolean; participants: number };

/** Kode error mesin-terbaca; web menerjemahkan `code` ke pesan user, `error` hanya teks teknis. */
export type ApiErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "room_not_found"
  | "room_exists"
  | "invalid_input"
  | "invite_invalid"
  | "rate_limited"
  | "layout_conflict"
  | "banned"
  | "email_domain_not_allowed"
  | "cannot_modify_self"
  | "insufficient_role"
  | "user_not_found"
  | "room_inactive"
  | "room_expired"
  | "room_private"
  | "last_host"
  | "member_not_found";

/** Bentuk body error semua endpoint; `path` = field yang gagal validasi. */
export type ApiError = { error: string; code?: ApiErrorCode; path?: string };

/** Mode akses room (R1): public = link undangan berlaku; private = hanya anggota. */
export type RoomVisibility = "public" | "private";

/** Status turunan server (R5): inactive bila dinonaktifkan, else expired bila lewat expiresAt, else active. */
export type RoomStatus = "active" | "inactive" | "expired";

/** Batas atas kadaluarsa room dari sekarang (R7). */
export const ROOM_EXPIRY_MAX_DAYS = 365;

/** Satu baris daftar room di lobby. */
export type RoomSummary = {
  id: string;
  title: string;
  /** null = admin global yang bukan member room ini. */
  role: RoomRole | null;
  createdAt: number;
  visibility: RoomVisibility;
  status: RoomStatus;
  /** Epoch ms; null = tanpa batas. */
  expiresAt: number | null;
  /** true bila pemanggil pengelola room (host room atau admin+, R3). */
  canManage: boolean;
};

/** Body PATCH /api/rooms/:roomId (pengelola). expiresAt null = tanpa batas. */
export type UpdateRoomBody = { title?: string; visibility?: RoomVisibility; enabled?: boolean; expiresAt?: number | null };

/** Satu baris daftar anggota room: member (sudah punya akun) atau pending (undangan email belum diklaim). */
export type RoomMemberItem =
  | { kind: "member"; userId: string; name: string; email: string; image: string | null; role: RoomRole }
  | { kind: "pending"; email: string; role: RoomRole; invitedAt: number };

/** Body POST /api/rooms/:roomId/members. */
export type AddRoomMemberBody = { email: string; role: RoomRole };

/** Body PATCH /api/rooms/:roomId/members/:userId. */
export type UpdateRoomMemberBody = { role: RoomRole };

/** Halaman hasil list ber-cursor. */
export type Page<T> = { items: T[]; nextCursor: string | null };

/** Respons /api/me. */
export type UserResponse = { user: SessionUser };

/** Body POST /api/rooms/:roomId/invites. */
export type CreateInviteBody = { role: RoomRole; ttlHours?: number };

/** Respons pembuatan undangan. */
export type CreateInviteResponse = { url: string; expiresAt: number };

/** Body POST /api/invites/accept (wajib sesi). */
export type AcceptInviteBody = { invite: string };

/** Respons terima undangan; `role` = role efektif di room. */
export type AcceptInviteResponse = { user: SessionUser; roomId: string; role: RoomRole };

/** Respons GET /api/invites/preview. */
export type InvitePreview = {
  roomId: string;
  roomTitle: string;
  /** Role yang tertulis di undangan. */
  role: RoomRole;
  /** Kedaluwarsa undangan, epoch ms. */
  expiresAt: number;
  currentUser: SessionUser | null;
  /** Role yang akan didapat bila diterima: max(role undangan, role existing) bila bersesi. */
  effectiveRole: RoomRole;
};

/** Query GET /api/rooms. */
export type ListRoomsQuery = { limit?: number; cursor?: string };

/** Body POST /api/rooms; `members` (maks CREATE_ROOM_MAX_MEMBERS) dibuat dalam transaksi yang sama. */
export type CreateRoomBody = { id: string; title: string; visibility?: RoomVisibility; expiresAt?: number | null; members?: AddRoomMemberBody[] };

/** Batas jumlah anggota di POST /api/rooms. */
export const CREATE_ROOM_MAX_MEMBERS = 100;

/** Satu saran akun di GET /api/users/search. */
export type UserSearchItem = { id: string; name: string; email: string; image: string | null };

/** Respons GET /api/users/search (tanpa paginasi: autocomplete dibatasi limit). */
export type UserSearchResponse = { items: UserSearchItem[] };

/** Panjang minimum `q` (setelah trim) dan batas atas `limit` GET /api/users/search. */
export const USER_SEARCH_MIN = 2;
export const USER_SEARCH_MAX_RESULTS = 10;

/** Respons POST /api/rooms/:roomId/token. */
export type TokenResponse = { token: string; url: string; role: RoomRole };

/** Respons GET /api/rooms/:roomId/layout; layout null = belum pernah diset. */
export type LayoutResponse = { version: number; layout: LayoutState | null };

/** Body PUT /api/rooms/:roomId/layout (compare-and-set pada baseVersion). */
export type PutLayoutBody = { baseVersion: number; layout: LayoutState };

/** Respons sukses PUT layout. */
export type PutLayoutResponse = { version: number };

/** Body 409 PUT layout: baseVersion usang. */
export type LayoutConflictError = ApiError & { currentVersion: number };
