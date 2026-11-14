import { randomBytes } from "node:crypto";
import { Elysia, t } from "elysia";
import {
  type AcceptInviteResponse,
  type ApiError,
  type CreateInviteResponse,
  type Role,
  SAFE_ID_PATTERN,
  type SessionUser,
} from "../shared/api.types";
import type { ApiDeps } from "./api.deps";
import { createInvite, INVITE_DEFAULT_TTL_HOURS, INVITE_MAX_TTL_HOURS, verifyInvite } from "./auth.invite";
import { createSessionCookie, getSessionUser, SESSION_TTL_SECONDS } from "./auth.session";

const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const SECONDS_PER_HOUR = 3600;
const GUEST_NAME_MAX = 60;
const GUEST_ID_LENGTH = 20;
const INVITE_MAX_LENGTH = 2048;
const BASE62 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
/** Kelipatan 62 terbesar ≤ 256; byte di atasnya dibuang agar distribusi rata. */
const UNBIASED_LIMIT = 248;

const roleSchema = t.Union([t.Literal("admin"), t.Literal("participant"), t.Literal("viewer")]);
const err = (error: string): ApiError => ({ error });

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

/** Route undangan: buat (admin room / admin global) dan terima (tamu atau user bersesi). */
export function inviteRoutes({ db, config }: ApiDeps) {
  const secure = config.nodeEnv === "production";
  const roomExists = (roomId: string) => db.query("SELECT 1 FROM rooms WHERE id = ?").get(roomId) !== null;
  const memberRole = (roomId: string, userId: string) =>
    db
      .query<{ role: Role }, [string, string]>("SELECT role FROM room_members WHERE room_id = ? AND user_id = ?")
      .get(roomId, userId)?.role ?? null;

  return new Elysia({ name: "auth.invite" })
    .post(
      "/rooms/:roomId/invites",
      ({ params: { roomId }, body, request, status }) => {
        const user = getSessionUser(request, db, config.sessionSecret);
        if (!user) return status(HTTP_UNAUTHORIZED, err("unauthorized"));
        if (!roomExists(roomId)) return status(HTTP_NOT_FOUND, err("room not found"));
        if (!user.isAdmin && memberRole(roomId, user.id) !== "admin") return status(HTTP_FORBIDDEN, err("forbidden"));
        const ttlSeconds = Math.round((body.ttlHours ?? INVITE_DEFAULT_TTL_HOURS) * SECONDS_PER_HOUR);
        const now = Math.floor(Date.now() / 1000);
        const invite = createInvite({ roomId, role: body.role, ttlSeconds }, config.sessionSecret, now);
        // expiresAt dalam milidetik epoch (sama dengan Date.now() di client).
        return { url: `${config.publicAppUrl}/invite/${invite}`, expiresAt: (now + ttlSeconds) * 1000 } satisfies CreateInviteResponse;
      },
      {
        params: t.Object({ roomId: t.String({ pattern: SAFE_ID_PATTERN }) }),
        body: t.Object({
          role: roleSchema,
          ttlHours: t.Optional(t.Number({ exclusiveMinimum: 0, maximum: INVITE_MAX_TTL_HOURS })),
        }),
      },
    )
    .post(
      "/invites/accept",
      ({ body, request, set, status }) => {
        const invite = verifyInvite(body.invite, config.sessionSecret);
        if (!invite) return status(HTTP_BAD_REQUEST, err("invite invalid or expired"));
        const name = body.name.trim();
        if (name.length < 1 || name.length > GUEST_NAME_MAX) {
          return status(HTTP_BAD_REQUEST, { error: `name must be 1-${GUEST_NAME_MAX} characters`, path: "/name" });
        }
        if (!roomExists(invite.roomId)) return status(HTTP_NOT_FOUND, err("room not found"));

        const user: SessionUser = db.transaction(() => {
          const existing = getSessionUser(request, db, config.sessionSecret);
          const u = existing ?? { id: newGuestId(), name, isAdmin: false };
          if (!existing) db.query("INSERT INTO users (id, name, is_admin, created_at) VALUES (?, ?, 0, ?)").run(u.id, u.name, Date.now());
          db.query(UPSERT_MEMBER).run(invite.roomId, u.id, invite.role);
          return u;
        })();
        set.headers["set-cookie"] = createSessionCookie(user.id, config.sessionSecret, SESSION_TTL_SECONDS, secure);
        return { user, roomId: invite.roomId } satisfies AcceptInviteResponse;
      },
      { body: t.Object({ invite: t.String({ maxLength: INVITE_MAX_LENGTH }), name: t.String() }) },
    );
}
