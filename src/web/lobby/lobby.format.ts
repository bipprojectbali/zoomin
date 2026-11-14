const DATE_TIME = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" });

/** Epoch ms → "14 Nov 2026, 12.50" (locale id-ID, bukan locale browser). */
export function formatDateTime(epochMs: number): string {
  return DATE_TIME.format(epochMs);
}

const SUFFIX_SEPARATOR_LENGTH = 5; // "-" + 4 char sufiks acak dari slugifyRoomId.

/**
 * Gabung bagian slug dari `slugified` (keluaran slugifyRoomId) dengan sufiks tetap, supaya ID turunan judul
 * tidak berganti sufiks tiap ketikan. `slugified` tanpa slug (judul kosong/simbol) → sufiks saja.
 */
export function withStableSuffix(slugified: string, suffix: string): string {
  const slug = slugified.length > suffix.length ? slugified.slice(0, -SUFFIX_SEPARATOR_LENGTH) : "";
  return slug ? `${slug}-${suffix}` : suffix;
}

/** ID room yang dipakai: isian manual bila tidak kosong, selain itu slug otomatis dari judul (QA-17). */
export function effectiveRoomId(customId: string | null, autoId: string): string {
  return customId?.trim() ? customId.trim() : autoId;
}
