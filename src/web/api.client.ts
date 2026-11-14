import type {
  AcceptInviteBody,
  AcceptInviteResponse,
  AdminLoginBody,
  ApiError,
  ApiErrorCode,
  CreateInviteBody,
  CreateInviteResponse,
  CreateRoomBody,
  InvitePreview,
  LayoutResponse,
  ListRoomsQuery,
  Page,
  PutLayoutBody,
  PutLayoutResponse,
  RoomSummary,
  TokenResponse,
  UserResponse,
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

/** GET /api/me: user sesi (401 → ApiRequestError). */
export const getMe = () => request<UserResponse>("GET", "/api/me");

/** POST /api/auth/admin-login. */
export const adminLogin = (body: AdminLoginBody) => request<UserResponse>("POST", "/api/auth/admin-login", body);

/** POST /api/auth/logout. */
export const logout = () => request<void>("POST", "/api/auth/logout");

/** POST /api/rooms/:roomId/invites. */
export const createInvite = (roomId: string, body: CreateInviteBody) =>
  request<CreateInviteResponse>("POST", `${roomPath(roomId)}/invites`, body);

/** GET /api/invites/preview: info undangan sebelum diterima (tanpa sesi boleh). */
export const previewInvite = (invite: string) =>
  request<InvitePreview>("GET", `/api/invites/preview?${new URLSearchParams({ invite })}`);

/** POST /api/invites/accept (`name` diabaikan server bila sudah bersesi). */
export const acceptInvite = (body: AcceptInviteBody) => request<AcceptInviteResponse>("POST", "/api/invites/accept", body);

/** GET /api/rooms?limit=&cursor=. */
export function listRooms(query: ListRoomsQuery = {}) {
  const qs = new URLSearchParams();
  if (query.limit !== undefined) qs.set("limit", String(query.limit));
  if (query.cursor) qs.set("cursor", query.cursor);
  const suffix = qs.size ? `?${qs}` : "";
  return request<Page<RoomSummary>>("GET", `/api/rooms${suffix}`);
}

/** POST /api/rooms (admin global). */
export const createRoom = (body: CreateRoomBody) => request<RoomSummary>("POST", "/api/rooms", body);

/** GET /api/rooms/:roomId: detail satu room (member / admin global). */
export const getRoom = (roomId: string) => request<RoomSummary>("GET", roomPath(roomId));

/** POST /api/rooms/:roomId/token: role & identity ditentukan server dari sesi. */
export const getRoomToken = (roomId: string) => request<TokenResponse>("POST", `${roomPath(roomId)}/token`);

/** GET /api/rooms/:roomId/layout. */
export const getLayout = (roomId: string) => request<LayoutResponse>("GET", `${roomPath(roomId)}/layout`);

/** PUT /api/rooms/:roomId/layout (409 → ApiRequestError dengan body.currentVersion). */
export const putLayout = (roomId: string, body: PutLayoutBody) =>
  request<PutLayoutResponse>("PUT", `${roomPath(roomId)}/layout`, body);
