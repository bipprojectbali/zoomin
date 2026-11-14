import type { ApiErrorCode } from "../shared/api.types";
import { ApiRequestError } from "./api.client";

/** Jenis perangkat untuk pesan error media. */
export type MediaKind = "camera" | "mic" | "screen";

const TEXT = {
  unknown: "Terjadi kesalahan tak terduga. Coba lagi.",
  network: "Tidak dapat menghubungi server. Periksa koneksi internet lalu coba lagi.",
  aborted: "Permintaan dibatalkan. Coba lagi.",
  server: "Server sedang bermasalah. Coba lagi beberapa saat lagi.",
  conflict: "Data baru saja berubah. Muat ulang halaman lalu coba lagi.",
  invalidField: (field: string) => `${field} belum valid. Periksa kembali lalu coba lagi.`,
  device: "perangkat",
} as const;

const CODE_TEXT: Record<ApiErrorCode, string> = {
  unauthorized: "Sesi Anda sudah berakhir. Masuk lagi, atau buka ulang link undangan dari admin room.",
  forbidden: "Anda tidak punya akses untuk tindakan ini. Minta admin room memberi akses.",
  not_found: "Data yang dicari tidak ditemukan. Mungkin sudah dihapus.",
  room_not_found: "Room tidak ditemukan. Mungkin sudah dihapus atau link-nya salah.",
  room_exists: "ID room sudah dipakai. Ganti ID room di Opsi lanjutan.",
  invalid_input: "Isian belum valid. Periksa kembali lalu coba lagi.",
  invite_invalid: "Link undangan tidak valid atau sudah kedaluwarsa. Minta link baru ke admin room.",
  invalid_credentials: "Password salah. Periksa lalu coba lagi.",
  rate_limited: "Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.", // tanpa Retry-After; lihat rateLimitedText
  layout_conflict: "Layout baru saja diubah admin lain. Tampilan sudah diperbarui, silakan ulangi perubahan Anda.",
};

/** Fallback per status HTTP bila server tidak mengirim `code`. */
const STATUS_TEXT: Record<number, string> = {
  400: CODE_TEXT.invalid_input,
  401: CODE_TEXT.unauthorized,
  403: CODE_TEXT.forbidden,
  404: CODE_TEXT.not_found,
  409: TEXT.conflict,
  429: CODE_TEXT.rate_limited,
};

/** Nama field (dari `ApiError.path`) yang ditampilkan ke user. */
const FIELD_LABEL: Record<string, string> = {
  id: "ID room (huruf, angka, - atau _, maks 64 karakter)",
  title: "Judul room",
  name: "Nama",
  password: "Password",
  role: "Peran",
  invite: "Link undangan",
};

const HTTP_SERVER_ERROR = 500;
const HTTP_TOO_MANY_REQUESTS = 429;
const SECONDS_PER_MINUTE = 60;

/** "…Coba lagi dalam N menit." (dibulatkan ke atas; <60 dtk → detik) dari `Retry-After`. */
export function rateLimitedText(retryAfterSeconds: number): string {
  const wait =
    retryAfterSeconds < SECONDS_PER_MINUTE
      ? `${Math.max(1, Math.ceil(retryAfterSeconds))} detik`
      : `${Math.ceil(retryAfterSeconds / SECONDS_PER_MINUTE)} menit`;
  return `Terlalu banyak percobaan. Coba lagi dalam ${wait}.`;
}

const KIND_NOUN: Record<MediaKind, string> = { camera: "kamera", mic: "mikrofon", screen: "layar" };

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function errorName(err: unknown): string | null {
  if (err && typeof err === "object" && "name" in err && typeof err.name === "string") return err.name;
  return null;
}

const MEDIA_ERROR_NAMES = new Set([
  "NotAllowedError",
  "SecurityError",
  "PermissionDeniedError",
  "NotFoundError",
  "DevicesNotFoundError",
  "NotReadableError",
  "TrackStartError",
  "OverconstrainedError",
  "ConstraintNotSatisfiedError",
  "NotSupportedError",
]);

/** Pesan error yang layak ditampilkan ke user: kode/status API, jaringan, media, pesan Error, atau teks umum. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiRequestError) {
    if (err.code === "invalid_input" && err.path) {
      const label = FIELD_LABEL[err.path.replace(/^\//, "")];
      if (label) return TEXT.invalidField(label);
    }
    const limited = err.code === "rate_limited" || (!err.code && err.status === HTTP_TOO_MANY_REQUESTS);
    if (limited && err.retryAfterSeconds !== null) return rateLimitedText(err.retryAfterSeconds);
    if (err.code && err.code in CODE_TEXT) return CODE_TEXT[err.code];
    if (err.status >= HTTP_SERVER_ERROR) return TEXT.server;
    return STATUS_TEXT[err.status] ?? TEXT.unknown;
  }
  const name = errorName(err);
  if (name && MEDIA_ERROR_NAMES.has(name)) return mediaErrorMessage(err, null);
  if (name === "AbortError") return TEXT.aborted;
  // fetch() gagal di level jaringan melempar TypeError (bukan respons HTTP).
  if (err instanceof TypeError) return TEXT.network;
  if (err instanceof Error && err.message) return err.message;
  return TEXT.unknown;
}

/** Pesan error getUserMedia/getDisplayMedia beserta saran tindakan; `kind` null = perangkat umum. */
export function mediaErrorMessage(err: unknown, kind: MediaKind | null): string {
  const noun = kind ? KIND_NOUN[kind] : TEXT.device;
  const Noun = capitalize(noun);
  const name = errorName(err);
  if (kind === "screen") {
    switch (name) {
      case "NotAllowedError":
      case "PermissionDeniedError":
        return "Berbagi layar dibatalkan atau tidak diizinkan. Klik Bagikan layar lagi dan pilih layar, jendela, atau tab.";
      case "NotFoundError":
        return "Tidak ada layar atau jendela yang bisa dibagikan.";
      case "NotReadableError":
      case "AbortError":
        return "Layar tidak bisa direkam. Periksa izin rekam layar di pengaturan sistem (macOS: Privasi & Keamanan → Rekaman Layar), lalu coba lagi.";
      case "NotSupportedError":
        return "Browser ini tidak mendukung berbagi layar. Gunakan Chrome, Edge, atau Firefox versi terbaru di komputer.";
    }
  }
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
    case "PermissionDeniedError":
      return `Akses ${noun} ditolak. Izinkan lewat ikon gembok di bilah alamat browser, lalu coba lagi.`;
    case "NotFoundError":
    case "DevicesNotFoundError":
      return `${Noun} tidak ditemukan. Pastikan ${noun} terpasang, lalu coba lagi.`;
    case "NotReadableError":
    case "TrackStartError":
      return `${Noun} sedang dipakai aplikasi lain atau bermasalah. Tutup aplikasi lain (mis. Zoom atau Meet), lalu coba lagi.`;
    case "OverconstrainedError":
    case "ConstraintNotSatisfiedError":
      return `${Noun} yang dipilih tidak mendukung pengaturan ini. Pilih ${noun} lain.`;
    case "NotSupportedError":
      return `Browser ini tidak mendukung akses ${noun}. Gunakan browser versi terbaru.`;
    case "AbortError":
      return `${Noun} gagal dimulai. Coba lagi.`;
  }
  return `${Noun} tidak bisa dipakai. Muat ulang halaman lalu coba lagi.`;
}
