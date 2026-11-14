/**
 * Layout room: SQLite = sumber kebenaran (CAS pada layout_version), room metadata LiveKit = siaran ke klien.
 * Alur lihat RND/plan/01-arsitektur.md §Layout (admin).
 */
import type { Database } from "bun:sqlite";
import { type RoomServiceClient, ServerError } from "livekit-server-sdk";
import type { LayoutResponse } from "../shared/api.types";
import { type LayoutState, parseLayout, serializeLayout } from "../shared/layout.model";

const HTTP_NOT_FOUND = 404;

/** Dependency service layout; roomService cukup dua method agar mudah di-fake di test. */
export type LayoutDeps = {
  db: Database;
  roomService: Pick<RoomServiceClient, "createRoom" | "updateRoomMetadata">;
};

/** Input tulis layout; `by` = user id penulis (bukan nama, hindari PII di metadata/log). */
export type PutLayoutInput = { roomId: string; baseVersion: number; layout: LayoutState; by: string };

/** baseVersion usang: tulis lain sudah lebih dulu masuk. */
export class LayoutConflictError extends Error {
  constructor(readonly currentVersion: number) {
    super(`layout conflict: versi sekarang ${currentVersion}`);
    this.name = "LayoutConflictError";
  }
}

/** Room tidak ada di SQLite. */
export class RoomNotFoundError extends Error {
  constructor(readonly roomId: string) {
    super(`room ${roomId} tidak ditemukan`);
    this.name = "RoomNotFoundError";
  }
}

type LayoutRow = { layout_json: string | null; layout_version: number };

function readRow(db: Database, roomId: string): LayoutRow {
  const row = db
    .query<LayoutRow, [string]>("SELECT layout_json, layout_version FROM rooms WHERE id = ?")
    .get(roomId);
  if (!row) throw new RoomNotFoundError(roomId);
  return row;
}

/** Layout terakhir dari SQLite; layout null = belum pernah diset. */
export function getLayout(db: Database, roomId: string): LayoutResponse {
  const row = readRow(db, roomId);
  try {
    return { version: row.layout_version, layout: row.layout_json === null ? null : parseLayout(row.layout_json) };
  } catch (cause) {
    throw new Error(`getLayout: layout_json room=${roomId} v=${row.layout_version} rusak`, { cause });
  }
}

/** Room LiveKit belum dibuat (belum ada yang join) — dikenali dari status 404 Twirp. */
const isLiveKitRoomMissing = (e: unknown) => e instanceof ServerError && e.status === HTTP_NOT_FOUND;

/**
 * Compare-and-set layout di SQLite lalu siarkan ke room metadata.
 * Melempar LayoutConflictError bila baseVersion usang, RoomNotFoundError bila room tidak ada.
 */
export async function putLayout(deps: LayoutDeps, input: PutLayoutInput): Promise<{ version: number }> {
  const { roomId, baseVersion, by } = input;
  const version = baseVersion + 1;
  const state: LayoutState = { ...input.layout, version, updatedBy: by, updatedAt: Date.now() };
  const json = serializeLayout(state);
  const changed = deps.db
    .query("UPDATE rooms SET layout_json = ?, layout_version = layout_version + 1 WHERE id = ? AND layout_version = ?")
    .run(json, roomId, baseVersion).changes;
  if (changed === 0) throw new LayoutConflictError(readRow(deps.db, roomId).layout_version);

  try {
    await deps.roomService.updateRoomMetadata(roomId, json);
  } catch (e) {
    // Room LiveKit baru ada setelah ada yang join; SQLite tetap sumber kebenaran dan syncRoomLayout
    // menulis ulang metadata saat token pertama diterbitkan, jadi tulis ini tidak boleh gagal.
    if (!isLiveKitRoomMissing(e)) {
      throw new Error(`putLayout: publish metadata room=${roomId} v=${version} gagal`, { cause: e });
    }
    console.warn(`[layout] room=${roomId} v=${version} belum ada di LiveKit; metadata diterapkan saat join`);
  }
  return { version };
}

/** Pastikan room LiveKit ada dengan metadata = layout terkini di SQLite (dipanggil sebelum terbit token). */
export async function syncRoomLayout(deps: LayoutDeps, roomId: string): Promise<void> {
  const row = readRow(deps.db, roomId);
  const metadata = row.layout_json ?? undefined;
  try {
    // createRoom idempotent: room yang sudah ada dikembalikan apa adanya, metadata TIDAK ditimpa
    // (diverifikasi ke LiveKit dev 2026-11), jadi perlu updateRoomMetadata bila berbeda.
    const room = await deps.roomService.createRoom({ name: roomId, metadata });
    if (metadata !== undefined && room.metadata !== metadata) {
      await deps.roomService.updateRoomMetadata(roomId, metadata);
    }
  } catch (cause) {
    throw new Error(`syncRoomLayout: room=${roomId} v=${row.layout_version} gagal`, { cause });
  }
}
