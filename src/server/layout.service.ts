/**
 * Layout room: SQLite = sumber kebenaran (CAS pada layout_version), room metadata LiveKit = siaran ke klien.
 * Alur lihat RND/plan/01-arsitektur.md §Layout (admin).
 */
import type { Database } from "bun:sqlite";
import { type RoomServiceClient, ServerError } from "livekit-server-sdk";
import type { LayoutResponse, SessionUser, StageMode } from "../shared/api.types";
import { type LayoutState, parseLayout, serializeLayout } from "../shared/layout.model";
import { serializeRoomStage } from "../shared/stage.model";
import { recordAudit } from "./audit.repository";

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
    super(`layout conflict: current version ${currentVersion}`);
    this.name = "LayoutConflictError";
  }
}

/** Room tidak ada di SQLite. */
export class RoomNotFoundError extends Error {
  constructor(readonly roomId: string) {
    super(`room ${roomId} not found`);
    this.name = "RoomNotFoundError";
  }
}

type LayoutRow = { layout_json: string | null; layout_version: number; stage_mode: StageMode };

function readRow(db: Database, roomId: string): LayoutRow {
  const row = db
    .query<LayoutRow, [string]>("SELECT layout_json, layout_version, stage_mode FROM rooms WHERE id = ?")
    .get(roomId);
  if (!row) throw new RoomNotFoundError(roomId);
  return row;
}

function toResponse(row: LayoutRow, roomId: string): LayoutResponse {
  try {
    const layout = row.layout_json === null ? null : parseLayout(row.layout_json);
    return { version: row.layout_version, layout, stageMode: row.stage_mode };
  } catch (cause) {
    throw new Error(`getLayout: layout_json room=${roomId} v=${row.layout_version} is corrupt`, { cause });
  }
}

/** Layout terakhir + mode stage dari SQLite; layout null = belum pernah diset. */
export function getLayout(db: Database, roomId: string): LayoutResponse {
  return toResponse(readRow(db, roomId), roomId);
}

/** Envelope room metadata (S2) dari state SQLite terkini. */
function readEnvelope(db: Database, roomId: string): string {
  const { stageMode, layout } = getLayout(db, roomId);
  return serializeRoomStage({ stageMode, layout });
}

/** Room LiveKit belum dibuat (belum ada yang join) — dikenali dari status 404 Twirp. */
const isLiveKitRoomMissing = (e: unknown) => e instanceof ServerError && e.status === HTTP_NOT_FOUND;

/**
 * Siarkan envelope terkini dari SQLite ke room metadata. Room LiveKit belum ada → warn saja: SQLite tetap sumber
 * kebenaran dan syncRoomLayout menulis ulang metadata saat token pertama diterbitkan.
 * ponytail: dua tulis bersamaan bisa tiba di LiveKit tidak berurutan (siaran basi sesaat); klien GET saat join/konflik.
 */
async function publishEnvelope(deps: LayoutDeps, roomId: string, op: string): Promise<void> {
  try {
    await deps.roomService.updateRoomMetadata(roomId, readEnvelope(deps.db, roomId));
  } catch (e) {
    if (!isLiveKitRoomMissing(e)) throw new Error(`${op}: publish metadata room=${roomId} failed`, { cause: e });
    console.warn(`[layout] ${op} room=${roomId} belum ada di LiveKit; metadata diterapkan saat join`);
  }
}

/**
 * Compare-and-set layout di SQLite lalu siarkan envelope ke room metadata.
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
  await publishEnvelope(deps, roomId, "putLayout");
  return { version };
}

/**
 * Tulis mode stage (S1) + audit `room.stage_mode` {from,to} bila berubah; sinkron agar bisa ikut transaksi pemanggil
 * (PATCH rooms). Tidak menyiarkan: pemanggil memanggil publishRoomStage setelah commit. true bila berubah.
 * Melempar RoomNotFoundError bila room tidak ada.
 */
export function writeStageMode(db: Database, actor: Pick<SessionUser, "id" | "email">, roomId: string, mode: StageMode): boolean {
  const from = readRow(db, roomId).stage_mode;
  if (from === mode) return false;
  db.query("UPDATE rooms SET stage_mode = ? WHERE id = ?").run(mode, roomId);
  recordAudit(db, { actorId: actor.id, actorEmail: actor.email, action: "room.stage_mode", targetType: "room", targetId: roomId, detail: { from, to: mode } });
  return true;
}

/** Siarkan envelope terkini (mode + layout) dari SQLite; room LiveKit belum ada → warn. */
export const publishRoomStage = (deps: LayoutDeps, roomId: string) => publishEnvelope(deps, roomId, "publishRoomStage");

/** writeStageMode dalam transaksi sendiri lalu siarkan bila berubah. Layout tidak diubah. Otorisasi di route. */
export async function setStageMode(
  deps: LayoutDeps,
  actor: Pick<SessionUser, "id" | "email">,
  roomId: string,
  mode: StageMode,
): Promise<void> {
  const changed = deps.db.transaction(() => writeStageMode(deps.db, actor, roomId, mode))();
  if (changed) await publishRoomStage(deps, roomId);
}

/** Pastikan room LiveKit ada dengan metadata = envelope terkini di SQLite (dipanggil sebelum terbit token). */
export async function syncRoomLayout(deps: LayoutDeps, roomId: string): Promise<void> {
  const metadata = readEnvelope(deps.db, roomId);
  try {
    // createRoom idempotent: room yang sudah ada dikembalikan apa adanya, metadata TIDAK ditimpa
    // (diverifikasi ke LiveKit dev 2026-11), jadi perlu updateRoomMetadata bila berbeda.
    const room = await deps.roomService.createRoom({ name: roomId, metadata });
    if (room.metadata !== metadata) await deps.roomService.updateRoomMetadata(roomId, metadata);
  } catch (cause) {
    throw new Error(`syncRoomLayout: room=${roomId} failed`, { cause });
  }
}
