import type { AddRoomMemberBody, RoomRole } from "../../shared/api.types";

/** Bentuk email minimal (validasi final di server: format email + allowlist domain). */
const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

/** Normalisasi email: trim + huruf kecil (server membandingkan case-insensitive). */
export const normalizeEmail = (raw: string) => raw.trim().toLowerCase();

/** True bila teks (sudah dinormalisasi) berbentuk email. */
export const isEmail = (email: string) => EMAIL.test(email);

export type ParsedEmail = { email: string; invalid: boolean };

/**
 * Pecah teks tempelan (koma/titik koma/spasi/baris baru) jadi email unik yang dinormalisasi.
 * `exclude` = email yang sudah ada (chip lain / diri sendiri) → dilewati. Token tak valid ditandai `invalid`.
 */
export function parseEmails(text: string, exclude: Iterable<string> = []): ParsedEmail[] {
  const seen = new Set(Array.from(exclude, normalizeEmail));
  const out: ParsedEmail[] = [];
  for (const token of text.split(/[\s,;]+/)) {
    const email = normalizeEmail(token);
    if (!email || seen.has(email)) continue;
    seen.add(email);
    out.push({ email, invalid: !isEmail(email) });
  }
  return out;
}

/** Satu chip undangan (nilai terkontrol InvitePicker). `invalid` = ditampilkan sebagai error, tidak dikirim. */
export type InviteEntry = { email: string; role: RoomRole; name?: string; image?: string | null; invalid?: boolean };

/** Chip valid → body `POST /members` / `CreateRoomBody.members`. */
export const validInvites = (entries: readonly InviteEntry[]): AddRoomMemberBody[] =>
  entries.filter((e) => !e.invalid).map(({ email, role }) => ({ email, role }));
