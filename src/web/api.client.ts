import type {
  AcceptInviteBody,
  AcceptInviteResponse,
  AddRoomMemberBody,
  AdminRoomSummary,
  AdminUser,
  ApiError,
  ApiErrorCode,
  AppSettings,
  AuditAction,
  AuditEntry,
  BanUserBody,
  CreateInviteBody,
  CreateInviteResponse,
  CreateRoomBody,
  InvitePreview,
  GlobalRole,
  LayoutResponse,
  ListRoomsQuery,
  MySession,
  Page,
  ProfileUpdateBody,
  PutLayoutBody,
  PutLayoutResponse,
  RoomMemberItem,
  RoomSummary,
  SetRoleBody,
  SystemHealth,
  TokenResponse,
  UpdateRoomBody,
  UpdateRoomMemberBody,
  UserResponse,
  UserSearchResponse,
} from "../shared/api.types";

/** Header `Retry-After` dalam detik (bentuk tanggal HTTP tidak dipakai server ini) → null bila tidak ada/tidak valid. */
export function parseRetryAfter(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value.trim())) return null;
  return Number(value.trim());
}

/** Error dari API: status HTTP + `code`/`path` dari body, body lengkap (mis. `currentVersion` untuk 409), `Retry-After` (429). */
export class ApiRequestError extends Error {
  readonly code?: ApiErrorCode;
  readonly path?: string;
  constructor(
    readonly status: number,
    readonly body: ApiError & Record<string, unknown>,
    operation: string,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(`${operation}: HTTP ${status} ${body.error}`);
    this.name = "ApiRequestError";
    this.code = body.code;
    this.path = body.path;
  }
}

const HTTP_NO_CONTENT = 204;

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const operation = `${method} ${path}`;
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === HTTP_NO_CONTENT) return undefined as T;
  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch (cause) {
      if (res.ok) throw new Error(`${operation}: respons bukan JSON`, { cause });
    }
  }
  if (!res.ok) {
    const errBody = json && typeof json === "object" && "error" in json ? (json as ApiError) : { error: text || res.statusText };
    throw new ApiRequestError(res.status, errBody, operation, parseRetryAfter(res.headers.get("retry-after")));
  }
  return json as T;
}

const roomPath = (roomId: string) => `/api/rooms/${encodeURIComponent(roomId)}`;
const userPath = (userId: string) => `/api/admin/users/${encodeURIComponent(userId)}`;

/** Query string dari field terisi saja (undefined/""/null dilewati); "" bila kosong. */
function queryString(query: Record<string, string | number | boolean | null | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  return qs.size ? `?${qs}` : "";
}

/** GET /api/me: user sesi (401 → ApiRequestError; 403 `banned`). Login/logout lewat auth.client.ts (Better Auth). */
export const getMe = () => request<UserResponse>("GET", "/api/me");

/** PATCH /api/me: ubah nama/foto profil. */
export const updateMe = (body: ProfileUpdateBody) => request<UserResponse>("PATCH", "/api/me", body);

/** DELETE /api/me: hapus akun sendiri (super_admin → 403). */
export const deleteMe = () => request<void>("DELETE", "/api/me");

/** GET /api/me/sessions: sesi aktif milik user. */
export const listMySessions = () => request<{ items: MySession[] }>("GET", "/api/me/sessions");

/** DELETE /api/me/sessions/:id: cabut satu sesi. */
export const revokeMySession = (id: string) => request<void>("DELETE", `/api/me/sessions/${encodeURIComponent(id)}`);

/** DELETE /api/me/sessions: cabut semua sesi selain yang sedang dipakai. */
export const revokeOtherSessions = () => request<void>("DELETE", "/api/me/sessions");

/** Query GET /api/admin/users. */
export type ListUsersQuery = { q?: string; role?: GlobalRole; banned?: boolean; limit?: number; cursor?: string };

/** GET /api/admin/users (admin+). */
export const listUsers = (query: ListUsersQuery = {}) => request<Page<AdminUser>>("GET", `/api/admin/users${queryString(query)}`);

/** POST /api/admin/users/:id/ban. */
export const banUser = (userId: string, body: BanUserBody) => request<{ user: AdminUser }>("POST", `${userPath(userId)}/ban`, body);

/** POST /api/admin/users/:id/unban. */
export const unbanUser = (userId: string) => request<{ user: AdminUser }>("POST", `${userPath(userId)}/unban`);

/** DELETE /api/admin/users/:id (hard delete). */
export const deleteUser = (userId: string) => request<void>("DELETE", userPath(userId));

/** POST /api/admin/users/:id/sessions/revoke: cabut semua sesi user. */
export const revokeUserSessions = (userId: string) => request<void>("POST", `${userPath(userId)}/sessions/revoke`);

/** GET /api/admin/rooms (admin+). */
export const listAdminRooms = (query: { limit?: number; cursor?: string } = {}) =>
  request<Page<AdminRoomSummary>>("GET", `/api/admin/rooms${queryString(query)}`);

/** DELETE /api/admin/rooms/:id: hapus room DB + room LiveKit. */
export const deleteAdminRoom = (roomId: string) => request<void>("DELETE", `/api/admin/rooms/${encodeURIComponent(roomId)}`);

/** PUT /api/dev/users/:id/role (super_admin). */
export const setUserRole = (userId: string, body: SetRoleBody) =>
  request<{ user: AdminUser }>("PUT", `/api/dev/users/${encodeURIComponent(userId)}/role`, body);

/** GET /api/dev/health (super_admin). */
export const getSystemHealth = () => request<SystemHealth>("GET", "/api/dev/health");

/** Query GET /api/dev/audit. */
export type ListAuditQuery = { action?: AuditAction; actorId?: string; limit?: number; cursor?: string };

/** GET /api/dev/audit (super_admin). */
export const listAudit = (query: ListAuditQuery = {}) => request<Page<AuditEntry>>("GET", `/api/dev/audit${queryString(query)}`);

/** GET /api/dev/settings (super_admin). */
export const getSettings = () => request<AppSettings>("GET", "/api/dev/settings");

/** PUT /api/dev/settings (super_admin). */
export const putSettings = (body: AppSettings) => request<AppSettings>("PUT", "/api/dev/settings", body);

/** GET /api/dev/config (super_admin): ringkasan config non-rahasia (secret = "diset"/"kosong"). */
export const getDevConfig = () => request<Record<string, string>>("GET", "/api/dev/config");

/** POST /api/rooms/:roomId/invites. */
export const createInvite = (roomId: string, body: CreateInviteBody) =>
  request<CreateInviteResponse>("POST", `${roomPath(roomId)}/invites`, body);

/** GET /api/invites/preview: info undangan sebelum diterima (tanpa sesi boleh). */
export const previewInvite = (invite: string) =>
  request<InvitePreview>("GET", `/api/invites/preview?${new URLSearchParams({ invite })}`);

/** POST /api/invites/accept (wajib sesi; 401 bila belum login). */
export const acceptInvite = (body: AcceptInviteBody) => request<AcceptInviteResponse>("POST", "/api/invites/accept", body);

/** GET /api/rooms?limit=&cursor=. */
export const listRooms = (query: ListRoomsQuery = {}) => request<Page<RoomSummary>>("GET", `/api/rooms${queryString(query)}`);

/** GET /api/users/search?q=&limit=: saran akun untuk undangan (admin+ / host room; selain itu 403, 429 rate_limited). */
export const searchUsers = (q: string, limit?: number) =>
  request<UserSearchResponse>("GET", `/api/users/search${queryString({ q, limit })}`);

/** POST /api/rooms (admin+; user → 403 insufficient_role); `members` opsional dibuat dalam transaksi yang sama. */
export const createRoom = (body: CreateRoomBody) => request<RoomSummary>("POST", "/api/rooms", body);

/** GET /api/rooms/:roomId: detail satu room (member / admin global). */
export const getRoom = (roomId: string) => request<RoomSummary>("GET", roomPath(roomId));

/** PATCH /api/rooms/:roomId (pengelola): judul, tipe, aktif, kadaluarsa. */
export const updateRoom = (roomId: string, body: UpdateRoomBody) => request<RoomSummary>("PATCH", roomPath(roomId), body);

/** DELETE /api/rooms/:roomId (pengelola). */
export const deleteRoom = (roomId: string) => request<void>("DELETE", roomPath(roomId));

/** GET /api/rooms/:roomId/members (pengelola): member dulu, lalu pending. */
export const listRoomMembers = (roomId: string, query: { limit?: number; cursor?: string } = {}) =>
  request<Page<RoomMemberItem>>("GET", `${roomPath(roomId)}/members${queryString(query)}`);

/** POST /api/rooms/:roomId/members: tambah/ubah role per email (akun ada → member, belum → pending). */
export const addRoomMember = (roomId: string, body: AddRoomMemberBody) =>
  request<RoomMemberItem>("POST", `${roomPath(roomId)}/members`, body);

/** PATCH /api/rooms/:roomId/members/:userId (409 last_host). */
export const updateRoomMember = (roomId: string, userId: string, body: UpdateRoomMemberBody) =>
  request<RoomMemberItem>("PATCH", `${roomPath(roomId)}/members/${encodeURIComponent(userId)}`, body);

/** DELETE /api/rooms/:roomId/members/:userId (409 last_host). */
export const removeRoomMember = (roomId: string, userId: string) =>
  request<void>("DELETE", `${roomPath(roomId)}/members/${encodeURIComponent(userId)}`);

/** DELETE /api/rooms/:roomId/invitations/:email: batalkan undangan pending. */
export const cancelRoomInvitation = (roomId: string, email: string) =>
  request<void>("DELETE", `${roomPath(roomId)}/invitations/${encodeURIComponent(email)}`);

/** POST /api/rooms/:roomId/token: role & identity ditentukan server dari sesi. */
export const getRoomToken = (roomId: string) => request<TokenResponse>("POST", `${roomPath(roomId)}/token`);

/** GET /api/rooms/:roomId/layout. */
export const getLayout = (roomId: string) => request<LayoutResponse>("GET", `${roomPath(roomId)}/layout`);

/** PUT /api/rooms/:roomId/layout (409 → ApiRequestError dengan body.currentVersion). */
export const putLayout = (roomId: string, body: PutLayoutBody) =>
  request<PutLayoutResponse>("PUT", `${roomPath(roomId)}/layout`, body);
