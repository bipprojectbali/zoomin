import type { UserSearchItem } from "../../shared/api.types";
import { isEmail, normalizeEmail } from "./invite.parse";

/** Baris dropdown: akun terdaftar, email manual tersimpan, atau "Tambah <email>" untuk email ketikan baru (M1–M4). */
export type InviteOption =
  | { kind: "user"; email: string; user: UserSearchItem }
  | { kind: "saved"; email: string }
  | { kind: "add"; email: string };

type Input = { text: string; users: readonly UserSearchItem[]; saved: readonly string[]; selfEmail?: string };

/**
 * Susun baris dropdown: akun (hasil server, tanpa diri sendiri) lalu email manual tersimpan yang cocok ketikan dan
 * bukan akun (akun menang, M4), lalu baris "Tambah" bila ketikan email valid yang belum ada di baris mana pun.
 */
export function buildOptions({ text, users, saved, selfEmail }: Input): InviteOption[] {
  const self = selfEmail ? normalizeEmail(selfEmail) : undefined;
  const typed = normalizeEmail(text);
  const options: InviteOption[] = users
    .map((user) => ({ kind: "user" as const, email: normalizeEmail(user.email), user }))
    .filter((o) => o.email !== self);
  const shown = new Set(options.map((o) => o.email));
  for (const email of saved) {
    if (email === self || shown.has(email) || !email.includes(typed)) continue;
    shown.add(email);
    options.push({ kind: "saved", email });
  }
  if (isEmail(typed) && typed !== self && !shown.has(typed)) options.push({ kind: "add", email: typed });
  return options;
}

/** Baris aktif bawaan (sebelum panah ditekan): tanpa ketikan = tidak ada (Enter submit form); ketikan email = baris itu. */
export function defaultActive(options: readonly InviteOption[], text: string): number {
  if (!text.trim()) return -1;
  const exact = options.findIndex((o) => o.email === normalizeEmail(text));
  return exact >= 0 ? exact : 0;
}
