import { useEffect, useRef, useState } from "react";
import { ApiRequestError, searchUsers } from "@/api.client";
import type { UserSearchItem } from "../../shared/api.types";

const DEBOUNCE_MS = 250;
const HTTP_FORBIDDEN = 403;
const HTTP_TOO_MANY = 429;

/**
 * Akun terdaftar untuk `query` (kosong = semua, urut nama; M1/M5) selama `enabled` (dropdown terbuka), debounce.
 * Hasil di-cache per query selama komponen hidup (buka/tutup dropdown tidak memanggil ulang server).
 * 403 → pencarian dimatikan (tetap bisa undang email manual); 429/galat lain → kosong untuk query itu.
 */
export function useUserSearch(query: string, enabled: boolean): { items: UserSearchItem[]; loading: boolean } {
  // ponytail: cache tanpa kadaluarsa per mount; akun baru muncul setelah form dibuka ulang.
  const cache = useRef(new Map<string, UserSearchItem[]>());
  const [items, setItems] = useState<UserSearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const q = query.trim();

  useEffect(() => {
    const cached = cache.current.get(q);
    if (cached) return void setItems(cached);
    setItems([]);
    if (forbidden || !enabled) return setLoading(false);
    let stale = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await searchUsers(q);
        cache.current.set(q, res.items);
        if (!stale) setItems(res.items);
      } catch (err) {
        if (stale) return;
        if (err instanceof ApiRequestError && err.status === HTTP_FORBIDDEN) setForbidden(true);
        else if (!(err instanceof ApiRequestError && err.status === HTTP_TOO_MANY)) console.error("invite-picker: cari akun gagal", err);
      } finally {
        if (!stale) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [q, enabled, forbidden]);

  return { items, loading };
}
