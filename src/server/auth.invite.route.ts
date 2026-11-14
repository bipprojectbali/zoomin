import { Elysia, t } from "elysia";
import { type AcceptInviteResponse, type CreateInviteResponse, type InvitePreview, type RoomRole, SAFE_ID_PATTERN } from "../shared/api.types";
import type { ApiDeps } from "./api.deps";
import { apiError } from "./api.error";
import { authGuard, getSessionUser, hasRole } from "./auth.guard";
import { createInvite, INVITE_DEFAULT_TTL_HOURS, INVITE_MAX_TTL_HOURS, verifyInvite } from "./auth.invite";
import { clientIp, createRateLimiter } from "./auth.ratelimit";

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
  const roomTitle = (roomId: string) =>
    db.query<{ title: string }, [string]>("SELECT title FROM rooms WHERE id = ?").get(roomId)?.title ?? null;
  const memberRole = (roomId: string, userId: string) =>
    db
      .query<{ role: RoomRole }, [string, string]>("SELECT role FROM room_members WHERE room_id = ? AND user_id = ?")
      .get(roomId, userId)?.role ?? null;

  return new Elysia({ name: "auth.invite" })
    .use(authGuard(deps))
    .post(
      "/rooms/:roomId/invites",
      ({ params: { roomId }, body, user, status }) => {
        if (roomTitle(roomId) === null) return status(HTTP_NOT_FOUND, apiError("room_not_found", "room not found"));
        if (!hasRole(user, "admin") && memberRole(roomId, user.id) !== "host") return status(HTTP_FORBIDDEN, apiError("forbidden", "forbidden"));
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
        const title = roomTitle(invite.roomId);
        if (title === null) return status(HTTP_NOT_FOUND, apiError("room_not_found", "room not found"));
        const user = await getSessionUser(request, deps);
        return {
          roomId: invite.roomId,
          roomTitle: title,
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
        if (roomTitle(invite.roomId) === null) return status(HTTP_NOT_FOUND, apiError("room_not_found", "room not found"));
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
