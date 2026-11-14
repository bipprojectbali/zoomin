import { Elysia, t } from "elysia";
import type { AuditAction } from "../shared/api.types";
import { summarizeConfig } from "../cli/cli.check";
import { AdminActionError, setGlobalRole } from "./admin.service";
import type { ApiDeps } from "./api.deps";
import { apiError } from "./api.error";
import { AUDIT_PAGE_MAX, listAudit } from "./audit.repository";
import { authGuard } from "./auth.guard";
import { getSystemHealth } from "./dev.health";
import { InvalidCursorError } from "./rooms.repository";
import { getSettings, InvalidSettingsError, updateSettings } from "./settings.repository";

const HTTP_BAD_REQUEST = 400;

// Record (bukan array) agar tsc gagal bila AuditAction bertambah tapi validasi query belum ikut.
const AUDIT_ACTIONS: Record<AuditAction, true> = {
  "user.ban": true,
  "user.unban": true,
  "user.delete": true,
  "user.role": true,
  "user.sessions.revoke": true,
  "room.create": true,
  "room.delete": true,
  "room.update": true,
  "room.visibility": true,
  "room.activate": true,
  "room.deactivate": true,
  "room.expiry": true,
  "room.member.add": true,
  "room.member.role": true,
  "room.member.remove": true,
  "setting.update": true,
};
const auditActionSchema = t.Union((Object.keys(AUDIT_ACTIONS) as AuditAction[]).map((a) => t.Literal(a)));

/** Plugin route /dev/* (super_admin): health, audit, settings, config non-rahasia, ubah peran global (A5). */
export function devRoutes(deps: ApiDeps) {
  return new Elysia({ name: "dev", prefix: "/dev" })
    .use(authGuard(deps))
    .get("/health", () => getSystemHealth(deps), { auth: "super_admin" })
    .get(
      "/audit",
      ({ query, status }) => {
        try {
          return listAudit(deps.db, query);
        } catch (cause) {
          if (cause instanceof InvalidCursorError) return status(HTTP_BAD_REQUEST, apiError("invalid_input", "invalid cursor", "/cursor"));
          throw cause;
        }
      },
      {
        auth: "super_admin",
        query: t.Object({
          action: t.Optional(auditActionSchema),
          actorId: t.Optional(t.String({ minLength: 1 })),
          limit: t.Optional(t.Numeric({ minimum: 1, maximum: AUDIT_PAGE_MAX })),
          cursor: t.Optional(t.String({ minLength: 1 })),
        }),
      },
    )
    .get("/settings", () => getSettings(deps.db), { auth: "super_admin" })
    .put(
      "/settings",
      ({ user, body, status }) => {
        try {
          return updateSettings(deps.db, body, user);
        } catch (cause) {
          if (cause instanceof InvalidSettingsError) return status(HTTP_BAD_REQUEST, apiError("invalid_input", cause.message, cause.path));
          throw cause;
        }
      },
      { auth: "super_admin", body: t.Object({ allowedEmailDomains: t.Array(t.String()) }) },
    )
    // summarizeConfig: secret hanya "diset"/"kosong", email super admin hanya jumlah.
    .get("/config", () => summarizeConfig(deps.config), { auth: "super_admin" })
    .put(
      "/users/:id/role",
      async ({ user, params, body, status }) => {
        try {
          return { user: await setGlobalRole(deps, user, params.id, body.role) };
        } catch (cause) {
          if (cause instanceof AdminActionError) return status(cause.status, apiError(cause.code, cause.message));
          throw cause;
        }
      },
      {
        auth: "super_admin",
        params: t.Object({ id: t.String({ minLength: 1 }) }),
        // super_admin sengaja tidak ada di union: hanya dari SUPER_ADMIN_EMAILS (A4) → 400 invalid_input.
        body: t.Object({ role: t.Union([t.Literal("user"), t.Literal("admin")]) }),
      },
    );
}
