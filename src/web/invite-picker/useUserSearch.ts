import { useEffect, useState } from "react";
import { ApiRequestError, searchUsers } from "@/api.client";
import { USER_SEARCH_MIN, type UserSearchItem } from "../../shared/api.types";

const DEBOUNCE_MS = 250;
const HTTP_FORBIDDEN = 403;
const HTTP_TOO_MANY = 429;

/**
 * Saran akun terdaftar untuk `query` (debounce, ≥ USER_SEARCH_MIN huruf). 403 → pencarian dimatikan untuk sesi
 * komponen ini (tetap bisa undang email manual); 429/galat lain → saran kosong untuk query itu.
 */
export function useUserSearch(query: string): { items: UserSearchItem[]; loading: boolean } {
  const [items, setItems] = useState<UserSearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const q = query.trim();

  useEffect(() => {
    setItems([]);
    if (forbidden || q.length < USER_SEARCH_MIN) return setLoading(false);
    let stale = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await searchUsers(q);
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
  }, [q, forbidden]);

  return { items, loading };
}
