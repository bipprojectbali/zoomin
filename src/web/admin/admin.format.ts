import type { AdminUser } from "../../shared/api.types";
import { ADMIN_TEXT } from "./admin.labels";

/** Pilihan durasi blokir di dialog; `hours` undefined = permanen. */
export const BAN_DURATIONS = [
  { id: "1h", label: "1 jam", hours: 1 },
  { id: "1d", label: "1 hari", hours: 24 },
  { id: "7d", label: "7 hari", hours: 24 * 7 },
  { id: "30d", label: "30 hari", hours: 24 * 30 },
  { id: "permanent", label: "Permanen", hours: undefined },
] as const;

export type BanDurationId = (typeof BAN_DURATIONS)[number]["id"];

/** `expiresInHours` untuk BanUserBody; undefined = permanen. */
export function banExpiresInHours(id: BanDurationId): number | undefined {
  return BAN_DURATIONS.find((d) => d.id === id)?.hours;
}

/** Batas panjang alasan blokir (sama dengan validasi server). */
export const BAN_REASON_MIN = 3;
export const BAN_REASON_MAX = 200;

/** Pesan error alasan blokir, atau null bila valid (dihitung setelah trim). */
export function banReasonError(reason: string): string | null {
  const len = reason.trim().length;
  if (len < BAN_REASON_MIN) return `Alasan minimal ${BAN_REASON_MIN} karakter.`;
  if (len > BAN_REASON_MAX) return `Alasan maksimal ${BAN_REASON_MAX} karakter.`;
  return null;
}

const DATE_TIME = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" });
const DATE = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" });

/** "14 Nov 2026, 10.30" (id-ID). */
export const formatDateTime = (ms: number) => DATE_TIME.format(ms);
/** "14 Nov 2026" (id-ID). */
export const formatDate = (ms: number) => DATE.format(ms);

/** true bila blokir masih berlaku pada `now` (blokir yang sudah lewat masa berlaku dianggap aktif). */
export function isBanActive(user: Pick<AdminUser, "banned" | "banExpires">, now: number): boolean {
  return user.banned && (user.banExpires === null || user.banExpires > now);
}

/** Label status: "Aktif", atau "Diblokir" + detail "sampai …"/"permanen". */
export function userStatusLabel(user: Pick<AdminUser, "banned" | "banExpires">, now: number): { label: string; detail: string | null } {
  if (!isBanActive(user, now)) return { label: ADMIN_TEXT.statusActive, detail: null };
  const detail = user.banExpires === null ? ADMIN_TEXT.bannedForever : ADMIN_TEXT.bannedUntil(formatDateTime(user.banExpires));
  return { label: ADMIN_TEXT.statusBanned, detail };
}

const RELATIVE = new Intl.RelativeTimeFormat("id-ID", { numeric: "auto" });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600_000],
  ["month", 30 * 24 * 3600_000],
  ["week", 7 * 24 * 3600_000],
  ["day", 24 * 3600_000],
  ["hour", 3600_000],
  ["minute", 60_000],
];

/** "3 jam yang lalu" (id-ID); null → "Belum pernah"; < 1 menit → "sekarang". */
export function formatRelative(ms: number | null, now: number): string {
  if (ms === null) return ADMIN_TEXT.never;
  const diff = ms - now;
  for (const [unit, size] of UNITS) if (Math.abs(diff) >= size) return RELATIVE.format(Math.round(diff / size), unit);
  return RELATIVE.format(0, "second");
}
