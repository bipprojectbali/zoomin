/** Panjang maksimum bagian slug (sebelum sufiks acak); total ≤ 48 + 1 + 4, tetap di bawah batas 64 SAFE_ID_PATTERN. */
const SLUG_MAX = 48;
const SUFFIX_LENGTH = 4;
const BASE36 = 36;

/**
 * Judul room → id aman: huruf kecil, spasi → `-`, aksen dilepas, karakter lain dibuang, maks 48, lalu sufiks acak
 * 4 char base36 (`rapat-desain-k3x9`) agar dua judul sama tidak bentrok. Judul tanpa karakter valid → sufiks saja.
 */
export function slugifyRoomId(title: string): string {
  const slug = title
    .normalize("NFKD")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, SLUG_MAX)
    .replace(/^-+|-+$/g, "");
  // ponytail: sedikit bias modulo (256 % 36), cukup untuk anti-bentrok, bukan untuk keamanan.
  const suffix = Array.from(crypto.getRandomValues(new Uint8Array(SUFFIX_LENGTH)), (b) => (b % BASE36).toString(BASE36)).join("");
  return slug ? `${slug}-${suffix}` : suffix;
}
