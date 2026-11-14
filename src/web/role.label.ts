import type { Role } from "../shared/api.types";

/** Label UI per role (dipakai lobby & room). */
export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  participant: "Peserta",
  viewer: "Penonton",
};

/** Urutan tampil role (tombol undangan). */
export const ROLES: readonly Role[] = ["participant", "viewer", "admin"];
