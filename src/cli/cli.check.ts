import type { Config } from "../server/config";

const secretState = (value: string): string => (value ? "diset" : "kosong");

/** Ringkasan config untuk `zoomin check`: nilai non-rahasia apa adanya, secret hanya "diset"/"kosong". */
export function summarizeConfig(config: Config): Record<string, string> {
  return {
    NODE_ENV: config.nodeEnv,
    PORT: String(config.port),
    HOST: config.host,
    DB_PATH: config.dbPath,
    LIVEKIT_URL: config.livekitUrl,
    PUBLIC_LIVEKIT_URL: config.publicLivekitUrl,
    PUBLIC_APP_URL: config.publicAppUrl,
    BETTER_AUTH_URL: config.authUrl,
    TLS: config.tls ? "on" : "off",
    TRUST_PROXY: String(config.trustProxy),
    LIVEKIT_API_KEY: secretState(config.livekitApiKey),
    LIVEKIT_API_SECRET: secretState(config.livekitApiSecret),
    BETTER_AUTH_SECRET: secretState(config.authSecret),
    GOOGLE_CLIENT_ID: secretState(config.googleClientId),
    GOOGLE_CLIENT_SECRET: secretState(config.googleClientSecret),
    // Jumlah saja: daftar email = data pribadi, tidak dicetak.
    SUPER_ADMIN_EMAILS: `${config.superAdminEmails.length} email`,
    ZOOMIN_TEST_AUTH: config.testAuth ? "aktif (jalur login test)" : "nonaktif",
  };
}
