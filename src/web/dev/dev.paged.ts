import { useCallback, useEffect, useRef, useState } from "react";
import type { Page } from "../../shared/api.types";
import { errorMessage } from "../error.message";

/**
 * Daftar ber-cursor untuk tab /dev: `fetchPage(cursor)` dipanggil ulang dari awal tiap `fetchPage` berubah (filter
 * baru); `loadMore` menambah halaman berikutnya. Respons usang (filter sudah berganti) diabaikan.
 */
export function usePaged<T>(fetchPage: (cursor: string | undefined) => Promise<Page<T>>, label: string) {
  const [items, setItems] = useState<T[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  const load = useCallback(
    async (from: string | undefined) => {
      const gen = ++generation.current;
      setLoading(true);
      try {
        const page = await fetchPage(from);
        if (gen !== generation.current) return;
        setItems((prev) => (from ? [...prev, ...page.items] : page.items));
        setCursor(page.nextCursor);
        setError(null);
      } catch (err) {
        if (gen !== generation.current) return;
        console.error(`dev: memuat ${label} gagal (cursor=${from ?? "awal"})`, err);
        setError(errorMessage(err));
      } finally {
        if (gen === generation.current) setLoading(false);
      }
    },
    [fetchPage, label],
  );

  useEffect(() => {
    void load(undefined);
  }, [load]);

  return {
    items,
    setItems,
    loading,
    error,
    hasMore: cursor !== null,
    reload: () => void load(undefined),
    loadMore: () => cursor && void load(cursor),
  };
}
