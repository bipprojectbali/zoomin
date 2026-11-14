import type { RoomStatus, RoomVisibility } from "../../shared/api.types";

/** Label UI pengaturan room, badge kartu room, dan opsi buat room (RND/plan/06 §UI). */
export const ROOM_SETTINGS_TEXT = {
  title: "Pengaturan room",
  description: (title: string) => `Kelola room "${title}".`,
  tabGeneral: "Umum",
  tabMembers: "Anggota",
  tabStatus: "Status",
  tabDanger: "Zona bahaya",
  // Umum
  roomTitle: "Judul room",
  visibility: "Tipe room",
  save: "Simpan",
  saving: "Menyimpan…",
  saved: "Pengaturan disimpan",
  privateConfirmTitle: "Jadikan room private?",
  privateConfirmBody: "Link undangan yang sudah dibagikan tidak berlaku lagi. Hanya anggota dan orang yang Anda undang lewat email yang bisa masuk.",
  privateConfirmSubmit: "Jadikan private",
  cancel: "Batal",
  // Anggota
  memberEmail: "Email",
  memberEmailPlaceholder: "nama@kantor.com",
  memberRole: "Peran",
  memberAdd: "Tambah",
  memberAdded: (email: string) => `${email} ditambahkan`,
  memberAddHint: "Belum punya akun? Undangan menunggu sampai orang itu masuk dengan email tersebut.",
  memberRoleFor: (who: string) => `Peran ${who}`,
  memberRemove: (who: string) => `Keluarkan ${who}`,
  memberRemoved: (who: string) => `${who} dikeluarkan`,
  inviteCancel: (email: string) => `Batalkan undangan ${email}`,
  inviteCanceled: (email: string) => `Undangan ${email} dibatalkan`,
  roleUpdated: "Peran diperbarui",
  pending: "Menunggu",
  membersEmpty: "Belum ada anggota.",
  membersLoading: "Memuat anggota…",
  loadMore: "Muat lagi",
  // Status
  active: "Room aktif",
  activeHint: "Nonaktifkan untuk menutup room sementara. Semua peserta langsung terputus.",
  activated: "Room diaktifkan",
  deactivated: "Room dinonaktifkan",
  expiry: "Kadaluarsa",
  expiryNone: "Tanpa batas",
  expiryAt: (when: string) => `Berakhir ${when}`,
  expiredAt: (when: string) => `Berakhir sejak ${when}`,
  extend: (days: number) => `+${days} hari`,
  extendLabel: (days: number) => `Perpanjang ${days} hari`,
  expiryDate: "Pilih tanggal",
  expirySet: "Atur",
  expiryUpdated: "Kadaluarsa diperbarui",
  expiryInvalid: "Pilih waktu setelah sekarang, maksimal 365 hari ke depan.",
  // Zona bahaya
  deleteHeading: "Hapus room",
  deleteBody: "Room, anggota, layout, dan undangannya dihapus permanen. Peserta yang sedang di dalam akan terputus.",
  deleteOpen: "Hapus room…",
  deleteTitle: (title: string) => `Hapus room "${title}"?`,
  deleted: (title: string) => `Room "${title}" dihapus`,
  // Kartu room
  menu: (title: string) => `Aksi room ${title}`,
  menuSettings: "Pengaturan",
  menuInvite: "Undang",
  menuDelete: "Hapus",
  // Buat room
  expiryPreset: { none: "Tanpa batas", "1": "1 hari", "7": "7 hari", "30": "30 hari", custom: "Pilih tanggal" },
  // Admin
  colType: "Tipe",
  colLive: "Live",
  notLive: "Tidak berlangsung",
} as const;

/** Label + deskripsi singkat tiap tipe room. */
export const VISIBILITY_TEXT: Record<RoomVisibility, { label: string; hint: string }> = {
  public: { label: "Public", hint: "Siapa pun yang punya link undangan bisa masuk" },
  private: { label: "Private", hint: "Hanya orang yang Anda undang lewat email" },
};

/** Label badge status + alasan Masuk di-disable. */
export const STATUS_TEXT: Record<RoomStatus, { label: string; reason: string }> = {
  active: { label: "Aktif", reason: "" },
  inactive: { label: "Nonaktif", reason: "Room dinonaktifkan host. Minta host mengaktifkannya kembali." },
  expired: { label: "Kadaluarsa", reason: "Masa berlaku room sudah habis. Minta host memperpanjangnya." },
};
