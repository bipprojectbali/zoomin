import { useCallback, useState } from "react";
import { isEmail, normalizeEmail } from "./invite.parse";

/** Batas daftar email manual tersimpan per user (M4, RND/plan/09-invite-multiselect.md). */
export const MANUAL_MAX = 50;

/** Kunci localStorage daftar email manual milik `userId`. */
export const manualKey = (userId: string) => `zoomin.invite.manual.${userId}`;

type KeyValue = Pick<Storage, "getItem" | "setItem">;

/** localStorage browser, atau null bila tidak ada / aksesnya dilempar (mode privat, situs diblok). */
function browserStorage(): KeyValue | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // akses localStorage dilempar → perlakukan seperti tidak ada storage (M4)
  }
}

/** Gabung `emails` ke depan `list`: dinormalisasi, hanya email valid, unik, terbaru di atas, maks MANUAL_MAX. */
export function withAdded(list: readonly string[], emails: readonly string[]): string[] {
  const fresh = emails.map(normalizeEmail).filter(isEmail).reverse(); // email terakhir ditambahkan = paling atas
  return [...new Set([...fresh, ...list])].slice(0, MANUAL_MAX);
}

/** Baca daftar tersimpan; gagal (storage diblok, JSON rusak, bentuk salah) = daftar kosong, tidak pernah melempar. */
export function loadManual(userId: string, storage: KeyValue | null = browserStorage()): string[] {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(manualKey(userId)) ?? "[]");
    return Array.isArray(parsed) ? withAdded([], parsed.filter((e): e is string => typeof e === "string").reverse()) : [];
  } catch {
    return []; // data rusak / storage dilempar → daftar kosong, fitur tetap jalan (M4)
  }
}

/** Tulis daftar; gagal (kuota penuh, storage diblok) hanya diperingatkan, tidak melempar. */
export function saveManual(userId: string, list: readonly string[], storage: KeyValue | null = browserStorage()): void {
  try {
    storage?.setItem(manualKey(userId), JSON.stringify(list));
  } catch (err) {
    console.warn("invite-picker: simpan email manual gagal", err);
  }
}

/** Daftar email manual tersimpan milik `userId` (tanpa user = hanya di memori) + tambah/hapus yang langsung disimpan. */
export function useManualEmails(userId: string | undefined) {
  const [list, setList] = useState(() => (userId ? loadManual(userId) : []));
  const update = useCallback(
    (fn: (prev: string[]) => string[]) =>
      setList((prev) => {
        const next = fn(prev);
        if (userId) saveManual(userId, next);
        return next;
      }),
    [userId],
  );
  const add = useCallback((emails: string[]) => update((prev) => withAdded(prev, emails)), [update]);
  const remove = useCallback((email: string) => update((prev) => prev.filter((e) => e !== email)), [update]);
  return { list, add, remove };
}
