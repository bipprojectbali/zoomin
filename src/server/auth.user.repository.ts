import type { Database } from "bun:sqlite";
import type { CliUserRow } from "../cli/cli.run";

/** Batas baris `zoomin user list` (jalan darurat; daftar lengkap ada di /admin). */
export const CLI_USER_LIST_MAX = 500;

type Row = { id: string; email: string; name: string; role: string | null; banned: number | null; createdAt: string };

const SELECT = `SELECT id, email, name, role, banned, createdAt FROM "user"`;
const toCli = (r: Row): CliUserRow => ({ ...r, role: r.role ?? "user", banned: r.banned === 1 });

function findByEmail(db: Database, email: string): Row {
  const row = db.query<Row, [string]>(`${SELECT} WHERE email = ?`).get(email.trim().toLowerCase());
  if (!row) throw new Error(`user dengan email ${email} tidak ditemukan`);
  return row;
}

/** User terbaru dulu, maksimal CLI_USER_LIST_MAX baris. */
export function listUsersForCli(db: Database): CliUserRow[] {
  return db.query<Row, [number]>(`${SELECT} ORDER BY createdAt DESC LIMIT ?`).all(CLI_USER_LIST_MAX).map(toCli);
}

/**
 * Ubah peran global lewat CLI (A11). super_admin tidak bisa diberikan/dicabut di sini: perannya disinkronkan dari
 * SUPER_ADMIN_EMAILS setiap login (A4), jadi perubahan manual akan tertimpa.
 */
export function setUserRoleByEmail(db: Database, email: string, role: "admin" | "user"): CliUserRow {
  const row = findByEmail(db, email);
  if (row.role === "super_admin") throw new Error(`${email} adalah super_admin (diatur lewat SUPER_ADMIN_EMAILS, bukan CLI)`);
  db.query(`UPDATE "user" SET role = ?, updatedAt = ? WHERE id = ?`).run(role, new Date().toISOString(), row.id);
  return toCli({ ...row, role });
}

/** Cabut ban (A11): banned=0, alasan & masa berlaku dihapus. */
export function unbanUserByEmail(db: Database, email: string): CliUserRow {
  const row = findByEmail(db, email);
  db.query(`UPDATE "user" SET banned = 0, banReason = NULL, banExpires = NULL, updatedAt = ? WHERE id = ?`).run(new Date().toISOString(), row.id);
  return toCli({ ...row, banned: 0 });
}
