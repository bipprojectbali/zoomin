import { existsSync } from "node:fs";
import { RoomServiceClient } from "livekit-server-sdk";
import index from "../web/index.html";
import type { ApiDeps } from "./api.deps";
import { createApi } from "./api";
import { CLIENT_IP_HEADER } from "./auth.ratelimit";
import { loadConfig } from "./config";
import { openDb } from "./db";

/**
 * Satu Bun.serve untuk SPA + API.
 * Pola (docs bun.com/docs/bundler/fullstack): `routes` menerima HTML import (di-bundle Bun, plugin Tailwind dari
 * bunfig.toml `[serve.static]`) dan handler `(req) => Response`. Elysia dipasang sebagai handler `/api/*` lewat
 * `api.fetch`; route yang lebih spesifik menang atas wildcard `/*`, jadi `/*` → index untuk client-side routing.
 */
export function createServer(deps: ApiDeps, port: number) {
  const api = createApi(deps);
  return Bun.serve({
    port,
    hostname: deps.config.host,
    tls: loadTls(deps.config.tls),
    development: deps.config.nodeEnv !== "production",
    routes: {
      "/api/*": (req, server) => {
        // Selalu timpa: header internal ini sumber IP peer untuk rate limit (auth.ratelimit.ts), klien tak boleh mengisinya.
        req.headers.set(CLIENT_IP_HEADER, server.requestIP(req)?.address ?? "");
        return api.fetch(req);
      },
      "/*": index,
    },
  });
}

/** Config TLS → opsi `tls` Bun.serve (isi file, bukan path). Throw bila file tidak ada agar gagal saat start. */
function loadTls(tls: ApiDeps["config"]["tls"]) {
  if (!tls) return undefined;
  for (const [name, path] of [["TLS_CERT_PATH", tls.certPath], ["TLS_KEY_PATH", tls.keyPath]] as const) {
    if (!existsSync(path)) throw new Error(`createServer: ${name} tidak ditemukan (${path})`);
  }
  return { cert: Bun.file(tls.certPath), key: Bun.file(tls.keyPath) };
}

/** LiveKit Twirp memakai HTTP(S), sedangkan config menyimpan URL ws(s). */
export function toHttpUrl(livekitUrl: string): string {
  return livekitUrl.replace(/^ws(s?):\/\//, "http$1://");
}

type Stoppable = { stop(closeActiveConnections?: boolean): Promise<void> };
type Closable = { close(): void };
type SignalProcess = { once(signal: string, listener: () => void): unknown; exit(code?: number): never };

/** Hentikan server (tunggu request berjalan) lalu tutup DB agar WAL ter-checkpoint dengan bersih. */
export async function shutdown(server: Stoppable, db: Closable, signal: string): Promise<void> {
  await server.stop();
  db.close();
  console.info(`zoomin: ${signal} diterima, server berhenti dan DB ditutup`);
}

/** Pasang handler SIGTERM/SIGINT (systemd stop / Ctrl+C) → shutdown lalu exit. */
export function installShutdown(server: Stoppable, db: Closable, proc: SignalProcess = process): void {
  for (const signal of ["SIGTERM", "SIGINT"]) {
    proc.once(signal, () => {
      shutdown(server, db, signal).then(
        () => proc.exit(0),
        (cause) => {
          console.error(`zoomin: shutdown setelah ${signal} gagal`, cause);
          proc.exit(1);
        },
      );
    });
  }
}

if (import.meta.main) {
  const config = loadConfig();
  const db = openDb(config.dbPath);
  const roomService = new RoomServiceClient(toHttpUrl(config.livekitUrl), config.livekitApiKey, config.livekitApiSecret);
  const server = createServer({ db, config, roomService }, config.port);
  installShutdown(server, db);
  console.info(`zoomin: ${server.url} (LiveKit ${config.livekitUrl}, env ${config.nodeEnv})`);
}
