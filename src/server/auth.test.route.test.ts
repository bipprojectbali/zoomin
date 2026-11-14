import { describe, expect, test } from "bun:test";
import { createTestDeps, TEST_SUPER_ADMIN_EMAIL } from "../../test/auth.helpers";
import type { ApiError, UserResponse } from "../shared/api.types";
import { createApi } from "./api";
import type { ApiDeps } from "./api.deps";
import { createAuth } from "./auth.better";
import { loadConfig } from "./config";

const login = (deps: ApiDeps, body: unknown) =>
  createApi(deps).handle(
    new Request("http://localhost/api/test/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  );

/** Deps dengan env persis (tanpa default ZOOMIN_TEST_AUTH dari createTestDeps). */
function depsWith(env: Record<string, string>): ApiDeps {
  const base = createTestDeps();
  const config = loadConfig({ DB_PATH: ":memory:", ...env });
  return { ...base, config, auth: createAuth({ db: base.db, config }) };
}

const PROD = {
  NODE_ENV: "production",
  LIVEKIT_API_KEY: "k", // test-only
  LIVEKIT_API_SECRET: "s", // test-only
  BETTER_AUTH_SECRET: "x".repeat(32), // test-only
  GOOGLE_CLIENT_ID: "gid", // test-only
  GOOGLE_CLIENT_SECRET: "gsecret", // test-only
};

describe("POST /api/test/login (A12)", () => {
  test("dev + ZOOMIN_TEST_AUTH=1 → user Better Auth + cookie sesi asli; /me memakai cookie itu; login ulang = user sama", async () => {
    const deps = createTestDeps();
    const res = await login(deps, { email: "Cici@Example.test", name: "Cici" });
    expect(res.status).toBe(200);
    const { user } = (await res.json()) as UserResponse;
    expect(user).toMatchObject({ email: "cici@example.test", name: "Cici", role: "user", image: null });
    const setCookie = res.headers.getSetCookie().join("\n");
    expect(setCookie).toContain("better-auth.session_token=");
    expect(setCookie).toContain("HttpOnly");
    const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    const me = await createApi(deps).handle(new Request("http://localhost/api/me", { headers: { cookie } }));
    expect(((await me.json()) as UserResponse).user.id).toBe(user.id);
    const again = (await (await login(deps, { email: "cici@example.test" })).json()) as UserResponse;
    expect(again.user.id).toBe(user.id);
  });

  test("sinkron super_admin berlaku; email invalid → 400", async () => {
    const deps = createTestDeps();
    expect(((await (await login(deps, { email: TEST_SUPER_ADMIN_EMAIL })).json()) as UserResponse).user.role).toBe("super_admin");
    const bad = await login(deps, { email: "bukan-email" });
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as ApiError).code).toBe("invalid_input");
  });

  test("domain ditolak → 403 email_domain_not_allowed", async () => {
    const deps = createTestDeps();
    deps.db.run(`INSERT INTO app_settings (key, value_json) VALUES ('allowed_email_domains', '["kantor.test"]')`);
    const res = await login(deps, { email: "a@luar.test" });
    expect(res.status).toBe(403);
    expect(((await res.json()) as ApiError).code).toBe("email_domain_not_allowed");
  });

  test("tanpa flag (dev) → 404", async () => {
    expect((await login(depsWith({}), { email: "a@example.test" })).status).toBe(404);
    expect((await login(depsWith({ ZOOMIN_TEST_AUTH: "true" }), { email: "a@example.test" })).status).toBe(404);
  });

  test("production walau ZOOMIN_TEST_AUTH=1 → 404, endpoint server-only juga tidak terpasang", async () => {
    const deps = depsWith({ ...PROD, ZOOMIN_TEST_AUTH: "1" });
    expect(deps.config.testAuth).toBe(false);
    expect((await login(deps, { email: "a@example.test" })).status).toBe(404);
    expect("testLogin" in deps.auth.api).toBe(false);
  });

  test("endpoint server-only testLogin tidak bisa dicapai lewat /api/auth/* walau flag aktif", async () => {
    const deps = createTestDeps();
    for (const path of ["/api/auth/test-login", "/api/auth/testLogin"]) {
      const res = await createApi(deps).handle(
        new Request(`http://localhost${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: '{"email":"a@example.test"}' }),
      );
      expect(res.status).toBe(404);
    }
  });
});
