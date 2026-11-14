/** Label halaman /settings (Profil & akun). */
export const SETTINGS_TEXT = {
  title: "Profil & akun",
  profile: {
    title: "Profil",
    description: "Nama dan foto ini terlihat oleh peserta lain di room.",
    name: "Nama tampilan",
    nameHint: (n: number, max: number) => `${n}/${max} karakter`,
    nameInvalid: (max: number) => `Nama wajib diisi, maksimal ${max} karakter.`,
    email: "Email",
    emailHint: "Email mengikuti akun Google dan tidak bisa diubah di sini.",
    role: "Peran",
    save: "Simpan",
    saving: "Menyimpan…",
    saved: "Profil disimpan",
    useGooglePhoto: "Pakai foto Google",
    photoReset: "Foto dikembalikan ke foto Google",
    failed: (msg: string) => `Gagal menyimpan profil. ${msg}`,
  },
  sessions: {
    title: "Sesi aktif",
    description: "Perangkat yang sedang masuk ke akun Anda. Cabut sesi yang tidak Anda kenali.",
    loading: "Memuat sesi…",
    loadFailed: "Gagal memuat sesi.",
    retry: "Coba lagi",
    thisDevice: "Perangkat ini",
    unknownIp: "IP tidak diketahui",
    since: (when: string) => `Masuk ${when}`,
    revoke: "Cabut",
    revoked: "Sesi dicabut",
    revokeOthers: "Keluar dari semua perangkat lain",
    revokedOthers: "Semua perangkat lain sudah dikeluarkan",
    noOthers: "Tidak ada perangkat lain yang masuk.",
    failed: (msg: string) => `Gagal mencabut sesi. ${msg}`,
  },
  danger: {
    title: "Zona bahaya",
    description: "Menghapus akun akan mengeluarkan Anda dari semua room dan tidak bisa dibatalkan.",
    delete: "Hapus akun",
    superAdminReason: "Akun super admin diatur lewat SUPER_ADMIN_EMAILS di server dan tidak bisa dihapus dari sini.",
    confirmTitle: "Hapus akun secara permanen?",
    confirmBody: (email: string) => `Ketik ${email} untuk mengonfirmasi. Semua keanggotaan room Anda akan hilang.`,
    confirmLabel: "Email konfirmasi",
    cancel: "Batal",
    confirm: "Hapus akun saya",
    deleting: "Menghapus…",
    deleted: "Akun Anda sudah dihapus",
    failed: (msg: string) => `Gagal menghapus akun. ${msg}`,
  },
} as const;

/** Batas nama tampilan (sama dengan validasi server PATCH /api/me). */
export const NAME_MAX = 60;

/** Nama valid: 1–60 karakter setelah trim. */
export function isValidName(name: string): boolean {
  const n = name.trim().length;
  return n >= 1 && n <= NAME_MAX;
}
