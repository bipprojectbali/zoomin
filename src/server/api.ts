import { Elysia } from "elysia";
import { adminRoutes } from "./admin.route";
import type { ApiDeps } from "./api.deps";
import { apiError } from "./api.error";
import { inviteRoutes } from "./auth.invite.route";
import { meRoutes } from "./auth.me.route";
import { devRoutes } from "./dev.route";
import { CLIENT_IP_HEADER, clientIp } from "./auth.ratelimit";
import { testLoginRoutes } from "./auth.test.route";
import { layoutRoutes } from "./layout.route";
import { roomMembersRoutes } from "./room.members.route";
import { roomsRoutes } from "./rooms.route";
import { tokenRoutes } from "./token.route";
import { usersSearchRoutes } from "./users.search.route";

const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;

/**
 * Endpoint plugin admin Better Auth (set-role, ban, impersonate, remove-user, ...) tidak menegakkan aturan A5
 * (admin tidak boleh menyentuh admin/super_admin, super_admin hanya dari env) → diblok dari HTTP. Aksi admin lewat
 * /api/admin/* dan /api/dev/* yang memanggil `auth.api.*` dari server.
 */
const BLOCKED_AUTH_PREFIX = "/api/auth/admin/";

/** App Elysia untuk semua endpoint /api. Tidak listen; dipasang oleh main.ts atau dites via `.handle()`. */
export function createApi(deps: ApiDeps) {
  const app = new Elysia({ prefix: "/api" })
    // Elysia default 422 untuk VALIDATION; kontrak API memakai 400 + code + path field yang gagal.
    // NOT_FOUND/PARSE juga dibungkus supaya semua error /api punya `code`.
    .onError({ as: "global" }, ({ code, error, status }) => {
      if (code === "NOT_FOUND") return status(HTTP_NOT_FOUND, apiError("not_found", "not found"));
      if (code === "PARSE") return status(HTTP_BAD_REQUEST, apiError("invalid_input", "invalid request body"));
      if (code !== "VALIDATION") return;
      const first = error.all[0];
      const path = first && "path" in first && first.path ? first.path : undefined;
      return status(HTTP_BAD_REQUEST, apiError("invalid_input", first?.summary ?? first?.message ?? "invalid request", path));
    })
    .get("/health", () => ({ ok: true }))
    // Handler Better Auth (pola resmi Bun/Elysia: teruskan Request mentah). parse "none": body dibaca Better Auth
    // sendiri, Elysia tidak boleh mengonsumsinya lebih dulu.
    .all(
      "/auth/*",
      ({ request, status }) => {
        if (new URL(request.url).pathname.startsWith(BLOCKED_AUTH_PREFIX)) return status(HTTP_NOT_FOUND, apiError("not_found", "not found"));
        // Satu sumber IP untuk rate limit Better Auth (advanced.ipAddress) = sumber limiter undangan.
        request.headers.set(CLIENT_IP_HEADER, clientIp(request, deps.config.trustProxy));
        return deps.auth.handler(request);
      },
      { parse: "none" },
    )
    .use(meRoutes(deps))
    .use(inviteRoutes(deps))
    .use(roomsRoutes(deps))
    .use(roomMembersRoutes(deps))
    .use(usersSearchRoutes(deps))
    .use(tokenRoutes(deps))
    .use(layoutRoutes(deps))
    .use(adminRoutes(deps))
    .use(devRoutes(deps));
  return deps.config.testAuth ? app.use(testLoginRoutes(deps)) : app;
}
