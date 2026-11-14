/** Konfigurasi app hasil baca env. Di production, secret wajib diset (server gagal start bila tidak). */
export type Config = {
  nodeEnv: string;
  port: number;
  dbPath: string;
  /** URL LiveKit untuk panggilan server-ke-server (Twirp). */
  livekitUrl: string;
  /** URL LiveKit yang dikirim ke browser (biasanya wss://lk.<domain>). */
  publicLivekitUrl: string;
  livekitApiKey: string;
  livekitApiSecret: string;
  /** Kunci HMAC cookie sesi, minimal SESSION_SECRET_MIN_LENGTH karakter. */
  sessionSecret: string;
  adminPassword: string;
  /** Base URL app untuk link undangan. */
  publicAppUrl: string;
  /** Path sertifikat + kunci TLS (PEM). Diset → server HTTPS; kosong → HTTP. */
  tls?: { certPath: string; keyPath: string };
};

export const SESSION_SECRET_MIN_LENGTH = 32;
const DEFAULT_PORT = 3000;
const DEFAULT_DB_PATH = "./data/zoomin.sqlite";
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
  const sessionSecret = pick("SESSION_SECRET", "dev-session-secret-0123456789abcdef"); // test-only dev default
  const adminPassword = pick("ADMIN_PASSWORD", "admin"); // test-only dev default
  if (sessionSecret.length < SESSION_SECRET_MIN_LENGTH) {
    throw new Error(`loadConfig: SESSION_SECRET minimal ${SESSION_SECRET_MIN_LENGTH} karakter (sekarang ${sessionSecret.length})`);
  }

  const certPath = env.TLS_CERT_PATH?.trim();
  const keyPath = env.TLS_KEY_PATH?.trim();
  if (Boolean(certPath) !== Boolean(keyPath)) {
    throw new Error("loadConfig: TLS_CERT_PATH dan TLS_KEY_PATH harus diset bersamaan (sekarang hanya salah satu)");
  }

  const livekitUrl = env.LIVEKIT_URL?.trim() || DEFAULT_LIVEKIT_URL;
  return {
    nodeEnv,
    port,
    dbPath: env.DB_PATH?.trim() || DEFAULT_DB_PATH,
    livekitUrl,
    publicLivekitUrl: env.PUBLIC_LIVEKIT_URL?.trim() || livekitUrl,
    livekitApiKey,
    livekitApiSecret,
    sessionSecret,
    adminPassword,
    publicAppUrl: env.PUBLIC_APP_URL?.trim() || DEFAULT_PUBLIC_APP_URL,
    tls: certPath && keyPath ? { certPath, keyPath } : undefined,
  };
}
