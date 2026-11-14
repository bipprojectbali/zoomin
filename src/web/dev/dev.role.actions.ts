import type { AdminUser } from "../../shared/api.types";

/** Aksi peran yang tersedia untuk satu baris di tab Admin & peran. */
export type RoleAction = "promote" | "demote" | "locked" | "self";

/**
 * Aksi peran untuk `target` dilihat oleh `selfId` (A4/A5): super_admin selalu terkunci (dari env), diri sendiri tidak
 * bisa diubah, admin → turunkan, user → angkat.
 */
export function roleActionFor(target: Pick<AdminUser, "id" | "role">, selfId: string): RoleAction {
  if (target.role === "super_admin") return "locked";
  if (target.id === selfId) return "self";
  return target.role === "admin" ? "demote" : "promote";
}
