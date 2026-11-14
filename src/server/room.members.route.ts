import { Elysia, t } from "elysia";
import { SAFE_ID_PATTERN, type SessionUser } from "../shared/api.types";
import type { ApiDeps } from "./api.deps";
import { apiError } from "./api.error";
import { authGuard } from "./auth.guard";
import { getAllowedEmailDomains, isEmailDomainAllowed } from "./auth.better";
import { canManageRoom } from "./room.access";
import {
  addRoomMember,
  cancelRoomInvitation,
  LastHostError,
  listRoomMembers,
  MEMBERS_PAGE_MAX,
  MemberNotFoundError,
  removeRoomMember,
  updateRoomMemberRole,
} from "./room.members.repository";
import { InvalidCursorError, roomExists } from "./rooms.repository";

const HTTP_CREATED = 201;
const HTTP_NO_CONTENT = 204;
const HTTP_BAD_REQUEST = 400;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const EMAIL_MAX_LENGTH = 254;
// Validasi sengaja longgar (satu @, ada titik di domain, tanpa spasi); kepemilikan email dibuktikan login Google.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const roleSchema = t.Union([t.Literal("host"), t.Literal("participant"), t.Literal("viewer")]);
/** Skema body satu anggota (POST /members dan `members[]` POST /rooms). */
export const memberBodySchema = t.Object({ email: t.String({ minLength: 3, maxLength: EMAIL_MAX_LENGTH }), role: roleSchema });

/**
 * Normalisasi email undangan (trim + lowercase) lalu cek format dan allowlist domain. Sama dengan aturan login (A9):
 * super_admin env dikecualikan dari allowlist.
 */
export function checkInviteEmail(deps: Pick<ApiDeps, "db" | "config">, raw: string) {
  const email = raw.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email)) return { ok: false, code: "invalid_input", error: "invalid email" } as const;
  if (!deps.config.superAdminEmails.includes(email) && !isEmailDomainAllowed(email, getAllowedEmailDomains(deps.db))) {
    return { ok: false, code: "email_domain_not_allowed", error: "email domain not allowed" } as const;
  }
  return { ok: true, email } as const;
}
const roomParams = { roomId: t.String({ pattern: SAFE_ID_PATTERN }) };

type Status = (code: number, body: unknown) => unknown;

/** Petakan error domain repository ke respons kontrak; error lain dilempar ulang (500 global). */
function mapError(cause: unknown, status: Status) {
  if (cause instanceof LastHostError) return status(HTTP_CONFLICT, apiError("last_host", "cannot remove or demote the last host"));
  if (cause instanceof MemberNotFoundError) return status(HTTP_NOT_FOUND, apiError("member_not_found", "member not found"));
  if (cause instanceof InvalidCursorError) return status(HTTP_BAD_REQUEST, apiError("invalid_input", "invalid cursor", "/cursor"));
  throw cause;
}

/** Route kelola anggota room (RND/plan/06 R2, R9): hanya pengelola room (R3). */
export function roomMembersRoutes(deps: ApiDeps) {
  const { db } = deps;
  // 404 bila room tak ada, 403 bila bukan pengelola; null = boleh lanjut.
  const denied = (user: SessionUser, roomId: string, status: Status) => {
    if (!roomExists(db, roomId)) return status(HTTP_NOT_FOUND, apiError("room_not_found", "room not found"));
    if (!canManageRoom(db, user, roomId)) return status(HTTP_FORBIDDEN, apiError("forbidden", "not a manager of this room"));
    return null;
  };

  return new Elysia({ name: "room.members" })
    .use(authGuard(deps))
    .get(
      "/rooms/:roomId/members",
      ({ user, params: { roomId }, query, status }) => {
        try {
          return denied(user, roomId, status) ?? listRoomMembers(db, roomId, query);
        } catch (cause) {
          return mapError(cause, status);
        }
      },
      {
        auth: "user",
        params: t.Object(roomParams),
        query: t.Object({ limit: t.Optional(t.Numeric({ minimum: 1, maximum: MEMBERS_PAGE_MAX })), cursor: t.Optional(t.String({ minLength: 1 })) }),
      },
    )
    .post(
      "/rooms/:roomId/members",
      ({ user, params: { roomId }, body, status }) => {
        const blocked = denied(user, roomId, status);
        if (blocked) return blocked;
        const checked = checkInviteEmail(deps, body.email);
        if (!checked.ok) return status(HTTP_BAD_REQUEST, apiError(checked.code, checked.error, "/email"));
        try {
          return status(HTTP_CREATED, addRoomMember(db, roomId, checked.email, body.role, user));
        } catch (cause) {
          return mapError(cause, status);
        }
      },
      { auth: "user", params: t.Object(roomParams), body: memberBodySchema },
    )
    .patch(
      "/rooms/:roomId/members/:userId",
      ({ user, params: { roomId, userId }, body, status }) => {
        try {
          return denied(user, roomId, status) ?? updateRoomMemberRole(db, roomId, userId, body.role, user);
        } catch (cause) {
          return mapError(cause, status);
        }
      },
      { auth: "user", params: t.Object({ ...roomParams, userId: t.String({ minLength: 1 }) }), body: t.Object({ role: roleSchema }) },
    )
    .delete(
      "/rooms/:roomId/members/:userId",
      async ({ user, params: { roomId, userId }, status }) => {
        try {
          const blocked = denied(user, roomId, status);
          if (blocked) return blocked;
          removeRoomMember(db, roomId, userId, user);
        } catch (cause) {
          return mapError(cause, status);
        }
        try {
          await deps.roomService.removeParticipant(roomId, userId);
        } catch (cause) {
          // Biasa: user tidak sedang di room / room tidak live. Keanggotaan sudah dihapus; token baru akan ditolak.
          console.warn(`room.members: removeParticipant room=${roomId} user=${userId} gagal`, cause instanceof Error ? cause.message : cause);
        }
        return status(HTTP_NO_CONTENT, null);
      },
      { auth: "user", params: t.Object({ ...roomParams, userId: t.String({ minLength: 1 }) }) },
    )
    .delete(
      "/rooms/:roomId/invitations/:email",
      ({ user, params: { roomId, email }, status }) => {
        try {
          const blocked = denied(user, roomId, status);
          if (blocked) return blocked;
          cancelRoomInvitation(db, roomId, email.trim().toLowerCase(), user);
          return status(HTTP_NO_CONTENT, null);
        } catch (cause) {
          return mapError(cause, status);
        }
      },
      { auth: "user", params: t.Object({ ...roomParams, email: t.String({ minLength: 1, maxLength: EMAIL_MAX_LENGTH }) }) },
    );
}
