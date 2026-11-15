import { STAGE_REQUEST_TTL_MS, type StageRequest, type StageRequestStatus } from "../shared/api.types";

/** Field yang diisi pemanggil saat membuat request; id/status/waktu diisi store. */
export type NewStageRequest = Pick<StageRequest, "roomId" | "userId" | "userName" | "trackName" | "action">;

/**
 * Store request stage pending (S4): Map per room, satu pending per user per room. Request yang selesai
 * (approved/denied/canceled/expired) dihapus dari store dan diserahkan ke `onResolved` (notifikasi).
 * Kedaluwarsa dibersihkan lazy saat room itu diakses.
 * ponytail: in-memory per proses, hilang saat restart; cukup untuk permintaan berumur 60 s. Store bersama bila scale out.
 */
export function createStageRequestStore(opts: { onResolved: (r: StageRequest) => void; now?: () => number }) {
  const now = opts.now ?? Date.now;
  const rooms = new Map<string, Map<string, StageRequest>>();

  const resolve = (room: Map<string, StageRequest>, r: StageRequest, status: StageRequestStatus) => {
    room.delete(r.id);
    const done = { ...r, status };
    opts.onResolved(done);
    return done;
  };

  /** Room map setelah membuang yang kedaluwarsa. */
  const live = (roomId: string) => {
    const room = rooms.get(roomId) ?? new Map<string, StageRequest>();
    const t = now();
    for (const r of room.values()) if (r.expiresAt <= t) resolve(room, r, "expired");
    if (room.size === 0) rooms.delete(roomId);
    return room;
  };

  return {
    /** Buat request pending; pending lama user yang sama di room ini → canceled. */
    add(input: NewStageRequest): StageRequest {
      const room = live(input.roomId);
      for (const r of room.values()) if (r.userId === input.userId) resolve(room, r, "canceled");
      const createdAt = now();
      const req: StageRequest = { ...input, id: crypto.randomUUID(), status: "pending", createdAt, expiresAt: createdAt + STAGE_REQUEST_TTL_MS };
      room.set(req.id, req);
      rooms.set(input.roomId, room);
      return req;
    },
    /** Request pending di room, terlama dulu. */
    pending(roomId: string): StageRequest[] {
      return [...live(roomId).values()];
    },
    /** Pending request `id` di room (atau undefined). */
    get(roomId: string, id: string): StageRequest | undefined {
      return live(roomId).get(id);
    },
    /** Selesaikan pending request; undefined bila tidak ada/kedaluwarsa. */
    resolve(roomId: string, id: string, status: Exclude<StageRequestStatus, "pending">): StageRequest | undefined {
      const room = live(roomId);
      const r = room.get(id);
      if (!r) return undefined;
      const done = resolve(room, r, status);
      if (room.size === 0) rooms.delete(roomId);
      return done;
    },
    /** Batalkan semua pending di room (mode keluar dari `request`); tiap request → onResolved canceled. */
    cancelAll(roomId: string): void {
      const room = live(roomId);
      for (const r of room.values()) resolve(room, r, "canceled");
      rooms.delete(roomId);
    },
  };
}

export type StageRequestStore = ReturnType<typeof createStageRequestStore>;
