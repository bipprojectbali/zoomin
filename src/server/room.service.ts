import { ROOM_EXPIRY_MAX_DAYS, type AuditAction, type SessionUser, type UpdateRoomBody } from "../shared/api.types";
import type { ApiDeps } from "./api.deps";
import { recordAudit } from "./audit.repository";
import { type DbVisibility, dbVisibility, roomVisibility } from "./room.access";

const MS_PER_DAY = 86_400_000;

/** true bila `expiresAt` boleh dipakai (R7): null (tanpa batas) atau di (now, now + ROOM_EXPIRY_MAX_DAYS]. */
export function isValidExpiry(expiresAt: number | null, now = Date.now()): boolean {
  return expiresAt === null || (expiresAt > now && expiresAt <= now + ROOM_EXPIRY_MAX_DAYS * MS_PER_DAY);
}

/**
 * Putuskan semua peserta room di LiveKit (deleteRoom). Room yang belum pernah/tidak sedang live → not found di
 * LiveKit; gagal apa pun hanya warn (id saja, tanpa PII) dan tidak menggagalkan aksi pemanggil.
 */
export async function closeLiveRoom(deps: Pick<ApiDeps, "roomService">, roomId: string, op: string): Promise<void> {
  try {
    await deps.roomService.deleteRoom(roomId);
  } catch (cause) {
    console.warn(`${op}: deleteRoom LiveKit ${roomId} gagal`, cause);
  }
}

type RoomState = { title: string; visibility: DbVisibility; has_password: number; disabled_at: number | null; expires_at: number | null };

/** Hasil updateRoom; `password_missing` = tipe jadi "password" tanpa password baru maupun lama (W7). */
export type UpdateRoomResult = "ok" | "not_found" | "password_missing";

/**
 * Terapkan UpdateRoomBody (sudah divalidasi & diotorisasi route). Tiap field yang benar-benar berubah = satu UPDATE +
 * satu entri audit (R10) dalam satu transaksi. Menonaktifkan room → putuskan peserta LiveKit (R6).
 * `passwordHash` (Bun.password, dihitung route) = set/ganti password; pindah ke public/private menghapus hash (W7).
 * Audit `room.password` hanya membawa `{ action }`, tidak pernah password/hash.
 */
export async function updateRoom(
  deps: Pick<ApiDeps, "db" | "roomService">,
  actor: SessionUser,
  roomId: string,
  body: Omit<UpdateRoomBody, "password">,
  passwordHash?: string,
): Promise<UpdateRoomResult> {
  const { db } = deps;
  const now = Date.now();
  const deactivated = db.transaction((): boolean | UpdateRoomResult => {
    const cur = db
      .query<RoomState, [string]>(
        "SELECT title, visibility, (password_hash IS NOT NULL) AS has_password, disabled_at, expires_at FROM rooms WHERE id = ?",
      )
      .get(roomId);
    if (!cur) return "not_found";
    const curVis = roomVisibility(cur);
    const nextVis = body.visibility ?? curVis;
    if (nextVis === "password" && !passwordHash && !cur.has_password) return "password_missing";
    const audit = (action: AuditAction, detail: Record<string, unknown>) =>
      recordAudit(db, { actorId: actor.id, actorEmail: actor.email, action, targetType: "room", targetId: roomId, detail });
    const set = (column: string, value: string | number | null) => db.query(`UPDATE rooms SET ${column} = ? WHERE id = ?`).run(value, roomId);

    if (body.title !== undefined && body.title !== cur.title) {
      set("title", body.title);
      audit("room.update", { from: cur.title, to: body.title });
    }
    if (nextVis !== curVis) {
      set("visibility", dbVisibility(nextVis));
      audit("room.visibility", { from: curVis, to: nextVis });
    }
    if (nextVis === "password" && passwordHash) {
      set("password_hash", passwordHash);
      audit("room.password", { action: cur.has_password ? "change" : "set" });
    } else if (nextVis !== "password" && cur.has_password) {
      set("password_hash", null);
      audit("room.password", { action: "clear" });
    }
    let off = false;
    if (body.enabled === true && cur.disabled_at !== null) {
      set("disabled_at", null);
      audit("room.activate", {});
    } else if (body.enabled === false && cur.disabled_at === null) {
      set("disabled_at", now);
      audit("room.deactivate", {});
      off = true;
    }
    if (body.expiresAt !== undefined && body.expiresAt !== cur.expires_at) {
      set("expires_at", body.expiresAt);
      audit("room.expiry", { from: cur.expires_at, to: body.expiresAt });
    }
    return off;
  })();
  if (typeof deactivated === "string") return deactivated;
  if (deactivated) await closeLiveRoom(deps, roomId, "updateRoom");
  return "ok";
}

/**
 * Hapus room (R8): baris rooms (member, undangan pending, layout ikut terhapus via CASCADE) + audit `room.delete`
 * dalam satu transaksi, lalu putuskan room LiveKit. Dipakai DELETE /api/rooms/:roomId dan /api/admin/rooms/:id.
 * Mengembalikan false bila room tidak ada.
 */
export async function deleteRoom(deps: Pick<ApiDeps, "db" | "roomService">, actor: SessionUser, roomId: string): Promise<boolean> {
  const { db } = deps;
  const deleted = db.transaction(() => {
    const room = db.query<{ title: string }, [string]>("SELECT title FROM rooms WHERE id = ?").get(roomId);
    if (!room) return false;
    db.query("DELETE FROM rooms WHERE id = ?").run(roomId);
    recordAudit(db, { actorId: actor.id, actorEmail: actor.email, action: "room.delete", targetType: "room", targetId: roomId, detail: { title: room.title } });
    return true;
  })();
  if (deleted) await closeLiveRoom(deps, roomId, "deleteRoom");
  return deleted;
}

/**
 * Keluarkan `userId` dari room LiveKit `roomId` bila sedang terhubung (R9, dipakai saat anggota dikeluarkan).
 * Tidak sedang di room / LiveKit gagal → warn (id saja), tidak menggagalkan aksi pemanggil. true bila dikeluarkan.
 */
export async function kickFromRoom(deps: Pick<ApiDeps, "roomService">, roomId: string, userId: string): Promise<boolean> {
  try {
    const participants = await deps.roomService.listParticipants(roomId);
    if (!participants.some((p) => p.identity === userId)) return false;
    await deps.roomService.removeParticipant(roomId, userId);
    return true;
  } catch (cause) {
    console.warn(`kickFromRoom: gagal mengeluarkan user ${userId} dari room ${roomId}`, cause);
    return false;
  }
}
