import type { AdminRoomSummary, AdminUser, AuditAction, GlobalRole, Page, SessionUser } from "../shared/api.types";
import { countMembers, getAdminUser } from "./admin.repository";
import type { ApiDeps } from "./api.deps";
import { recordAudit } from "./audit.repository";
import { deleteRoom } from "./room.service";
import { listRoomsForUser } from "./rooms.repository";

const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const MS_PER_HOUR = 3_600_000;

/** Kode error aksi admin yang dipetakan route ke apiError. */
export type AdminErrorCode = "cannot_modify_self" | "insufficient_role" | "user_not_found" | "room_not_found";

/** Aksi admin ditolak (A5) atau target tidak ada; `status` = HTTP untuk route. */
export class AdminActionError extends Error {
  readonly status: number;
  constructor(readonly code: AdminErrorCode, message: string) {
    super(message);
    this.status = code === "user_not_found" || code === "room_not_found" ? HTTP_NOT_FOUND : HTTP_FORBIDDEN;
  }
}

/** A5: admin hanya mengelola `user`; super_admin mengelola `user` & `admin`; super_admin tidak pernah jadi target. */
export function canManage(actor: GlobalRole, target: GlobalRole): boolean {
  if (target === "super_admin") return false;
  if (actor === "super_admin") return true;
  return actor === "admin" && target === "user";
}

/** Target yang boleh dikelola aktor, atau throw AdminActionError (404 → diri sendiri → peran). */
export function assertManageable(deps: Pick<ApiDeps, "db">, actor: SessionUser, targetId: string): AdminUser {
  const target = getAdminUser(deps.db, targetId);
  if (!target) throw new AdminActionError("user_not_found", `user ${targetId} tidak ditemukan`);
  if (target.id === actor.id) throw new AdminActionError("cannot_modify_self", "tidak bisa mengelola akun sendiri");
  if (!canManage(actor.role, target.role)) throw new AdminActionError("insufficient_role", `${actor.role} tidak boleh mengelola ${target.role}`);
  return target;
}

const audit = (deps: Pick<ApiDeps, "db">, actor: SessionUser, action: AuditAction, targetId: string, detail: Record<string, unknown> = {}) =>
  recordAudit(deps.db, { actorId: actor.id, actorEmail: actor.email, action, targetType: action.startsWith("room.") ? "room" : "user", targetId, detail });

/**
 * Keluarkan identity `userId` dari semua room LiveKit aktif (A6). Error LiveKit (listRooms atau per room) hanya di-log
 * warn tanpa PII (id saja) dan tidak menggagalkan aksi pemanggil. Mengembalikan jumlah room tempat ia dikeluarkan.
 */
export async function kickFromLiveKit(deps: Pick<ApiDeps, "roomService">, userId: string): Promise<number> {
  let rooms;
  try {
    rooms = await deps.roomService.listRooms();
  } catch (cause) {
    console.warn(`kickFromLiveKit: listRooms gagal (user ${userId})`, cause);
    return 0;
  }
  const kicked = await Promise.all(
    rooms.map(async ({ name }) => {
      try {
        const participants = await deps.roomService.listParticipants(name);
        if (!participants.some((p) => p.identity === userId)) return 0;
        await deps.roomService.removeParticipant(name, userId);
        return 1;
      } catch (cause) {
        console.warn(`kickFromLiveKit: gagal mengeluarkan user ${userId} dari room ${name}`, cause);
        return 0;
      }
    }),
  );
  return kicked.reduce<number>((a, b) => a + b, 0);
}

const ctx = (deps: Pick<ApiDeps, "auth">) => deps.auth.$context;
const fresh = (deps: Pick<ApiDeps, "db">, id: string): AdminUser => {
  const u = getAdminUser(deps.db, id);
  if (!u) throw new Error(`admin.service: user ${id} hilang setelah diubah`);
  return u;
};

/** Ban (A6): simpan alasan/masa berlaku, cabut semua sesi, keluarkan dari LiveKit, audit. */
export async function banUser(deps: ApiDeps, actor: SessionUser, targetId: string, body: { reason: string; expiresInHours?: number }): Promise<AdminUser> {
  assertManageable(deps, actor, targetId);
  const c = await ctx(deps);
  const banExpires = body.expiresInHours ? new Date(Date.now() + body.expiresInHours * MS_PER_HOUR) : null;
  await c.internalAdapter.updateUser(targetId, { banned: true, banReason: body.reason, banExpires, updatedAt: new Date() });
  await c.internalAdapter.deleteUserSessions(targetId);
  const kickedRooms = await kickFromLiveKit(deps, targetId);
  audit(deps, actor, "user.ban", targetId, { reason: body.reason, expiresInHours: body.expiresInHours ?? null, kickedRooms });
  return fresh(deps, targetId);
}

/** Cabut ban + audit. */
export async function unbanUser(deps: ApiDeps, actor: SessionUser, targetId: string): Promise<AdminUser> {
  assertManageable(deps, actor, targetId);
  await (await ctx(deps)).internalAdapter.updateUser(targetId, { banned: false, banReason: null, banExpires: null, updatedAt: new Date() });
  audit(deps, actor, "user.unban", targetId);
  return fresh(deps, targetId);
}

/** Hard delete (A6). Audit dicatat lebih dulu (menyimpan email) karena baris user hilang setelahnya. */
export async function deleteUser(deps: ApiDeps, actor: SessionUser, targetId: string): Promise<void> {
  const target = assertManageable(deps, actor, targetId);
  audit(deps, actor, "user.delete", targetId, { email: target.email, name: target.name, role: target.role });
  await kickFromLiveKit(deps, targetId);
  // FK: sesi/akun/membership ikut terhapus (CASCADE), rooms.created_by → NULL.
  await (await ctx(deps)).internalAdapter.deleteUser(targetId);
}

/** Cabut semua sesi target + audit. */
export async function revokeUserSessions(deps: ApiDeps, actor: SessionUser, targetId: string): Promise<void> {
  assertManageable(deps, actor, targetId);
  await (await ctx(deps)).internalAdapter.deleteUserSessions(targetId);
  audit(deps, actor, "user.sessions.revoke", targetId);
}

/** Ubah peran global (A5, dipakai /api/dev): hanya super_admin; target bukan diri sendiri / super_admin. */
export async function setGlobalRole(deps: ApiDeps, actor: SessionUser, targetId: string, role: "user" | "admin"): Promise<AdminUser> {
  if (actor.role !== "super_admin") throw new AdminActionError("insufficient_role", "hanya super_admin yang boleh mengubah peran");
  const target = assertManageable(deps, actor, targetId);
  await (await ctx(deps)).internalAdapter.updateUser(targetId, { role, updatedAt: new Date() });
  audit(deps, actor, "user.role", targetId, { from: target.role, to: role });
  return fresh(deps, targetId);
}

/**
 * Daftar room admin: halaman DB (semua room) + jumlah member (1 query) + status LiveKit dari SATU listRooms per request.
 * LiveKit down → semua live=false, participants=0, warn.
 */
export async function listAdminRooms(deps: ApiDeps, actor: SessionUser, opts: { limit?: number; cursor?: string }): Promise<Page<AdminRoomSummary>> {
  const page = listRoomsForUser(deps.db, actor, opts);
  const members = countMembers(deps.db, page.items.map((r) => r.id));
  let live = new Map<string, number>();
  try {
    live = new Map((await deps.roomService.listRooms(page.items.map((r) => r.id))).map((r) => [r.name, r.numParticipants]));
  } catch (cause) {
    console.warn("listAdminRooms: listRooms LiveKit gagal, status live dianggap false", cause);
  }
  return {
    nextCursor: page.nextCursor,
    items: page.items.map((r) => ({ ...r, members: members.get(r.id) ?? 0, live: live.has(r.id), participants: live.get(r.id) ?? 0 })),
  };
}

/** Hapus room (logika di room.service.ts#deleteRoom: DB + audit + LiveKit); 404 bila tidak ada. */
export async function deleteAdminRoom(deps: ApiDeps, actor: SessionUser, roomId: string): Promise<void> {
  if (!(await deleteRoom(deps, actor, roomId))) throw new AdminActionError("room_not_found", `room ${roomId} tidak ditemukan`);
}
