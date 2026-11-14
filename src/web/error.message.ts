import { ApiRequestError } from "./api.client";

const TEXT = {
  unknown: "Terjadi kesalahan tak terduga",
  network: "Tidak dapat menghubungi server, periksa koneksi",
};

/** Pesan error yang layak ditampilkan ke user: body.error API, pesan Error, atau teks umum. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiRequestError) return err.body.error || TEXT.unknown;
  // fetch() gagal di level jaringan melempar TypeError (bukan respons HTTP).
  if (err instanceof TypeError) return TEXT.network;
  if (err instanceof Error && err.message) return err.message;
  return TEXT.unknown;
}
