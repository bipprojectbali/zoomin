import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { errorMessage } from "@/error.message";
import type { Page } from "../../shared/api.types";

/** State list ber-cursor: muat ulang saat `key` berubah, "Muat lagi", dan respons usang diabaikan. */
export type CursorList<T> = {
  items: T[];
  setItems: Dispatch<SetStateAction<T[]>>;
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  reload: () => void;
};

/** `fetchPage` dipanggil ulang dari awal setiap `key` berubah (mis. query pencarian + filter). */
export function useCursorList<T>(fetchPage: (cursor?: string) => Promise<Page<T>>, key: string): CursorList<T> {
  const [items, setItems] = useState<T[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;

  const load = useCallback(async (from?: string) => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const page = await fetchRef.current(from);
      if (id !== requestId.current) return;
      setItems((prev) => (from ? [...prev, ...page.items] : page.items));
      setCursor(page.nextCursor);
    } catch (err) {
      if (id !== requestId.current) return;
      console.error("admin: gagal memuat list", err);
      setError(errorMessage(err));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    setItems([]);
    void load();
  }, [key, load]);

  return {
    items,
    setItems,
    loading,
    error,
    hasMore: cursor !== null,
    loadMore: () => cursor && void load(cursor),
    reload: () => void load(),
  };
}
