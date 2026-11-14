import { Database } from "bun:sqlite";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** Folder file migrasi SQL bernomor (0001_*.sql, ...), dijalankan berurutan nama file. */
export const MIGRATIONS_DIR = join(import.meta.dir, "../../migrations");

/** Membuka DB SQLite (FK aktif, WAL untuk file) lalu menjalankan migrasi yang belum tercatat. */
export function openDb(path: string, migrationsDir = MIGRATIONS_DIR): Database {
  const inMemory = path === ":memory:";
  if (!inMemory) mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { strict: true, create: true });
  db.run("PRAGMA foreign_keys = ON");
  if (!inMemory) db.run("PRAGMA journal_mode = WAL");
  runMigrations(db, migrationsDir);
  return db;
}

/** Menjalankan file migrasi yang belum ada di `schema_migrations`. Idempotent. */
export function runMigrations(db: Database, migrationsDir = MIGRATIONS_DIR): string[] {
  db.run(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)",
  );
  const applied = new Set(
    db.query<{ name: string }, []>("SELECT name FROM schema_migrations").all().map((r) => r.name),
  );
  const pending = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql") && !applied.has(f))
    .sort();
  const record = db.prepare("INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)");
  for (const name of pending) {
    const sql = readFileSync(join(migrationsDir, name), "utf8");
    try {
      db.transaction(() => {
        db.run(sql);
        record.run(name, Date.now());
      })();
    } catch (cause) {
      throw new Error(`runMigrations: migrasi ${name} gagal`, { cause });
    }
  }
  return pending;
}
