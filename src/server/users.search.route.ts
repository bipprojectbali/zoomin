import { Elysia, t } from "elysia";
import { USER_SEARCH_MAX_RESULTS, type UserSearchResponse } from "../shared/api.types";
import type { ApiDeps } from "./api.deps";
import { apiError } from "./api.error";
import { authGuard, hasRole } from "./auth.guard";
import { createRateLimiter } from "./auth.ratelimit";
import { isHostAnywhere, searchUsers, USER_SEARCH_DEFAULT_RESULTS } from "./users.search.repository";

const HTTP_BAD_REQUEST = 400;
const HTTP_FORBIDDEN = 403;
const HTTP_TOO_MANY_REQUESTS = 429;
const USER_SEARCH_Q_MAX = 100;
/** P4: maks pencarian per user per jendela (autocomplete ber-debounce jauh di bawah ini). */
export const USER_SEARCH_RATE_MAX = 30;
export const USER_SEARCH_RATE_WINDOW_MS = 60 * 1000;

/** GET /users/search (P4, RND/plan/07-invite-picker.md): saran akun untuk pemilih undangan. Tidak diaudit, q tidak di-log. */
export function usersSearchRoutes(deps: ApiDeps) {
  const { db } = deps;
  const limiter = createRateLimiter(USER_SEARCH_RATE_MAX, USER_SEARCH_RATE_WINDOW_MS);
  return new Elysia({ name: "users.search" }).use(authGuard(deps)).get(
    "/users/search",
    ({ user, query, status, set }) => {
      if (!hasRole(user, "admin") && !isHostAnywhere(db, user.id)) {
        return status(HTTP_FORBIDDEN, apiError("insufficient_role", "requires admin or host of a room"));
      }
      // Kunci = user id: sesi wajib, jadi lebih adil daripada IP untuk user di balik NAT yang sama.
      const retryAfter = limiter.retryAfter(user.id);
      if (retryAfter > 0) {
        set.headers["retry-after"] = String(retryAfter);
        return status(HTTP_TOO_MANY_REQUESTS, apiError("rate_limited", "too many searches"));
      }
      limiter.hit(user.id);
      const q = (query.q ?? "").trim();
      if (q.length > USER_SEARCH_Q_MAX) {
        return status(HTTP_BAD_REQUEST, apiError("invalid_input", `q must be at most ${USER_SEARCH_Q_MAX} characters`, "/q"));
      }
      // Sengaja tanpa cursor (M5): daftar dropdown dibatasi limit; akun yang tak terlihat dicari lewat q.
      // limit > max dipangkas (bukan 400): autocomplete, klien lama tidak perlu gagal.
      const limit = Math.min(query.limit ?? USER_SEARCH_DEFAULT_RESULTS, USER_SEARCH_MAX_RESULTS);
      const body: UserSearchResponse = { items: searchUsers(db, q, limit) };
      return body;
    },
    {
      auth: "user",
      query: t.Object({
        q: t.Optional(t.String({ maxLength: USER_SEARCH_Q_MAX * 2 })),
        limit: t.Optional(t.Numeric({ minimum: 1 })),
      }),
    },
  );
}
