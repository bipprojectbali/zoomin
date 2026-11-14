import type { SystemHealth } from "../shared/api.types";
import { APP_VERSION } from "../cli/cli.run";
import type { ApiDeps } from "./api.deps";

/** Batas waktu cek LiveKit agar /api/dev/health tetap cepat walau LiveKit mati/hang. */
export const LIVEKIT_HEALTH_TIMEOUT_MS = 3000;
const ERROR_TEXT_MAX = 200;
const IN_MEMORY_DB = ":memory:";

type LivekitProbe = { health: SystemHealth["livekit"]; activeRooms: number };

/** Cek LiveKit via listRooms (timeout); tidak pernah throw — kegagalan jadi `ok: false` + teks error pendek. */
async function probeLivekit(deps: Pick<ApiDeps, "config" | "roomService">, timeoutMs: number): Promise<LivekitProbe> {
  const url = deps.config.livekitUrl;
  const started = performance.now();
  let timer: Timer | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`timeout ${timeoutMs}ms`)), timeoutMs);
    });
    const rooms = await Promise.race([deps.roomService.listRooms(), timeout]);
    return { health: { url, ok: true, latencyMs: Math.round(performance.now() - started), error: null }, activeRooms: rooms.length };
  } catch (cause) {
    // Pesan error SDK/fetch hanya memuat URL/status (tanpa API key/secret); dipotong agar ringkas.
    const error = (cause instanceof Error ? cause.message : String(cause)).slice(0, ERROR_TEXT_MAX);
    return { health: { url, ok: false, latencyMs: null, error }, activeRooms: 0 };
  } finally {
    clearTimeout(timer);
  }
}

const countRows = (deps: Pick<ApiDeps, "db">, table: string): number =>
  deps.db.query<{ n: number }, []>(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n ?? 0;

/** Ringkasan kesehatan sistem untuk panel /dev (tanpa secret; email super admin hanya jumlah). */
export async function getSystemHealth(
  deps: Pick<ApiDeps, "db" | "config" | "roomService">,
  timeoutMs = LIVEKIT_HEALTH_TIMEOUT_MS,
): Promise<SystemHealth> {
  const { health, activeRooms } = await probeLivekit(deps, timeoutMs);
  const { dbPath } = deps.config;
  return {
    version: APP_VERSION,
    bun: Bun.version,
    uptimeSec: Math.round(process.uptime()),
    nodeEnv: deps.config.nodeEnv,
    livekit: health,
    db: {
      users: countRows(deps, `"user"`),
      rooms: countRows(deps, "rooms"),
      activeRooms,
      sizeBytes: dbPath === IN_MEMORY_DB ? null : Bun.file(dbPath).size,
    },
    superAdminEmailsConfigured: deps.config.superAdminEmails.length,
  };
}
