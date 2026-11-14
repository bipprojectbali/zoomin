import type { GlobalRole } from "../../shared/api.types";

/** Peran target yang boleh dikelola (ban/unban/hapus/cabut sesi) per peran aktor; cermin aturan server (A5). */
const MANAGEABLE: Record<GlobalRole, readonly GlobalRole[]> = {
  user: [],
  admin: ["user"],
  super_admin: ["user", "admin"],
};

/** true bila aktor boleh mengelola target menurut peran; super_admin tidak pernah bisa dikelola. */
export function canManage(actorRole: GlobalRole, targetRole: GlobalRole): boolean {
  return MANAGEABLE[actorRole].includes(targetRole);
}

/** canManage + larangan mengelola diri sendiri. */
export function canManageUser(actor: { id: string; role: GlobalRole }, target: { id: string; role: GlobalRole }): boolean {
  return actor.id !== target.id && canManage(actor.role, target.role);
}
