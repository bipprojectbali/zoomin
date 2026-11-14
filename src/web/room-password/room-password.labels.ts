import { ROOM_PASSWORD_MAX, ROOM_PASSWORD_MIN } from "../../shared/api.types";

/** Label UI room ber-password (RND/plan/08 W8). */
export const ROOM_PASSWORD_TEXT = {
  label: "Password room",
  hint: `${ROOM_PASSWORD_MIN}–${ROOM_PASSWORD_MAX} karakter. Simpan baik-baik: password tidak bisa dilihat lagi setelah disimpan.`,
  show: "Tampilkan password",
  hide: "Sembunyikan password",
  generate: "Buat acak",
  copy: "Salin password",
  copied: "Password disalin",
  copyFailed: "Gagal menyalin. Salin manual dari kolom.",
  change: "Ganti password",
  cancelChange: "Batal ganti password",
  onceTitle: "Simpan password room",
  onceBody: "Bagikan password ini bersama link atau ID room. Password tidak bisa dilihat lagi setelah dialog ini ditutup.",
  onceClose: "Sudah disimpan",
  clearConfirmTitle: "Hapus password room?",
  clearConfirmPublic: "Password dihapus. Siapa pun yang punya link undangan bisa masuk tanpa password.",
  clearConfirmPrivateExtra: "Password juga dihapus.",
  clearConfirmSubmit: "Hapus password",
  gateTitle: "Room ini dilindungi password",
  gateBody: "Masukkan password dari host room untuk bergabung. Setelah berhasil, Anda menjadi anggota room ini.",
  gateSubmit: "Masuk",
  gateSubmitting: "Memeriksa…",
  gateBack: "Ke lobby",
} as const;
