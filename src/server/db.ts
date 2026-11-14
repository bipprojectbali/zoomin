import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
// Migrasi di-embed sebagai teks (di-inline oleh `bun build --compile`), jadi runtime tidak membaca migrations/ dari disk.
// File migrasi baru: tambahkan import + entri MIGRATIONS (db.test.ts gagal bila daftar tak sinkron dengan folder).
import m0001 from "../../migrations/0001_init.sql" with { type: "text" };
import m0002 from "../../migrations/0002_auth.sql" with { type: "text" };
import m0003 from "../../migrations/0003_admin.sql" with { type: "text" };
import m0004 from "../../migrations/0004_room_access.sql" with { type: "text" };

export type Migration = { name: string; sql: string };

/** Migrasi SQL bernomor, berurutan nama file. */
export const MIGRATIONS: readonly Migration[] = [
  { name: "0001_init.sql", sql: m0001 },
  { name: "0002_auth.sql", sql: m0002 },
  { name: "0003_admin.sql", sql: m0003 },
  { name: "0004_room_access.sql", sql: m0004 },
];

/** Membuka koneksi SQLite (FK aktif, WAL untuk file) tanpa menjalankan migrasi. */
export function connectDb(path: string): Database {
  const inMemory = path === ":memory:";
  if (!inMemory) mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { strict: true, create: true });
  db.run("PRAGMA foreign_keys = ON");
  if (!inMemory) db.run("PRAGMA journal_mode = WAL");
  return db;
}

/** Membuka DB lalu menjalankan migrasi yang belum tercatat. */
export function openDb(path: string, migrations: readonly Migration[] = MIGRATIONS): Database {
  const db = connectDb(path);
  runMigrations(db, migrations);
  return db;
}

/** Menjalankan migrasi yang belum ada di `schema_migrations`; mengembalikan nama yang baru diterapkan. Idempotent. */
export function runMigrations(db: Database, migrations: readonly Migration[] = MIGRATIONS): string[] {
  db.run(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)",
  );
  const applied = new Set(
    db.query<{ name: string }, []>("SELECT name FROM schema_migrations").all().map((r) => r.name),
  );
  const pending = migrations.filter((m) => !applied.has(m.name)).toSorted((a, b) => a.name.localeCompare(b.name));
  const record = db.prepare("INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)");
  for (const { name, sql } of pending) {
    try {
      db.transaction(() => {
        db.run(sql);
        record.run(name, Date.now());
      })();
    } catch (cause) {
      throw new Error(`runMigrations: migrasi ${name} gagal`, { cause });
    }
  }
  return pending.map((m) => m.name);
}
