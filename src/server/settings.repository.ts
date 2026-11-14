import type { Database } from "bun:sqlite";
import type { AppSettings, SessionUser } from "../shared/api.types";
import { ALLOWED_EMAIL_DOMAINS_KEY, getAllowedEmailDomains } from "./auth.better";
import { recordAudit } from "./audit.repository";

/** Batas jumlah domain email yang diizinkan (A9). */
export const ALLOWED_EMAIL_DOMAINS_MAX = 50;

// Label 1–63 (huruf/angka/-; tidak diawali/diakhiri -), minimal satu titik, TLD huruf 2–63, total ≤ 253.
const DOMAIN_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** Setting tidak valid (dipetakan ke 400 invalid_input; `path` = pointer field). */
export class InvalidSettingsError extends Error {
  constructor(message: string, readonly path: string) {
    super(message);
  }
}

/**
 * Setting proyek saat ini. Format allowedEmailDomains dibaca lewat getAllowedEmailDomains (auth.better.ts) agar sama
 * persis dengan yang ditegakkan saat login.
 */
export function getSettings(db: Database): AppSettings {
  return { allowedEmailDomains: getAllowedEmailDomains(db) };
}

/** Normalisasi (trim, huruf kecil) + validasi; throw InvalidSettingsError bila format/duplikat/jumlah salah. */
function normalizeDomains(domains: readonly string[]): string[] {
  if (domains.length > ALLOWED_EMAIL_DOMAINS_MAX) {
    throw new InvalidSettingsError(`allowedEmailDomains maksimal ${ALLOWED_EMAIL_DOMAINS_MAX}`, "/allowedEmailDomains");
  }
  const out = domains.map((d) => d.trim().toLowerCase());
  out.forEach((d, i) => {
    if (!DOMAIN_PATTERN.test(d)) throw new InvalidSettingsError(`domain tidak valid: ${JSON.stringify(d)}`, `/allowedEmailDomains/${i}`);
    if (out.indexOf(d) !== i) throw new InvalidSettingsError(`domain duplikat: ${d}`, `/allowedEmailDomains/${i}`);
  });
  return out;
}

/** Simpan setting (validasi dulu) + audit `setting.update` dalam satu transaksi; mengembalikan nilai tersimpan. */
export function updateSettings(db: Database, next: AppSettings, by: SessionUser): AppSettings {
  const allowedEmailDomains = normalizeDomains(next.allowedEmailDomains);
  const before = getSettings(db);
  db.transaction(() => {
    db.query(
      `INSERT INTO app_settings (key, value_json, updated_at, updated_by) VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    ).run(ALLOWED_EMAIL_DOMAINS_KEY, JSON.stringify(allowedEmailDomains), Date.now(), by.id);
    recordAudit(db, {
      actorId: by.id,
      actorEmail: by.email,
      action: "setting.update",
      targetType: "setting",
      targetId: ALLOWED_EMAIL_DOMAINS_KEY,
      detail: { before: before.allowedEmailDomains, after: allowedEmailDomains },
    });
  })();
  return { allowedEmailDomains };
}
