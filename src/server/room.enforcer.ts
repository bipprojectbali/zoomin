import type { ApiDeps } from "./api.deps";
import { roomStatus } from "./room.access";
import { closeLiveRoom } from "./room.service";

/** Interval enforcer status room (R6). */
export const ROOM_ENFORCER_INTERVAL_MS = 60_000;

type EnforcerDeps = Pick<ApiDeps, "db" | "roomService">;

/**
 * Satu putaran enforcer (R6): untuk tiap room yang sedang live di LiveKit, ADA di DB, dan tidak `active` (nonaktif
 * atau kadaluarsa) → deleteRoom (semua peserta terputus). Room yang tidak dikenal DB dibiarkan: LiveKit bisa dipakai
 * bersama instance/app lain (E2E-04), dan room yang dihapus sudah ditutup saat dihapus. Mengembalikan nama room yang ditutup.
 * ponytail: token yang sudah terbit (TTL 2 jam) bisa bergabung ulang ≤60 s sebelum ditendang lagi; cek join-time
 * di LiveKit (webhook/room metadata) bila celah itu penting.
 */
export async function runEnforcerOnce(deps: EnforcerDeps, now = Date.now()): Promise<string[]> {
  const live = await deps.roomService.listRooms();
  const lookup = deps.db.query<{ disabled_at: number | null; expires_at: number | null }, [string]>(
    "SELECT disabled_at, expires_at FROM rooms WHERE id = ?",
  );
  const stale = live.map((r) => r.name).filter((name) => {
    const row = lookup.get(name);
    return row != null && roomStatus(row, now) !== "active";
  });
  await Promise.all(stale.map((name) => closeLiveRoom(deps, name, "roomEnforcer")));
  return stale;
}

/** Jalankan enforcer tiap `intervalMs`; mengembalikan fungsi stop. Gagal satu putaran = warn, putaran berikutnya tetap jalan. */
export function startRoomEnforcer(deps: EnforcerDeps, intervalMs = ROOM_ENFORCER_INTERVAL_MS): () => void {
  const timer = setInterval(() => {
    runEnforcerOnce(deps).catch((cause) => console.warn("roomEnforcer: putaran gagal (listRooms LiveKit?)", cause));
  }, intervalMs);
  return () => clearInterval(timer);
}
