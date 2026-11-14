import { useSyncExternalStore } from "react";

/** true bila media query cocok; dipakai agar tabel/kartu hanya dirender salah satu (testid tidak ganda). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => true,
  );
}
