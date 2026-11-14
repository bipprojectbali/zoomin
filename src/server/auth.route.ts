import { createHash, timingSafeEqual } from "node:crypto";
import { Elysia, t } from "elysia";
import type { ApiError, UserResponse } from "../shared/api.types";
import type { ApiDeps } from "./api.deps";
import { inviteRoutes } from "./auth.invite.route";
import { clearSessionCookie, createSessionCookie, getSessionUser, SESSION_TTL_SECONDS } from "./auth.session";

const HTTP_NO_CONTENT = 204;
const HTTP_UNAUTHORIZED = 401;
/** User id tetap admin global (K2). */
export const ADMIN_USER_ID = "admin";
const ADMIN_NAME = "Admin";

const UNAUTHORIZED: ApiError = { error: "unauthorized" };
const sha256 = (value: string) => createHash("sha256").update(value).digest();

/** Plugin route auth: /me, admin-login, logout, plus undangan (lihat kontrak di src/shared/api.types.ts). */
export function authRoutes(deps: ApiDeps) {
  const { db, config } = deps;
  const secure = config.nodeEnv === "production";

  return new Elysia({ name: "auth" })
    .get("/me", ({ request, status }) => {
      const user = getSessionUser(request, db, config.sessionSecret);
      return user ? ({ user } satisfies UserResponse) : status(HTTP_UNAUTHORIZED, UNAUTHORIZED);
    })
    .post(
      "/auth/admin-login",
      ({ body, set, status }) => {
        // Hash dulu kedua sisi supaya panjang sama; timingSafeEqual tidak membocorkan panjang password.
        if (!timingSafeEqual(sha256(body.password), sha256(config.adminPassword))) {
          return status(HTTP_UNAUTHORIZED, UNAUTHORIZED);
        }
        const row = db
          .query<{ id: string; name: string }, [string, string, number]>(
            "INSERT INTO users (id, name, is_admin, created_at) VALUES (?, ?, 1, ?) " +
              "ON CONFLICT(id) DO UPDATE SET is_admin = 1 RETURNING id, name",
          )
          .get(ADMIN_USER_ID, ADMIN_NAME, Date.now());
        if (!row) throw new Error(`admin-login: upsert user ${ADMIN_USER_ID} tidak mengembalikan baris`);
        const user = { id: row.id, name: row.name, isAdmin: true };
        set.headers["set-cookie"] = createSessionCookie(user.id, config.sessionSecret, SESSION_TTL_SECONDS, secure);
        return { user } satisfies UserResponse;
      },
      { body: t.Object({ password: t.String() }) },
    )
    .post("/auth/logout", ({ set }) => {
      set.headers["set-cookie"] = clearSessionCookie(secure);
      set.status = HTTP_NO_CONTENT;
      return null;
    })
    .use(inviteRoutes(deps));
}

