import { Elysia, t } from "elysia";
import { type AcceptInviteResponse, type CreateInviteResponse, type InvitePreview, type RoomRole, SAFE_ID_PATTERN } from "../shared/api.types";
import type { ApiDeps } from "./api.deps";
import { apiError } from "./api.error";
import { authGuard, getSessionUser } from "./auth.guard";
import { createInvite, INVITE_DEFAULT_TTL_HOURS, INVITE_MAX_TTL_HOURS, verifyInvite } from "./auth.invite";
import { clientIp, createRateLimiter } from "./auth.ratelimit";
import { canManageRoom, roomStatus } from "./room.access";

const HTTP_BAD_REQUEST = 400;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_TOO_MANY_REQUESTS = 429;
/**
 * R17: maks POST /invites/accept per IP per jendela (cegah spam/brute force undangan). Semua percobaan dihitung.
 * 200 (bukan 20): banyak user sah bisa berbagi satu IP NAT (kantor/kelas); undangan sudah bertanda tangan HMAC,
 * jadi limit ini hanya penahan spam, bukan pertahanan utama.
 */
export const INVITE_ACCEPT_MAX = 200;
export const INVITE_ACCEPT_WINDOW_MS = 60 * 60 * 1000;
const SECONDS_PER_HOUR = 3600;
const INVITE_MAX_LENGTH = 2048;

const roleSchema = t.Union([t.Literal("host"), t.Literal("participant"), t.Literal("viewer")]);
const MS_PER_SECOND = 1000;
const ROLE_RANK: Record<RoomRole, number> = { viewer: 1, participant: 2, host: 3 };
/** Role tertinggi dari dua role (null = belum member). Selaras dengan UPSERT_MEMBER yang hanya menaikkan role. */
const maxRole = (a: RoomRole, b: RoomRole | null): RoomRole => (b && ROLE_RANK[b] > ROLE_RANK[a] ? b : a);

// Upsert membership yang hanya menaikkan role (host > participant > viewer), tidak pernah menurunkan.
const RANK = (col: string) => `(CASE ${col} WHEN 'host' THEN 3 WHEN 'participant' THEN 2 ELSE 1 END)`;
const UPSERT_MEMBER =
  "INSERT INTO room_members (room_id, user_id, role) VALUES (?, ?, ?) " +
  `ON CONFLICT(room_id, user_id) DO UPDATE SET role = excluded.role WHERE ${RANK("excluded.role")} > ${RANK("room_members.role")}`;

/** Route undangan: buat (host room / admin global), pratinjau (publik), dan terima (wajib sesi). */
export function inviteRoutes(deps: ApiDeps) {
  const { db, config } = deps;
  const secret = config.authSecret;
  const accepts = createRateLimiter(INVITE_ACCEPT_MAX, INVITE_ACCEPT_WINDOW_MS);
  type GateRoom = { title: string; visibility: string; disabled_at: number | null; expires_at: number | null };
  const findRoom = (roomId: string) =>
    db.query<GateRoom, [string]>("SELECT title, visibility, disabled_at, expires_at FROM rooms WHERE id = ?").get(roomId);
  const memberRole = (roomId: string, userId: string) =>
    db
      .query<{ role: RoomRole }, [string, string]>("SELECT role FROM room_members WHERE room_id = ? AND user_id = ?")
      .get(roomId, userId)?.role ?? null;

  /**
   * Gerbang link undangan (R1/R4/R5): room harus ada, private hanya untuk yang sudah anggota (visibility dicek saat
   * dipakai, bukan di token undangan), dan status harus active. Mengembalikan judul room atau error untuk route.
   */
  const gate = (roomId: string, userId: string | null) => {
    const room = findRoom(roomId);
    if (!room) return { ok: false, code: HTTP_NOT_FOUND, body: apiError("room_not_found", "room not found") } as const;
    if (room.visibility === "private" && !(userId && memberRole(roomId, userId))) {
      return { ok: false, code: HTTP_FORBIDDEN, body: apiError("room_private", "room is private") } as const;
    }
    const st = roomStatus(room);
    if (st === "inactive") return { ok: false, code: HTTP_FORBIDDEN, body: apiError("room_inactive", "room is inactive") } as const;
    if (st === "expired") return { ok: false, code: HTTP_FORBIDDEN, body: apiError("room_expired", "room has expired") } as const;
    return { ok: true, title: room.title } as const;
  };

  return new Elysia({ name: "auth.invite" })
    .use(authGuard(deps))
    .post(
      "/rooms/:roomId/invites",
      ({ params: { roomId }, body, user, status }) => {
        const room = findRoom(roomId);
        if (!room) return status(HTTP_NOT_FOUND, apiError("room_not_found", "room not found"));
        if (!canManageRoom(db, user, roomId)) return status(HTTP_FORBIDDEN, apiError("forbidden", "forbidden"));
        if (room.visibility === "private") return status(HTTP_FORBIDDEN, apiError("room_private", "room is private: add members by email"));
        const ttlSeconds = Math.round((body.ttlHours ?? INVITE_DEFAULT_TTL_HOURS) * SECONDS_PER_HOUR);
        const now = Math.floor(Date.now() / 1000);
        const invite = createInvite({ roomId, role: body.role, ttlSeconds }, secret, now);
        // expiresAt dalam milidetik epoch (sama dengan Date.now() di client).
        return { url: `${config.publicAppUrl}/invite/${invite}`, expiresAt: (now + ttlSeconds) * MS_PER_SECOND } satisfies CreateInviteResponse;
      },
      {
        auth: "user",
        params: t.Object({ roomId: t.String({ pattern: SAFE_ID_PATTERN }) }),
        body: t.Object({
          role: roleSchema,
          ttlHours: t.Optional(t.Number({ exclusiveMinimum: 0, maximum: INVITE_MAX_TTL_HOURS })),
        }),
      },
    )
    // Pratinjau tanpa efek samping: hanya membuka isi undangan yang sudah ditandatangani + judul room + identitas sesi
    // pemanggil sendiri. Tidak ada daftar member/info user lain yang keluar.
    .get(
      "/invites/preview",
      async ({ query, request, status }) => {
        const invite = verifyInvite(query.invite, secret);
        if (!invite) return status(HTTP_BAD_REQUEST, apiError("invite_invalid", "invite invalid or expired"));
        const user = await getSessionUser(request, deps);
        const room = gate(invite.roomId, user?.id ?? null);
        if (!room.ok) return status(room.code, room.body);
        return {
          roomId: invite.roomId,
          roomTitle: room.title,
          role: invite.role,
          expiresAt: invite.exp * MS_PER_SECOND,
          currentUser: user,
          effectiveRole: user ? maxRole(invite.role, memberRole(invite.roomId, user.id)) : invite.role,
        } satisfies InvitePreview;
      },
      { query: t.Object({ invite: t.String({ maxLength: INVITE_MAX_LENGTH }) }) },
    )
    .post(
      "/invites/accept",
      ({ body, request, user, set, status }) => {
        const ip = clientIp(request, config.trustProxy);
        const retryAfter = accepts.retryAfter(ip);
        if (retryAfter > 0) {
          set.headers["retry-after"] = String(retryAfter);
          return status(HTTP_TOO_MANY_REQUESTS, apiError("rate_limited", `too many invite accepts, retry in ${retryAfter}s`));
        }
        accepts.hit(ip);
        const invite = verifyInvite(body.invite, secret);
        if (!invite) return status(HTTP_BAD_REQUEST, apiError("invite_invalid", "invite invalid or expired"));
        const room = gate(invite.roomId, user.id);
        if (!room.ok) return status(room.code, room.body);
        const role = db.transaction(() => {
          db.query(UPSERT_MEMBER).run(invite.roomId, user.id, invite.role);
          return memberRole(invite.roomId, user.id) ?? invite.role;
        })();
        return { user, roomId: invite.roomId, role } satisfies AcceptInviteResponse;
      },
      // Wajib sesi (login Google dulu); tidak ada lagi akun tamu.
      { auth: "user", body: t.Object({ invite: t.String({ maxLength: INVITE_MAX_LENGTH }) }) },
    );
}
