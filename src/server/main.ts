import { existsSync } from "node:fs";
import { networkInterfaces } from "node:os";
import type { ApiDeps } from "./api.deps";
import { createApi } from "./api";
import { CLIENT_IP_HEADER } from "./auth.ratelimit";
import { LIVEKIT_PROXY_PREFIX, livekitProxy, livekitWebSocket } from "./livekit.proxy";
import { DEFAULT_WEB_DIR, staticRoutes } from "./static.serve";

/**
 * HTML import untuk dev (bundle on-demand + HMR). scripts/build.binary.ts men-define `process.env.ZOOMIN_BINARY`
 * = "1", sehingga cabang ini dibuang saat compile: binary tidak ikut mem-bundle SPA kedua kali (dan tidak butuh
 * plugin Tailwind); binary menyajikan dist/web yang ditanam (static.serve.ts).
 */
const devIndex: Bun.HTMLBundle | undefined =
  process.env.ZOOMIN_BINARY === "1" ? undefined : (await import("../web/index.html")).default;

/**
 * Satu Bun.serve untuk SPA + API.
 * Dev: `routes` menerima HTML import (di-bundle Bun saat diminta + HMR, plugin Tailwind dari bunfig.toml
 * `[serve.static]`, docs bun.com/docs/bundler/fullstack). Produksi: prebuild statis dari `bun run build`
 * (code splitting + hash, static.serve.ts); HTML import hanya manifest lazy, jadi tidak di-bundle saat runtime.
 * Elysia dipasang sebagai handler `/api/*` lewat `api.fetch`; route yang lebih spesifik menang atas wildcard `/*`.
 * `/livekit` + `/livekit/*` = proxy signaling LiveKit same-origin (livekit.proxy.ts), aktif di semua mode.
 */
export function createServer(deps: ApiDeps, port: number, webDir: string = DEFAULT_WEB_DIR) {
  const api = createApi(deps);
  const isProd = deps.config.nodeEnv === "production";
  // Binary dengan NODE_ENV=development eksplisit tidak punya devIndex → tetap sajikan SPA tertanam.
  const web: Record<string, Bun.HTMLBundle | ((req: Request) => Response)> = isProd || !devIndex ? staticRoutes(webDir) : { "/*": devIndex };
  const lkProxy = livekitProxy(deps.config.livekitUrl);
  return Bun.serve({
    port,
    hostname: deps.config.host,
    tls: loadTls(deps.config.tls),
    development: !isProd,
    websocket: livekitWebSocket,
    routes: {
      [LIVEKIT_PROXY_PREFIX]: lkProxy,
      [`${LIVEKIT_PROXY_PREFIX}/*`]: lkProxy,
      "/api/*": (req, server) => {
        // Selalu timpa: header internal ini sumber IP peer untuk rate limit (auth.ratelimit.ts), klien tak boleh mengisinya.
        req.headers.set(CLIENT_IP_HEADER, server.requestIP(req)?.address ?? "");
        return api.fetch(req);
      },
      ...web,
    },
  });
}

/** Config TLS → opsi `tls` Bun.serve (isi file, bukan path). Throw bila file tidak ada agar gagal saat start. */
export function loadTls(tls: ApiDeps["config"]["tls"]) {
  if (!tls) return undefined;
  for (const [name, path] of [["TLS_CERT_PATH", tls.certPath], ["TLS_KEY_PATH", tls.keyPath]] as const) {
    if (!existsSync(path)) throw new Error(`createServer: ${name} tidak ditemukan (${path})`);
  }
  return { cert: Bun.file(tls.certPath), key: Bun.file(tls.keyPath) };
}

const WILDCARD_HOSTS = new Set(["0.0.0.0", "::", "[::]", ""]);

/**
 * URL yang dicetak saat start. Bind ke semua interface (0.0.0.0/::) → tampilkan localhost: origin 0.0.0.0 bukan
 * secure context, jadi clipboard/kamera/share layar gagal bila user mengklik URL itu.
 */
export function displayUrl(hostname: string, port: number, tls: boolean): string {
  const host = WILDCARD_HOSTS.has(hostname) ? "localhost" : hostname.includes(":") && !hostname.startsWith("[") ? `[${hostname}]` : hostname;
  return `${tls ? "https" : "http"}://${host}:${port}/`;
}

/** IPv4 LAN pertama (non-loopback), untuk info akses dari perangkat lain; undefined bila tidak ada. */
export function lanAddress(): string | undefined {
  return Object.values(networkInterfaces()).flat().find((i) => i?.family === "IPv4" && !i.internal)?.address;
}

export { toHttpUrl } from "./livekit.proxy";

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

// Entry dev/start/binary: CLI (src/cli) memilih perintah; default `serve`. Import dinamis menghindari siklus
// main ↔ server.hooks (hooks memakai createServer dari file ini).
if (import.meta.main) {
  const [{ runCli }, { userArgs }, { createServerHooks }] = await Promise.all([
    import("../cli/cli.run"),
    import("../cli/cli.args"),
    import("./server.hooks"),
  ]);
  const io = {
    out: (s: string) => void process.stdout.write(s),
    err: (s: string) => void process.stderr.write(s),
    isTTY: Boolean(process.stdout.isTTY),
    env: process.env,
  };
  process.exit(await runCli(userArgs(process.argv), io, createServerHooks()));
}
