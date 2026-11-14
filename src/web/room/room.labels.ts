/** Label UI shell room (header, control bar, dialog) terpusat + pemetaan state tombol. */
import { parseTrackName } from "../../shared/track.naming";
import type { ConnectionStatus } from "./room.connection";

export const ROOM_LABELS = {
  mic: "Mikrofon",
  camera: "Kamera",
  micOn: "Matikan mikrofon",
  micOff: "Nyalakan mikrofon",
  cameraOn: "Matikan kamera",
  cameraOff: "Nyalakan kamera",
  chooseMic: "Pilih mikrofon & speaker",
  chooseCamera: "Pilih kamera",
  micDevices: "Mikrofon",
  speakerDevices: "Speaker",
  cameraDevices: "Kamera",
  noDevices: "Tidak ada perangkat",
  device: (n: number) => `Perangkat ${n}`,
  deviceFailed: "Gagal mengganti perangkat",
  share: "Bagikan layar",
  shareCount: (n: number) => `Bagikan layar (${n} aktif)`,
  addScreen: "Tambah layar",
  picking: "Memilih layar…",
  stop: "Hentikan",
  stopScreen: (label: string) => `Hentikan ${label}`,
  activeScreens: "Layar aktif",
  shareFailed: "Gagal berbagi layar",
  noScreenAudio: "Audio layar tidak ikut terbagi. Audio hanya tersedia di Chrome/Edge saat berbagi tab.",
  participants: (n: number) => `Peserta (${n})`,
  invite: "Undang",
  inviteTitle: "Undang ke room",
  inviteDescription: "Buat link undangan sesuai peran lalu salin dan kirim.",
  more: "Lainnya",
  leave: "Keluar",
  leaveTitle: "Keluar dari room?",
  leaveDescription: "Kamera, mikrofon, dan layar yang Anda bagikan akan berhenti.",
  leaveConfirm: "Keluar",
  cancel: "Batal",
  controls: "Kontrol room",
  audioBlocked: "Suara diblokir browser",
  audioStart: "Klik untuk mengaktifkan suara",
  loading: "Memuat room…",
  joinAs: (role: string) => `Anda akan masuk sebagai ${role}`,
  status: {
    idle: "Belum bergabung",
    connecting: "Menghubungkan…",
    connected: "Terhubung",
    reconnecting: "Menyambung ulang…",
    disconnected: "Terputus",
    left: "Sudah keluar",
    error: "Gagal bergabung",
  } satisfies Record<ConnectionStatus, string>,
} as const;

/** Label layar konsisten dengan tile stage: `screen-2` → "Layar 2"; nama di luar konvensi apa adanya. */
export function screenLabel(trackName: string): string {
  const parsed = parseTrackName(trackName);
  return parsed?.kind === "screen" ? `Layar ${parsed.index}` : trackName;
}

export type ToggleState = {
  pressed: boolean;
  variant: "secondary" | "destructive";
  label: string;
  disabled: boolean;
};

/** State tombol mic/kamera: nyala = netral, mati = merah (pola Meet/Zoom); label = aksi berikutnya. */
export function toggleState(device: "mic" | "camera", enabled: boolean, busy: boolean): ToggleState {
  const L = ROOM_LABELS;
  const label = device === "mic" ? (enabled ? L.micOn : L.micOff) : enabled ? L.cameraOn : L.cameraOff;
  return { pressed: enabled, variant: enabled ? "secondary" : "destructive", label, disabled: busy };
}

/** Label perangkat; sebelum izin media browser memberi label kosong → "Perangkat N". */
export function deviceLabel(device: Pick<MediaDeviceInfo, "label">, index: number): string {
  return device.label || ROOM_LABELS.device(index + 1);
}
