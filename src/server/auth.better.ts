import type { Database } from "bun:sqlite";
import { betterAuth } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { admin } from "better-auth/plugins/admin";
import { defaultStatements } from "better-auth/plugins/admin/access";
import { createAccessControl } from "better-auth/plugins/access";
import type { GlobalRole } from "../shared/api.types";
import { CLIENT_IP_HEADER } from "./auth.ratelimit";
import type { Config } from "./config";
import { claimPendingInvitations } from "./room.invitations.claim";

/** Path dasar handler Better Auth (dipasang di api.ts). */
export const AUTH_BASE_PATH = "/api/auth";
/** Kode error domain email (A9); dipakai juga sebagai `?error=` redirect OAuth ke /login. */
export const EMAIL_DOMAIN_NOT_ALLOWED = "email_domain_not_allowed";
/** Kode error plugin admin Better Auth untuk user yang di-ban. */
export const BETTER_AUTH_BANNED_CODE = "BANNED_USER";

// Izin plugin admin per peran global. Endpoint HTTP /api/auth/admin/* diblok (api.ts); izin ini hanya berlaku untuk
// panggilan server `auth.api.*` dari route /api/admin & /api/dev yang menegakkan A5. Tanpa impersonate/set-password.
const ac = createAccessControl(defaultStatements);
const ADMIN_USER_ACTIONS = ["list", "get", "ban", "delete"] as const;
const SESSION_ACTIONS = ["list", "revoke", "delete"] as const;
const roles = {
  user: ac.newRole({ user: [], session: [] }),
  admin: ac.newRole({ user: [...ADMIN_USER_ACTIONS], session: [...SESSION_ACTIONS] }),
  super_admin: ac.newRole({ user: [...ADMIN_USER_ACTIONS, "set-role"], session: [...SESSION_ACTIONS] }),
} satisfies Record<GlobalRole, unknown>;

/** Kunci setting domain email di tabel app_settings (dibuat migrasi 0003, gelombang 2). */
export const ALLOWED_EMAIL_DOMAINS_KEY = "allowed_email_domains";

/**
 * Domain email yang boleh login (lowercase); [] = semua boleh (A9). Dibaca dari app_settings(key, value_json) setiap
 * login. Defensif: tabel belum ada (sebelum 0003) atau nilai rusak → [] (lebih baik login terbuka daripada semua
 * terkunci karena setting korup; super_admin bisa memperbaikinya dari /dev).
 */
export function getAllowedEmailDomains(db: Database): string[] {
  const hasTable = db.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'app_settings'").get();
  if (!hasTable) return [];
  const row = db.query<{ value_json: string }, [string]>("SELECT value_json FROM app_settings WHERE key = ?").get(ALLOWED_EMAIL_DOMAINS_KEY);
  if (!row) return [];
  let value: unknown;
  try {
    value = JSON.parse(row.value_json);
  } catch (cause) {
    console.warn("getAllowedEmailDomains: value_json bukan JSON valid, dianggap kosong", cause);
    return [];
  }
  return Array.isArray(value) ? value.filter((d): d is string => typeof d === "string").map((d) => d.trim().toLowerCase()).filter(Boolean) : [];
}

/** true bila domain email ada di daftar (atau daftar kosong). */
export function isEmailDomainAllowed(email: string, allowed: readonly string[]): boolean {
  if (allowed.length === 0) return true;
  return allowed.includes(email.slice(email.lastIndexOf("@") + 1).toLowerCase());
}

/**
 * Peran global setelah sinkron SUPER_ADMIN_EMAILS (A4): email di daftar → super_admin; super_admin yang tidak lagi
 * di daftar → user; selain itu peran tersimpan (null/asing → user).
 */
export function syncedRole(email: string, current: string | null | undefined, superAdminEmails: readonly string[]): GlobalRole {
  if (superAdminEmails.includes(email.toLowerCase())) return "super_admin";
  return current === "admin" ? "admin" : "user";
}

/** Tolak login bila domain tidak diizinkan. super_admin (env) dikecualikan agar tidak bisa mengunci diri sendiri. */
function assertEmailAllowed(db: Database, email: string, superAdminEmails: readonly string[]): void {
  if (superAdminEmails.includes(email.toLowerCase())) return;
  if (!isEmailDomainAllowed(email, getAllowedEmailDomains(db))) {
    throw new APIError("FORBIDDEN", { code: EMAIL_DOMAIN_NOT_ALLOWED, message: "Domain email ini tidak diizinkan untuk login." });
  }
}

/**
 * Endpoint server-only `auth.api.testLogin` (A12): buat/ambil user lalu sesi Better Auth asli + cookie. Tidak pernah
 * terdaftar di router HTTP (SERVER_ONLY); dipasang hanya bila config.testAuth. Hook database (domain, sinkron
 * super_admin, ban) tetap berlaku karena memakai internalAdapter.
 */
function testLoginPlugin() {
  return {
    id: "zoomin-test-login",
    endpoints: {
      testLogin: createAuthEndpoint.serverOnly({ method: "POST" }, async (ctx) => {
        const { email, name } = ctx.body as { email: string; name?: string };
        const adapter = ctx.context.internalAdapter;
        const existing = (await adapter.findUserByEmail(email))?.user;
        const user =
          existing ??
          (await adapter.createUser({ email, name: name ?? email.split("@")[0] ?? email, emailVerified: true }, { method: "zoomin-test-login" }));
        const session = await adapter.createSession(user.id, false);
        // Re-fetch: hook sesi bisa mengubah role (sinkron super_admin).
        const fresh = (await adapter.findUserById(user.id)) ?? user;
        await setSessionCookie(ctx, { session, user: fresh });
        return ctx.json({ userId: fresh.id });
      }),
    },
  } as const;
}

/** Dependency createAuth: DB yang sama dengan app (bun:sqlite) + config. */
export type AuthDeps = { db: Database; config: Config };

/**
 * Instance Better Auth: Google OAuth satu-satunya metode login, plugin admin (peran user|admin|super_admin, ban),
 * DB = bun:sqlite `Database` langsung (adapter Kysely built-in Better Auth mendeteksi bun:sqlite; skema dibuat
 * migrasi 0002_auth.sql, bukan CLI Better Auth). Sesi selalu dibaca dari DB (tanpa cookieCache) agar ban/ubah peran
 * langsung berlaku.
 */
export function createAuth({ db, config }: AuthDeps) {
  const isProd = config.nodeEnv === "production";
  const { superAdminEmails } = config;
  const google = config.googleClientId && config.googleClientSecret
    ? { google: { clientId: config.googleClientId, clientSecret: config.googleClientSecret, prompt: "select_account" as const } }
    : undefined;
  if (superAdminEmails.length === 0) console.warn("zoomin: SUPER_ADMIN_EMAILS kosong, tidak ada super_admin (halaman /dev tak bisa diakses)");

  return betterAuth({
    appName: "zoomin",
    database: db,
    secret: config.authSecret,
    baseURL: config.authUrl,
    basePath: AUTH_BASE_PATH,
    trustedOrigins: [new URL(config.publicAppUrl).origin],
    socialProviders: google,
    // Error OAuth (domain ditolak, ban, dsb.) → /login?error=<kode> di SPA, bukan halaman error bawaan Better Auth.
    onAPIError: { errorURL: `${config.publicAppUrl}/login` },
    rateLimit: { enabled: true, storage: "memory" },
    advanced: {
      useSecureCookies: isProd,
      // main.ts/api.ts mengisi header ini dari IP peer (atau X-Forwarded-For paling kanan bila TRUST_PROXY), jadi
      // rate limit Better Auth memakai sumber IP yang sama dengan limiter undangan dan tidak bisa dipalsukan klien.
      ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
    },
    telemetry: { enabled: false },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            assertEmailAllowed(db, user.email, superAdminEmails);
            return { data: { ...user, role: syncedRole(user.email, null, superAdminEmails) } };
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            const row = db
              .query<{ email: string; role: string | null }, [string]>(`SELECT email, role FROM "user" WHERE id = ?`)
              .get(session.userId);
            if (!row) return;
            assertEmailAllowed(db, row.email, superAdminEmails);
            const role = syncedRole(row.email, row.role, superAdminEmails);
            if (role !== row.role) db.query(`UPDATE "user" SET role = ? WHERE id = ?`).run(role, session.userId);
            claimPendingInvitations(db, session.userId, row.email);
          },
        },
      },
    },
    plugins: [
      admin({ ac, roles, defaultRole: "user", adminRoles: ["admin", "super_admin"] }),
      ...(config.testAuth ? [testLoginPlugin()] : []),
    ],
  });
}

/** Instance Better Auth yang disuntikkan lewat ApiDeps. */
export type Auth = ReturnType<typeof createAuth>;
