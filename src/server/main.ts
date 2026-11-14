import { RoomServiceClient } from "livekit-server-sdk";
import index from "../web/index.html";
import type { ApiDeps } from "./api.deps";
import { createApi } from "./api";
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
    development: deps.config.nodeEnv !== "production",
    routes: {
      "/api/*": (req) => api.fetch(req),
      "/*": index,
    },
  });
}

/** LiveKit Twirp memakai HTTP(S), sedangkan config menyimpan URL ws(s). */
export function toHttpUrl(livekitUrl: string): string {
  return livekitUrl.replace(/^ws(s?):\/\//, "http$1://");
}

if (import.meta.main) {
  const config = loadConfig();
  const db = openDb(config.dbPath);
  const roomService = new RoomServiceClient(toHttpUrl(config.livekitUrl), config.livekitApiKey, config.livekitApiSecret);
  const server = createServer({ db, config, roomService }, config.port);
  console.info(`zoomin: ${server.url} (LiveKit ${config.livekitUrl}, env ${config.nodeEnv})`);
}
