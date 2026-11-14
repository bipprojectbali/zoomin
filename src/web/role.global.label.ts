import type { GlobalRole } from "../shared/api.types";

/** Label UI peran global akun (badge user menu, profil, admin). */
export const GLOBAL_ROLE_LABEL: Record<GlobalRole, string> = {
  user: "User",
  admin: "Admin",
  super_admin: "Super admin",
};

/** Kelas warna badge per peran global (dipakai bersama `<Badge variant="outline">`). */
export const GLOBAL_ROLE_BADGE_CLASS: Record<GlobalRole, string> = {
  user: "border-border text-muted-foreground",
  admin: "border-brand/40 bg-brand/10 text-brand",
  super_admin: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
};

/** Urutan hak peran global: makin besar makin tinggi. */
export const GLOBAL_ROLE_RANK: Record<GlobalRole, number> = { user: 0, admin: 1, super_admin: 2 };

/** true bila `user` punya peran global minimal `min`. */
export function hasRole(user: { role: GlobalRole } | null, min: GlobalRole): boolean {
  return user !== null && GLOBAL_ROLE_RANK[user.role] >= GLOBAL_ROLE_RANK[min];
}
