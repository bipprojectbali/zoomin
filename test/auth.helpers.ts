// Helper test bersama: deps API + user/sesi Better Auth asli tanpa Google (jalur A12, endpoint server-only testLogin).
import { RoomServiceClient } from "livekit-server-sdk";
import type { GlobalRole, SessionUser } from "../src/shared/api.types";
import type { ApiDeps } from "../src/server/api.deps";
import { createAuth } from "../src/server/auth.better";
import { getSessionUser } from "../src/server/auth.guard";
import { loadConfig } from "../src/server/config";
import { openDb } from "../src/server/db";
import { toHttpUrl } from "../src/server/livekit.proxy";

type Env = Record<string, string | undefined>;
type TestLogin = (input: { body: { email: string; name?: string }; returnHeaders: true }) => Promise<{ headers: Headers }>;

/** Email super_admin bawaan createTestDeps (test-only). */
export const TEST_SUPER_ADMIN_EMAIL = "root@example.test";

/**
 * Deps API untuk test: DB :memory: bermigrasi, ZOOMIN_TEST_AUTH=1, SUPER_ADMIN_EMAILS=root@example.test, Google dummy, roomService
 * ke LiveKit dev lokal (tidak dipanggil kecuali test integrasi). `env` menimpa default (mis. LIVEKIT_URL).
 */
export function createTestDeps(env: Env = {}): ApiDeps {
  const config = loadConfig({
    DB_PATH: ":memory:",
    HOST: "127.0.0.1",
    ZOOMIN_TEST_AUTH: "1",
    SUPER_ADMIN_EMAILS: TEST_SUPER_ADMIN_EMAIL,
    GOOGLE_CLIENT_ID: "test-client-id.apps.googleusercontent.com", // test-only: provider terpasang, Google tidak pernah dipanggil
    GOOGLE_CLIENT_SECRET: "test-client-secret", // test-only
    ...env,
  });
  const db = openDb(config.dbPath);
  const roomService = new RoomServiceClient(toHttpUrl(config.livekitUrl), config.livekitApiKey, config.livekitApiSecret);
  return { db, config, roomService, auth: createAuth({ db, config }) };
}

/**
 * Buat/ambil user lewat `auth.api.testLogin` (sesi Better Auth asli) lalu set peran global bila diminta.
 * `role: "super_admin"` ditulis langsung ke DB (sesi berikutnya menurunkannya lagi bila email tidak di SUPER_ADMIN_EMAILS).
 * Mengembalikan user terkini dan `cookie` siap pakai sebagai header `cookie`.
 */
export async function createTestUser(
  deps: ApiDeps,
  { email, name, role }: { email: string; name?: string; role?: GlobalRole },
): Promise<{ user: SessionUser; cookie: string }> {
  const testLogin = (deps.auth.api as unknown as { testLogin?: TestLogin }).testLogin;
  if (!testLogin) throw new Error("createTestUser: deps tanpa config.testAuth (pakai createTestDeps)");
  const { headers } = await testLogin({ body: { email, name }, returnHeaders: true });
  const cookie = headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  if (role) deps.db.query(`UPDATE "user" SET role = ? WHERE email = ?`).run(role, email.toLowerCase());
  const user = await getSessionUser(new Request("http://test/", { headers: { cookie } }), deps);
  if (!user) throw new Error(`createTestUser: sesi ${email} tidak terbaca`);
  return { user, cookie };
}
