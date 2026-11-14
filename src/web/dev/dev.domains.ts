import { DEV_TEXT } from "./dev.labels";

/** Sama dengan ALLOWED_EMAIL_DOMAINS_MAX di src/server/settings.repository.ts. */
export const ALLOWED_EMAIL_DOMAINS_MAX = 50;

// Salinan DOMAIN_PATTERN server (settings.repository.ts) — tidak di-import karena modul itu menarik bun:sqlite/Better
// Auth ke bundle SPA. Ubah keduanya bersamaan; dev.domains.test.ts memuat kasus yang sama dengan server.
const DOMAIN_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** Normalisasi seperti server: trim + huruf kecil (juga buang "@" di depan agar "@acme.com" diterima). */
export function normalizeDomain(raw: string): string {
  return raw.trim().toLowerCase().replace(/^@/, "");
}

/** true bila domain (sudah dinormalisasi) lolos validasi format server. */
export function isValidDomain(domain: string): boolean {
  return DOMAIN_PATTERN.test(domain);
}

/**
 * Tambah satu/lebih domain dari isian (dipisah koma/spasi) ke daftar. Berhenti di isian pertama yang salah dan
 * mengembalikan pesan error; domain valid sebelum itu tetap ditambahkan.
 */
export function addDomains(current: readonly string[], raw: string): { domains: string[]; error: string | null } {
  const domains = [...current];
  for (const part of raw.split(/[\s,;]+/).map(normalizeDomain).filter(Boolean)) {
    if (!isValidDomain(part)) return { domains, error: DEV_TEXT.settings.invalid(part) };
    if (domains.includes(part)) return { domains, error: DEV_TEXT.settings.duplicate(part) };
    if (domains.length >= ALLOWED_EMAIL_DOMAINS_MAX) return { domains, error: DEV_TEXT.settings.tooMany(ALLOWED_EMAIL_DOMAINS_MAX) };
    domains.push(part);
  }
  return { domains, error: null };
}

/** true bila dua daftar domain sama persis (urutan diperhatikan, seperti yang disimpan server). */
export function sameDomains(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((d, i) => d === b[i]);
}
