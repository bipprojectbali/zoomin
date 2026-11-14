import type { RoomRole } from "../shared/api.types";

/** Label UI per peran room (dipakai lobby & room). */
export const ROLE_LABEL: Record<RoomRole, string> = {
  host: "Host",
  participant: "Peserta",
  viewer: "Penonton",
};

/** Urutan tampil peran room (tombol undangan). */
export const ROLES: readonly RoomRole[] = ["participant", "viewer", "host"];
