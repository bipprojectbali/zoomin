/** Label UI pemilih undangan (RND/plan/07-invite-picker.md). */
export const INVITE_PICKER_TEXT = {
  label: "Undang orang",
  placeholder: "Cari nama/email, atau tempel beberapa email",
  hint: "Email yang belum terdaftar tetap bisa diundang: aksesnya aktif setelah orang itu masuk dengan Google memakai email tersebut.",
  manual: (email: string) => `Undang ${email}`,
  searching: "Mencari…",
  invalid: "Email tidak valid",
  invalidCount: (n: number) => `${n} email tidak valid tidak akan dikirim.`,
  roleFor: (who: string) => `Peran ${who}`,
  remove: (who: string) => `Hapus ${who}`,
  submit: "Tambahkan",
  summary: (ok: number, failed: number) => (failed ? `${ok} ditambahkan, ${failed} gagal` : `${ok} ditambahkan`),
  failedItem: (email: string, reason: string) => `${email}: ${reason}`,
} as const;
