import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { RoomServiceClient } from "livekit-server-sdk";
import type { CliOverrides } from "../cli/cli.args";
import { summarizeConfig } from "../cli/cli.check";
import type { CliServerHooks } from "../cli/cli.run";
import { createAuth } from "./auth.better";
import { listUsersForCli, setUserRoleByEmail, unbanUserByEmail } from "./auth.user.repository";
import { type Config, DEFAULT_DB_PATH, DEFAULT_PORT, loadConfig } from "./config";
import { connectDb, openDb, runMigrations } from "./db";
import { createServer, displayUrl, installShutdown, lanAddress, loadTls, toHttpUrl } from "./main";
import { startRoomEnforcer } from "./room.enforcer";

type Env = Record<string, string | undefined>;

/** Batas waktu `zoomin healthcheck`; HEALTHCHECK Docker punya timeout sendiri, ini mencegah hang tanpa batas. */
const HEALTHCHECK_TIMEOUT_MS = 3000;
const WILDCARD_LISTEN = new Set(["", "0.0.0.0", "::", "[::]"]);

const BINARY_HINT = "binary berjalan sebagai NODE_ENV=production; buat .env dengan `zoomin env > .env`, isi secret, lalu `zoomin check`";

/**
 * Env efektif untuk satu perintah CLI. Prioritas: flag CLI > env proses > `--env-file` (file hanya mengisi variabel
 * yang belum diset, sama seperti autoload .env Bun) > default config.
 * Binary (`standalone`) = mode produksi kecuali NODE_ENV diset eksplisit: binary dipakai untuk deploy, jadi secret wajib.
 */
export function resolveEnv(overrides: CliOverrides, env: Env = process.env, standalone = Bun.isStandaloneExecutable): Env {
  const resolved: Env = { ...env };
  if (overrides.envFile) {
    if (!existsSync(overrides.envFile)) throw new Error(`file env tidak ditemukan: ${overrides.envFile}`);
    for (const [key, value] of Object.entries(parseEnv(readFileSync(overrides.envFile, "utf8")))) resolved[key] ??= value;
  }
  if (standalone) resolved.NODE_ENV ??= "production";
  if (overrides.port !== undefined) resolved.PORT = String(overrides.port);
  if (overrides.host !== undefined) resolved.HOST = overrides.host;
  if (overrides.dbPath !== undefined) resolved.DB_PATH = overrides.dbPath;
  return resolved;
}

/** loadConfig + petunjuk perbaikan saat binary gagal karena secret produksi kosong. */
function configFrom(env: Env, standalone: boolean): Config {
  try {
    return loadConfig(env);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new Error(standalone ? `${message} (${BINARY_HINT})` : message, { cause });
  }
}

/** Implementasi CliServerHooks: start server, migrasi, dan validasi config. */
export function createServerHooks(env: Env = process.env, standalone = Bun.isStandaloneExecutable): CliServerHooks {
  return {
    serve(overrides) {
      const config = configFrom(resolveEnv(overrides, env, standalone), standalone);
      const db = openDb(config.dbPath);
      const roomService = new RoomServiceClient(toHttpUrl(config.livekitUrl), config.livekitApiKey, config.livekitApiSecret);
      const server = createServer({ db, config, roomService, auth: createAuth({ db, config }) }, config.port);
      // R6: tutup room LiveKit yang di DB nonaktif/kadaluarsa/terhapus; dihentikan sebelum server berhenti & DB ditutup.
      const stopEnforcer = startRoomEnforcer({ db, roomService });
      installShutdown({ stop: (closeActive) => (stopEnforcer(), server.stop(closeActive)) }, db);
      console.info(`zoomin: ${displayUrl(server.hostname ?? config.host, server.port ?? config.port, Boolean(config.tls))} (LiveKit ${config.livekitUrl}, env ${config.nodeEnv})`);
      const lan = config.host === "0.0.0.0" || config.host === "::" ? lanAddress() : undefined;
      if (lan) console.info(`zoomin: juga terjangkau di jaringan: ${displayUrl(lan, server.port ?? config.port, Boolean(config.tls))} (perangkat lain butuh HTTPS untuk kamera/layar)`);
      // Tidak pernah resolve: SIGTERM/SIGINT ditangani installShutdown (stop server, tutup DB, process.exit).
      return new Promise<void>(() => {});
    },

    async migrate(overrides) {
      // Migrasi hanya butuh path DB, jadi tidak memanggil loadConfig (secret produksi tidak wajib di sini).
      const dbPath = resolveEnv(overrides, env, standalone).DB_PATH?.trim() || DEFAULT_DB_PATH;
      const db = connectDb(dbPath);
      try {
        return { applied: runMigrations(db) };
      } finally {
        db.close();
      }
    },

    async user(overrides, action) {
      // Seperti migrate: hanya butuh DB (jalan darurat saat secret/Google belum benar). openDb menerapkan migrasi.
      const db = openDb(resolveEnv(overrides, env, standalone).DB_PATH?.trim() || DEFAULT_DB_PATH);
      try {
        if (action.action === "list") return listUsersForCli(db);
        if (action.action === "promote") return [setUserRoleByEmail(db, action.email, action.role)];
        return [unbanUserByEmail(db, action.email)];
      } finally {
        db.close();
      }
    },

    async healthcheck(overrides) {
      // Tanpa loadConfig: cukup port/host/TLS, jadi tetap jalan walau config lain bermasalah.
      const resolved = resolveEnv(overrides, env, standalone);
      const host = resolved.HOST?.trim() ?? "";
      const target = WILDCARD_LISTEN.has(host) ? "127.0.0.1" : host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
      const url = `${resolved.TLS_CERT_PATH?.trim() ? "https" : "http"}://${target}:${resolved.PORT?.trim() || DEFAULT_PORT}/api/health`;
      // Sertifikat lokal (mkcert/tailscale) tidak cocok dengan 127.0.0.1; ini hanya probe liveness proses sendiri.
      const res = await fetch(url, { signal: AbortSignal.timeout(HEALTHCHECK_TIMEOUT_MS), tls: { rejectUnauthorized: false } }).catch((cause) => {
        throw new Error(`${url} tidak terjangkau: ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
      });
      if (!res.ok) throw new Error(`${url} status ${res.status}`);
      return url;
    },

    async check(overrides) {
      try {
        const config = configFrom(resolveEnv(overrides, env, standalone), standalone);
        loadTls(config.tls);
        return { ok: true, summary: summarizeConfig(config) };
      } catch (cause) {
        return { ok: false, errors: [cause instanceof Error ? cause.message : String(cause)] };
      }
    },
  };
}
