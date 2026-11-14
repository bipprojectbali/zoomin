import { randomBytes } from "node:crypto";
import { Elysia, t } from "elysia";
import {
  type AcceptInviteResponse,
  type CreateInviteResponse,
  type InvitePreview,
  type Role,
  SAFE_ID_PATTERN,
  type SessionUser,
} from "../shared/api.types";
import type { ApiDeps } from "./api.deps";
import { apiError } from "./api.error";
import { createInvite, INVITE_DEFAULT_TTL_HOURS, INVITE_MAX_TTL_HOURS, verifyInvite } from "./auth.invite";
import { clientIp, createRateLimiter } from "./auth.ratelimit";
import { createSessionCookie, getSessionUser, SESSION_TTL_SECONDS } from "./auth.session";

const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_TOO_MANY_REQUESTS = 429;
/**
 * R17: maks POST /invites/accept per IP per jendela (cegah spam akun tamu). Semua percobaan dihitung.
 * 200 (bukan 20): banyak tamu sah bisa berbagi satu IP NAT (kantor/kelas); undangan sudah bertanda tangan HMAC,
 * jadi limit ini hanya penahan spam, bukan pertahanan utama.
 */
export const INVITE_ACCEPT_MAX = 200;
export const INVITE_ACCEPT_WINDOW_MS = 60 * 60 * 1000;
const SECONDS_PER_HOUR = 3600;
const GUEST_NAME_MAX = 60;
const GUEST_ID_LENGTH = 20;
const INVITE_MAX_LENGTH = 2048;
const BASE62 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
/** Kelipatan 62 terbesar ≤ 256; byte di atasnya dibuang agar distribusi rata. */
const UNBIASED_LIMIT = 248;

const roleSchema = t.Union([t.Literal("admin"), t.Literal("participant"), t.Literal("viewer")]);
const MS_PER_SECOND = 1000;
const ROLE_RANK: Record<Role, number> = { viewer: 1, participant: 2, admin: 3 };
/** Role tertinggi dari dua role (null = belum member). Selaras dengan UPSERT_MEMBER yang hanya menaikkan role. */
const maxRole = (a: Role, b: Role | null): Role => (b && ROLE_RANK[b] > ROLE_RANK[a] ? b : a);

/** Id user tamu `u_` + 20 char base62 (rejection sampling agar tanpa bias modulo); cocok SAFE_ID_PATTERN. */
export function newGuestId(): string {
  let id = "u_";
  while (id.length < GUEST_ID_LENGTH + 2) {
    for (const b of randomBytes(GUEST_ID_LENGTH)) {
      if (b < UNBIASED_LIMIT && id.length < GUEST_ID_LENGTH + 2) id += BASE62[b % BASE62.length];
    }
  }
  return id;
}

// Upsert membership yang hanya menaikkan role (admin > participant > viewer), tidak pernah menurunkan.
const RANK = (col: string) => `(CASE ${col} WHEN 'admin' THEN 3 WHEN 'participant' THEN 2 ELSE 1 END)`;
const UPSERT_MEMBER =
  "INSERT INTO room_members (room_id, user_id, role) VALUES (?, ?, ?) " +
  `ON CONFLICT(room_id, user_id) DO UPDATE SET role = excluded.role WHERE ${RANK("excluded.role")} > ${RANK("room_members.role")}`;

/** Route undangan: buat (admin room / admin global), pratinjau, dan terima (tamu atau user bersesi). */
export function inviteRoutes({ db, config }: ApiDeps) {
  const secure = config.nodeEnv === "production";
  const accepts = createRateLimiter(INVITE_ACCEPT_MAX, INVITE_ACCEPT_WINDOW_MS);
  const roomTitle = (roomId: string) =>
    db.query<{ title: string }, [string]>("SELECT title FROM rooms WHERE id = ?").get(roomId)?.title ?? null;
  const memberRole = (roomId: string, userId: string) =>
    db
      .query<{ role: Role }, [string, string]>("SELECT role FROM room_members WHERE room_id = ? AND user_id = ?")
      .get(roomId, userId)?.role ?? null;

  return new Elysia({ name: "auth.invite" })
    .post(
      "/rooms/:roomId/invites",
      ({ params: { roomId }, body, request, status }) => {
        const user = getSessionUser(request, db, config.sessionSecret);
        if (!user) return status(HTTP_UNAUTHORIZED, apiError("unauthorized", "unauthorized"));
        if (roomTitle(roomId) === null) return status(HTTP_NOT_FOUND, apiError("room_not_found", "room not found"));
        if (!user.isAdmin && memberRole(roomId, user.id) !== "admin") return status(HTTP_FORBIDDEN, apiError("forbidden", "forbidden"));
        const ttlSeconds = Math.round((body.ttlHours ?? INVITE_DEFAULT_TTL_HOURS) * SECONDS_PER_HOUR);
        const now = Math.floor(Date.now() / 1000);
        const invite = createInvite({ roomId, role: body.role, ttlSeconds }, config.sessionSecret, now);
        // expiresAt dalam milidetik epoch (sama dengan Date.now() di client).
        return { url: `${config.publicAppUrl}/invite/${invite}`, expiresAt: (now + ttlSeconds) * MS_PER_SECOND } satisfies CreateInviteResponse;
      },
      {
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
      ({ query, request, status }) => {
        const invite = verifyInvite(query.invite, config.sessionSecret);
        if (!invite) return status(HTTP_BAD_REQUEST, apiError("invite_invalid", "invite invalid or expired"));
        const title = roomTitle(invite.roomId);
        if (title === null) return status(HTTP_NOT_FOUND, apiError("room_not_found", "room not found"));
        const user = getSessionUser(request, db, config.sessionSecret);
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
      ({ body, request, set, status }) => {
        const ip = clientIp(request, config.trustProxy);
        const retryAfter = accepts.retryAfter(ip);
        if (retryAfter > 0) {
          set.headers["retry-after"] = String(retryAfter);
          return status(HTTP_TOO_MANY_REQUESTS, apiError("rate_limited", `too many invite accepts, retry in ${retryAfter}s`));
        }
        accepts.hit(ip);
        const invite = verifyInvite(body.invite, config.sessionSecret);
        if (!invite) return status(HTTP_BAD_REQUEST, apiError("invite_invalid", "invite invalid or expired"));
        // UX-08: user bersesi tetap memakai identitasnya; `name` hanya untuk tamu baru (diabaikan bila bersesi).
        const existing = getSessionUser(request, db, config.sessionSecret);
        const name = body.name?.trim() ?? "";
        if (!existing && (name.length < 1 || name.length > GUEST_NAME_MAX)) {
          return status(HTTP_BAD_REQUEST, apiError("invalid_input", `name must be 1-${GUEST_NAME_MAX} characters`, "/name"));
        }
        if (roomTitle(invite.roomId) === null) return status(HTTP_NOT_FOUND, apiError("room_not_found", "room not found"));

        const { user, role } = db.transaction(() => {
          const u: SessionUser = existing ?? { id: newGuestId(), name, isAdmin: false };
          if (!existing) db.query("INSERT INTO users (id, name, is_admin, created_at) VALUES (?, ?, 0, ?)").run(u.id, u.name, Date.now());
          db.query(UPSERT_MEMBER).run(invite.roomId, u.id, invite.role);
          return { user: u, role: memberRole(invite.roomId, u.id) ?? invite.role };
        })();
        set.headers["set-cookie"] = createSessionCookie(user.id, config.sessionSecret, SESSION_TTL_SECONDS, secure);
        return { user, roomId: invite.roomId, role } satisfies AcceptInviteResponse;
      },
      { body: t.Object({ invite: t.String({ maxLength: INVITE_MAX_LENGTH }), name: t.Optional(t.String()) }) },
    );
}
