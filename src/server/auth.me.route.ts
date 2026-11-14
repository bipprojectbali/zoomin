import { Elysia, t } from "elysia";
import type { MySession, UserResponse } from "../shared/api.types";
import type { ApiDeps } from "./api.deps";
import { apiError } from "./api.error";
import { authGuard, toSessionUser } from "./auth.guard";

const HTTP_NO_CONTENT = 204;
const HTTP_BAD_REQUEST = 400;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const NAME_MAX = 60;
const IMAGE_URL_MAX = 2048;

/** URL foto profil: hanya https absolut (cegah javascript:/data:/http campuran). */
function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    // URL tidak bisa di-parse = input user tidak valid, bukan error server.
    return false;
  }
}

const epoch = (d: Date | string) => new Date(d).getTime();

/** Route akun sendiri: GET/PATCH/DELETE /me dan daftar/cabut sesi (RND/plan/05-auth-roles.md §Endpoint). */
export function meRoutes(deps: ApiDeps) {
  const ctx = () => deps.auth.$context;
  return new Elysia({ name: "auth.me" })
    .use(authGuard(deps))
    .get("/me", ({ user }) => ({ user }) satisfies UserResponse, { auth: "user" })
    .patch(
      "/me",
      async ({ user, body, status }) => {
        const patch: { name?: string; image?: string | null } = {};
        if (body.name !== undefined) {
          const name = body.name.trim();
          if (name.length < 1 || name.length > NAME_MAX) return status(HTTP_BAD_REQUEST, apiError("invalid_input", `name must be 1-${NAME_MAX} characters`, "/name"));
          patch.name = name;
        }
        if (body.image !== undefined) {
          if (body.image !== null && !isHttpsUrl(body.image)) return status(HTTP_BAD_REQUEST, apiError("invalid_input", "image must be an https URL or null", "/image"));
          patch.image = body.image;
        }
        if (Object.keys(patch).length === 0) return { user } satisfies UserResponse;
        const updated = await (await ctx()).internalAdapter.updateUser(user.id, patch);
        if (!updated) throw new Error(`PATCH /me: updateUser ${user.id} tidak mengembalikan user`);
        return { user: toSessionUser(updated) } satisfies UserResponse;
      },
      {
        auth: "user",
        body: t.Object({
          name: t.Optional(t.String({ maxLength: 200 })),
          image: t.Optional(t.Union([t.String({ maxLength: IMAGE_URL_MAX }), t.Null()])),
        }),
      },
    )
    .delete(
      "/me",
      async ({ user, set, status }) => {
        // super_admin berasal dari env (A4); hapus akun sendiri tidak masuk akal → tolak.
        if (user.role === "super_admin") return status(HTTP_FORBIDDEN, apiError("insufficient_role", "super_admin cannot delete own account"));
        await (await ctx()).internalAdapter.deleteUser(user.id);
        set.status = HTTP_NO_CONTENT;
        return null;
      },
      { auth: "user" },
    )
    .get(
      "/me/sessions",
      async ({ user, sessionId }) => {
        const sessions = await (await ctx()).internalAdapter.listSessions(user.id);
        const items: MySession[] = sessions.map((s) => ({
          id: s.id,
          current: s.id === sessionId,
          userAgent: s.userAgent || null,
          ip: s.ipAddress || null,
          createdAt: epoch(s.createdAt),
          expiresAt: epoch(s.expiresAt),
        }));
        return { items };
      },
      { auth: "user" },
    )
    .delete(
      "/me/sessions",
      async ({ user, sessionId, set }) => {
        const c = await ctx();
        const others = (await c.internalAdapter.listSessions(user.id)).filter((s) => s.id !== sessionId).map((s) => s.token);
        if (others.length) await c.internalAdapter.deleteSessions(others);
        set.status = HTTP_NO_CONTENT;
        return null;
      },
      { auth: "user" },
    )
    .delete(
      "/me/sessions/:id",
      async ({ user, params, set, status }) => {
        const c = await ctx();
        const target = (await c.internalAdapter.listSessions(user.id)).find((s) => s.id === params.id);
        // Sesi user lain diperlakukan sama dengan tidak ada (tidak membocorkan keberadaan id).
        if (!target) return status(HTTP_NOT_FOUND, apiError("not_found", "session not found"));
        await c.internalAdapter.deleteSession(target.token);
        set.status = HTTP_NO_CONTENT;
        return null;
      },
      { auth: "user", params: t.Object({ id: t.String({ minLength: 1, maxLength: 128 }) }) },
    );
}
