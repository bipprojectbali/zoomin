import { ROOM_EXPIRY_MAX_DAYS, type RoomStatus, type RoomSummary } from "../../shared/api.types";

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Pilihan kadaluarsa saat membuat room: tanpa batas, N hari, atau tanggal pilihan. */
export type ExpiryPreset = "none" | "1" | "7" | "30" | "custom";

/** Hari untuk tombol cepat perpanjang (R7). */
export const EXTEND_DAYS = [1, 7, 30] as const;

/** Batas atas kadaluarsa yang diterima server: now + 365 hari. */
export const maxExpiry = (now: number) => now + ROOM_EXPIRY_MAX_DAYS * DAY_MS;

/** Kadaluarsa valid menurut server: (now, now + 365 hari]. */
export const isExpiryInRange = (expiresAt: number, now: number) => expiresAt > now && expiresAt <= maxExpiry(now);

/** Perpanjang `days` hari dari max(now, expiresAt) (R7); tanpa batas dihitung dari sekarang. */
export function extendExpiry(expiresAt: number | null, days: number, now: number): number {
  return Math.max(now, expiresAt ?? now) + days * DAY_MS;
}

/** Nilai `expiresAt` untuk body buat room; null = tanpa batas, undefined = tanggal custom belum valid. */
export function presetExpiry(preset: ExpiryPreset, customValue: string, now: number): number | null | undefined {
  if (preset === "none") return null;
  if (preset === "custom") {
    const ms = fromLocalInput(customValue);
    return ms !== null && isExpiryInRange(ms, now) ? ms : undefined;
  }
  return now + Number(preset) * DAY_MS;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Epoch ms → nilai `<input type="datetime-local">` (waktu lokal browser, presisi menit). */
export function toLocalInput(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Nilai `datetime-local` (waktu lokal) → epoch ms; kosong/tidak valid → null. */
export function fromLocalInput(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/** true bila room tidak bisa dimasuki (Masuk di-disable). */
export const isRoomBlocked = (room: Pick<RoomSummary, "status">) => room.status !== "active";

/** Status ditampilkan sebagai badge hanya bila bukan aktif. */
export const statusBadgeStatus = (status: RoomStatus): Exclude<RoomStatus, "active"> | null => (status === "active" ? null : status);
