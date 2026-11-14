/** Konfigurasi app hasil baca env. Di production, secret wajib diset (server gagal start bila tidak). */
export type Config = {
  nodeEnv: string;
  port: number;
  /** Interface listen Bun.serve (HOST). Produksi di belakang reverse proxy: 127.0.0.1. */
  host: string;
  dbPath: string;
  /** URL LiveKit untuk panggilan server-ke-server (Twirp). */
  livekitUrl: string;
  /** URL LiveKit yang dikirim ke browser (biasanya wss://lk.<domain>). */
  publicLivekitUrl: string;
  livekitApiKey: string;
  livekitApiSecret: string;
  /** BETTER_AUTH_SECRET: kunci Better Auth (cookie sesi, state OAuth) + tanda tangan undangan; minimal AUTH_SECRET_MIN_LENGTH. */
  authSecret: string;
  /** Base URL Better Auth (BETTER_AUTH_URL); default = publicAppUrl (A14). Redirect Google: <authUrl>/api/auth/callback/google. */
  authUrl: string;
  /** Kredensial OAuth Google (GOOGLE_CLIENT_ID/SECRET); kosong di dev = provider Google tidak dipasang. */
  googleClientId: string;
  googleClientSecret: string;
  /** SUPER_ADMIN_EMAILS: email (lowercase, trim) yang selalu disinkronkan jadi super_admin (A4). */
  superAdminEmails: string[];
  /** Jalur login test-only POST /api/test/login (A12): ZOOMIN_TEST_AUTH=1 dan BUKAN production. */
  testAuth: boolean;
  /** Base URL app untuk link undangan. */
  publicAppUrl: string;
  /** Path sertifikat + kunci TLS (PEM). Diset → server HTTPS; kosong → HTTP. */
  tls?: { certPath: string; keyPath: string };
  /** TRUST_PROXY=true → IP klien dari X-Forwarded-For (hanya bila app hanya bisa dicapai lewat reverse proxy). */
  trustProxy: boolean;
};

export const AUTH_SECRET_MIN_LENGTH = 32;
/** Env yang wajib diset di production (loadConfig throw bila kosong). Sumber tunggal untuk docs/CLI. */
export const REQUIRED_IN_PRODUCTION = ["LIVEKIT_API_KEY", "LIVEKIT_API_SECRET", "BETTER_AUTH_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"] as const;
const DEFAULT_PORT = 3000;
const DEFAULT_HOST = "0.0.0.0";
export const DEFAULT_DB_PATH = "./data/zoomin.sqlite";
const DEFAULT_LIVEKIT_URL = "ws://127.0.0.1:7880";
const DEFAULT_PUBLIC_APP_URL = "http://localhost:3000";

type Env = Record<string, string | undefined>;

/** Membaca dan memvalidasi konfigurasi dari env. Throw bila production tanpa secret. */
export function loadConfig(env: Env = process.env): Config {
  const nodeEnv = env.NODE_ENV ?? "development";
  const isProd = nodeEnv === "production";
  const pick = (name: string, devDefault: string): string => {
    const value = env[name]?.trim();
    if (value) return value;
    if (isProd) throw new Error(`loadConfig: ${name} wajib diset di production`);
    return devDefault;
  };

  const port = Number(env.PORT ?? DEFAULT_PORT);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`loadConfig: PORT tidak valid (${JSON.stringify(env.PORT)})`);
  }

  const livekitApiKey = pick("LIVEKIT_API_KEY", "devkey"); // test-only dev default
  const livekitApiSecret = pick("LIVEKIT_API_SECRET", "secret"); // test-only dev default
  const authSecret = pick("BETTER_AUTH_SECRET", "dev-better-auth-secret-0123456789abcdef"); // test-only dev default
  if (authSecret.length < AUTH_SECRET_MIN_LENGTH) {
    throw new Error(`loadConfig: BETTER_AUTH_SECRET minimal ${AUTH_SECRET_MIN_LENGTH} karakter (sekarang ${authSecret.length})`);
  }
  const googleClientId = pick("GOOGLE_CLIENT_ID", "");
  const googleClientSecret = pick("GOOGLE_CLIENT_SECRET", "");
  // A14: satu URL cukup; yang kosong mengikuti yang lain agar redirect OAuth & link undangan tidak drift.
  const appUrl = env.PUBLIC_APP_URL?.trim();
  const authUrl = env.BETTER_AUTH_URL?.trim();

  const certPath = env.TLS_CERT_PATH?.trim();
  const keyPath = env.TLS_KEY_PATH?.trim();
  if (Boolean(certPath) !== Boolean(keyPath)) {
    throw new Error("loadConfig: TLS_CERT_PATH dan TLS_KEY_PATH harus diset bersamaan (sekarang hanya salah satu)");
  }

  const livekitUrl = env.LIVEKIT_URL?.trim() || DEFAULT_LIVEKIT_URL;
  return {
    nodeEnv,
    port,
    host: env.HOST?.trim() || DEFAULT_HOST,
    dbPath: env.DB_PATH?.trim() || DEFAULT_DB_PATH,
    livekitUrl,
    publicLivekitUrl: env.PUBLIC_LIVEKIT_URL?.trim() || livekitUrl,
    livekitApiKey,
    livekitApiSecret,
    authSecret,
    authUrl: authUrl || appUrl || DEFAULT_PUBLIC_APP_URL,
    googleClientId,
    googleClientSecret,
    superAdminEmails: (env.SUPER_ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean),
    // Production selalu mematikan jalur test walau flag diset (A12).
    testAuth: !isProd && env.ZOOMIN_TEST_AUTH?.trim() === "1",
    publicAppUrl: appUrl || authUrl || DEFAULT_PUBLIC_APP_URL,
    tls: certPath && keyPath ? { certPath, keyPath } : undefined,
    trustProxy: env.TRUST_PROXY?.trim() === "true",
  };
}
