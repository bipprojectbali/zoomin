const UNITS: [label: string, seconds: number][] = [
  ["hari", 86_400],
  ["jam", 3_600],
  ["menit", 60],
  ["detik", 1],
];

/** Detik → dua unit terbesar, mis. "3 hari 4 jam", "5 menit 2 detik", "0 detik". */
export function formatUptime(totalSec: number): string {
  let rest = Math.max(0, Math.floor(totalSec));
  const parts: string[] = [];
  for (const [label, size] of UNITS) {
    const n = Math.floor(rest / size);
    rest -= n * size;
    if (n > 0 || parts.length > 0) parts.push(`${n} ${label}`);
    if (parts.length === 2) break;
  }
  const nonZero = parts.filter((p) => !p.startsWith("0 "));
  return nonZero.length ? nonZero.join(" ") : "0 detik";
}

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"];
const ONE_DECIMAL = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });

/** Byte → "1,5 MB" (basis 1024, locale id-ID); null → "—". */
export function formatBytes(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes) || bytes < 0) return "—";
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${ONE_DECIMAL.format(value)} ${BYTE_UNITS[unit]}`;
}

const RELATIVE = new Intl.RelativeTimeFormat("id-ID", { numeric: "auto" });
const RELATIVE_STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["second", 60],
  ["minute", 60],
  ["hour", 24],
  ["day", 30],
  ["month", 12],
  ["year", Number.POSITIVE_INFINITY],
];

/** Epoch ms → "5 menit yang lalu" relatif terhadap `now` (locale id-ID). */
export function formatRelative(epochMs: number, now: number): string {
  let value = (epochMs - now) / 1000;
  for (const [unit, size] of RELATIVE_STEPS) {
    if (Math.abs(value) < size) return RELATIVE.format(Math.round(value), unit);
    value /= size;
  }
  return RELATIVE.format(Math.round(value), "year");
}

const DETAIL_MAX = 80;

/** Ringkasan satu baris detail audit: `k: v, …` dipotong ke 80 karakter; objek kosong → "—". */
export function summarizeDetail(detail: Record<string, unknown>): string {
  const entries = Object.entries(detail);
  if (entries.length === 0) return "—";
  const text = entries.map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`).join(", ");
  return text.length > DETAIL_MAX ? `${text.slice(0, DETAIL_MAX - 1)}…` : text;
}
