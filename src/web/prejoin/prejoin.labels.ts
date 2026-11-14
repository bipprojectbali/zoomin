import { ROLE_LABEL } from "@/role.label";
import type { RoomRole } from "../../shared/api.types";

/** Semua label UI pre-join & undangan (terpusat). */
export const PREJOIN_TEXT = {
  ready: "Siap bergabung?",
  join: "Gabung sekarang",
  joining: "Menghubungkan…",
  name: "Nama tampilan",
  namePlaceholder: "Nama Anda",
  viewerInfo: "Anda masuk sebagai penonton. Kamera dan mikrofon tidak digunakan.",
  cameraOffPreview: "Kamera mati",
  cameraLoading: "Menyalakan kamera…",
  camera: "Kamera",
  mic: "Mikrofon",
  speaker: "Speaker",
  defaultDevice: "Default sistem",
  micLevel: "Level mikrofon",
  toggles: "Kontrol kamera dan mikrofon",
  turnOn: { camera: "Nyalakan kamera", mic: "Nyalakan mikrofon" },
  turnOff: { camera: "Matikan kamera", mic: "Matikan mikrofon" },
  unavailable: { camera: "Kamera tidak dapat digunakan, klik untuk mematikan", mic: "Mikrofon tidak dapat digunakan, klik untuk mematikan" },
  noDeviceHint: "Anda tetap bisa bergabung tanpa kamera atau mikrofon.",
  permissionHint: "Setelah izin diberikan, muat ulang halaman ini.",
  reload: "Muat ulang",
  back: "Ke lobby",
} as const;

export type MediaKind = "camera" | "mic";

/** Subtitle peran: "Anda akan masuk sebagai Peserta". */
export const roleSubtitle = (role: RoomRole) => `Anda akan masuk sebagai ${ROLE_LABEL[role]}`;

/** Visual tombol toggle bulat: on = netral, off = merah, blocked = merah + badge peringatan. */
export type ToggleTone = "on" | "off" | "blocked";

/** Pemetaan state toggle → aria-pressed, label aksi, dan tone. */
export function toggleState(kind: MediaKind, enabled: boolean, failed: boolean) {
  const tone: ToggleTone = enabled ? (failed ? "blocked" : "on") : "off";
  const label = tone === "blocked" ? PREJOIN_TEXT.unavailable[kind] : enabled ? PREJOIN_TEXT.turnOff[kind] : PREJOIN_TEXT.turnOn[kind];
  return { pressed: enabled && !failed, tone, label };
}

/** State tombol gabung: nonaktif saat proses atau nama wajib masih kosong. */
export function joinButtonState(busy: boolean, askName: boolean, name: string) {
  return {
    disabled: busy || (askName && !name.trim()),
    label: busy ? PREJOIN_TEXT.joining : PREJOIN_TEXT.join,
  };
}

/** Subtitle halaman undangan; bersesi → sebut identitas yang dipakai (UX-08). */
export function inviteSubtitle(p: { effectiveRole: RoomRole; currentUser: { name: string } | null }) {
  return p.currentUser
    ? `Anda akan masuk sebagai ${p.currentUser.name} (${ROLE_LABEL[p.effectiveRole]})`
    : roleSubtitle(p.effectiveRole);
}

/** Catatan bila peran undangan lebih rendah dari peran yang sudah dimiliki; null bila sama. */
export function roleKeptNote(p: { role: RoomRole; effectiveRole: RoomRole }) {
  return p.role === p.effectiveRole
    ? null
    : `Undangan ini untuk ${ROLE_LABEL[p.role]}, tetapi peran Anda di room ini tetap ${ROLE_LABEL[p.effectiveRole]} (peran tidak diturunkan).`;
}
