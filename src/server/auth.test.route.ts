import { Elysia, t } from "elysia";
import type { UserResponse } from "../shared/api.types";
import type { ApiDeps } from "./api.deps";
import { apiError } from "./api.error";
import { EMAIL_DOMAIN_NOT_ALLOWED, BETTER_AUTH_BANNED_CODE } from "./auth.better";
import { getSessionUser } from "./auth.guard";

const HTTP_FORBIDDEN = 403;

type TestLogin = (input: { body: { email: string; name?: string }; returnHeaders: true }) => Promise<{ headers: Headers }>;
type AuthApiError = { statusCode?: number; body?: { code?: string; message?: string } };

/**
 * POST /test/login (A12): login tanpa Google untuk e2e/test. Dipasang api.ts HANYA bila config.testAuth
 * (NODE_ENV != production DAN ZOOMIN_TEST_AUTH=1); selain itu route tidak ada → 404. Membuat sesi Better Auth asli
 * lewat endpoint server-only `auth.api.testLogin` (auth.better.ts), jadi cookie & hook sama dengan login Google.
 */
export function testLoginRoutes(deps: ApiDeps) {
  const testLogin = (deps.auth.api as unknown as { testLogin?: TestLogin }).testLogin;
  if (!deps.config.testAuth || !testLogin) throw new Error("testLoginRoutes: dipanggil tanpa config.testAuth");
  return new Elysia({ name: "auth.test" }).post(
    "/test/login",
    async ({ body, set, status }) => {
      let headers: Headers;
      try {
        ({ headers } = await testLogin({ body: { email: body.email.trim().toLowerCase(), name: body.name?.trim() || undefined }, returnHeaders: true }));
      } catch (cause) {
        const code = (cause as AuthApiError).body?.code;
        if (code === EMAIL_DOMAIN_NOT_ALLOWED) return status(HTTP_FORBIDDEN, apiError("email_domain_not_allowed", "email domain not allowed"));
        if (code === BETTER_AUTH_BANNED_CODE) return status(HTTP_FORBIDDEN, apiError("banned", "user is banned"));
        throw new Error(`POST /test/login: testLogin gagal untuk ${body.email}`, { cause });
      }
      const cookies = headers.getSetCookie();
      set.headers["set-cookie"] = cookies;
      const cookie = cookies.map((c) => c.split(";")[0]).join("; ");
      const user = await getSessionUser(new Request("http://internal/", { headers: { cookie } }), deps);
      if (!user) throw new Error(`POST /test/login: sesi baru ${body.email} tidak terbaca`);
      return { user } satisfies UserResponse;
    },
    { body: t.Object({ email: t.String({ format: "email", maxLength: 254 }), name: t.Optional(t.String({ maxLength: 60 })) }) },
  );
}
