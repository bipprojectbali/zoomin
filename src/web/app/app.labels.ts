import type { GlobalRole } from "../../shared/api.types";

/** Label shell aplikasi (header, navigasi, user menu). */
export const APP_SHELL_TEXT = {
  home: "Beranda zoomin",
  nav: "Navigasi aplikasi",
  userMenu: "Menu akun",
  settings: "Profil & akun",
  signOut: "Keluar akun",
  signedOut: "Anda sudah keluar akun",
  signOutFailed: (msg: string) => `Gagal keluar akun. ${msg}`,
} as const;

/** Item navigasi utama; `min` = peran global minimal yang melihatnya. */
export const APP_NAV: readonly { to: string; label: string; min: GlobalRole }[] = [
  { to: "/app", label: "Room", min: "user" },
  { to: "/admin", label: "Admin", min: "admin" },
  { to: "/dev", label: "Developer", min: "super_admin" },
];

/** Inisial maksimal dua huruf dari nama (fallback avatar); nama kosong → "?". */
export function initials(name: string): string {
  const out = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return out || "?";
}
