/** Label UI stage (terpusat agar mudah diganti/i18n). */
import type { LayoutTemplate } from "../../shared/layout.model";

export const STAGE_LABELS = {
  templates: { "side-by-side": "Berdampingan", grid: "Grid", focus: "Fokus" } satisfies Record<LayoutTemplate, string>,
  toolbar: "Template layout",
  camera: "kamera",
  screen: (n: number) => `layar ${n}`,
  inactive: "tidak aktif",
  focus: "Fokuskan",
  moveLeft: "Geser ke kiri",
  moveRight: "Geser ke kanan",
  addToLayout: "Tambahkan ke layout",
  others: "Lainnya",
  empty: "Belum ada video",
  autoLayout: "Layout otomatis (admin belum mengatur)",
  editFailed: "Gagal mengubah layout",
  layoutInvalid: "Layout dari server tidak valid, diabaikan",
  layoutLoadFailed: "Gagal memuat layout",
  layoutSaveFailed: "Gagal menyimpan layout",
  layoutConflict: "Layout diubah admin lain, dimuat ulang",
} as const;
