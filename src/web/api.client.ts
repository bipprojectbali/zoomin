import type {
  AcceptInviteBody,
  AcceptInviteResponse,
  AdminLoginBody,
  ApiError,
  CreateInviteBody,
  CreateInviteResponse,
  CreateRoomBody,
  LayoutResponse,
  ListRoomsQuery,
  Page,
  PutLayoutBody,
  PutLayoutResponse,
  RoomSummary,
  TokenResponse,
  UserResponse,
} from "../shared/api.types";

/** Error dari API: status HTTP + body JSON (`error`, dan field lain seperti `currentVersion` untuk 409). */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiError & Record<string, unknown>,
    operation: string,
  ) {
    super(`${operation}: HTTP ${status} ${body.error}`);
    this.name = "ApiRequestError";
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
    throw new ApiRequestError(res.status, errBody, operation);
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

/** POST /api/invites/accept. */
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

/** POST /api/rooms/:roomId/token: role & identity ditentukan server dari sesi. */
export const getRoomToken = (roomId: string) => request<TokenResponse>("POST", `${roomPath(roomId)}/token`);

/** GET /api/rooms/:roomId/layout. */
export const getLayout = (roomId: string) => request<LayoutResponse>("GET", `${roomPath(roomId)}/layout`);

/** PUT /api/rooms/:roomId/layout (409 → ApiRequestError dengan body.currentVersion). */
export const putLayout = (roomId: string, body: PutLayoutBody) =>
  request<PutLayoutResponse>("PUT", `${roomPath(roomId)}/layout`, body);
