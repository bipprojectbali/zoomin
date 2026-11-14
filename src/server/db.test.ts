import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { connectDb, MIGRATIONS, openDb, runMigrations } from "./db";

const ALL = MIGRATIONS.map((m) => m.name);
const [M0001, M0002] = MIGRATIONS;
const count = (db: ReturnType<typeof connectDb>, sql: string) => db.query<{ n: number }, []>(`SELECT COUNT(*) AS n FROM ${sql}`).get()?.n;
const tableExists = (db: ReturnType<typeof connectDb>, name: string) =>
  db.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !== null;

/** User Better Auth minimal (kolom wajib skema 0002). */
function addUser(db: ReturnType<typeof connectDb>, id: string) {
  db.run(
    `INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
    [id, id, `${id}@example.test`], // test-only
  );
}

function seed() {
  const db = openDb(":memory:");
  addUser(db, "u1");
  db.run("INSERT INTO rooms (id, title, created_by, created_at) VALUES ('r1', 'R1', 'u1', 1)");
  return db;
}

describe("db", () => {
  test("migrasi idempotent: jalan 2x tanpa error dan tercatat sekali", () => {
    const db = openDb(":memory:");
    expect(runMigrations(db)).toEqual([]);
    const rows = db.query<{ name: string }, []>("SELECT name FROM schema_migrations").all();
    expect(rows.map((r) => r.name)).toEqual(ALL);
  });

  test("MIGRATIONS embed sinkron dengan folder migrations/ (urutan nama file)", () => {
    const files = readdirSync(join(import.meta.dir, "../../migrations")).filter((f) => f.endsWith(".sql")).sort();
    expect(ALL).toEqual(files);
  });

  test("runMigrations mengembalikan migrasi yang baru diterapkan, lalu [] di run berikutnya", () => {
    const db = connectDb(":memory:");
    const extra = [...MIGRATIONS, { name: "9999_test.sql", sql: "CREATE TABLE t9 (a INTEGER)" }]; // test-only
    expect(runMigrations(db)).toEqual(ALL);
    expect(runMigrations(db, extra)).toEqual(["9999_test.sql"]);
    expect(runMigrations(db, extra)).toEqual([]);
  });

  test("migrasi gagal → error menyebut nama file, tidak tercatat", () => {
    const db = connectDb(":memory:");
    const bad = [{ name: "0001_bad.sql", sql: "CREATE TABLE (" }]; // test-only
    expect(() => runMigrations(db, bad)).toThrow("migrasi 0001_bad.sql gagal");
    expect(db.query("SELECT * FROM schema_migrations").all()).toEqual([]);
  });

  test("foreign_keys aktif", () => {
    const db = openDb(":memory:");
    expect(db.query<{ foreign_keys: number }, []>("PRAGMA foreign_keys").get()?.foreign_keys).toBe(1);
  });

  test("CHECK role room: 'admin' lama dan 'owner' ditolak, 'host' diterima", () => {
    const db = seed();
    for (const role of ["owner", "admin"]) {
      expect(() => db.run("INSERT INTO room_members (room_id, user_id, role) VALUES ('r1', 'u1', ?)", [role])).toThrow(/CHECK/);
    }
    db.run("INSERT INTO room_members (room_id, user_id, role) VALUES ('r1', 'u1', 'host')");
  });

  test("FK: member ke room/user tak dikenal ditolak; hapus room → member ikut terhapus", () => {
    const db = seed();
    expect(() => db.run("INSERT INTO room_members (room_id, user_id, role) VALUES ('nope', 'u1', 'host')")).toThrow(/FOREIGN KEY/);
    expect(() => db.run("INSERT INTO room_members (room_id, user_id, role) VALUES ('r1', 'ghost', 'host')")).toThrow(/FOREIGN KEY/);
    db.run("INSERT INTO room_members (room_id, user_id, role) VALUES ('r1', 'u1', 'host')");
    db.run("DELETE FROM rooms WHERE id = 'r1'");
    expect(count(db, "room_members")).toBe(0);
  });

  test("hapus user → sesi & membership terhapus, room tetap dengan created_by NULL", () => {
    const db = seed();
    db.run("INSERT INTO room_members (room_id, user_id, role) VALUES ('r1', 'u1', 'host')");
    db.run(`INSERT INTO "session" (id, expiresAt, token, createdAt, updatedAt, userId) VALUES ('s1', 'x', 't1', 'x', 'x', 'u1')`);
    db.run(`DELETE FROM "user" WHERE id = 'u1'`);
    expect(count(db, "room_members")).toBe(0);
    expect(count(db, `"session"`)).toBe(0);
    expect(db.query<{ created_by: string | null }, []>("SELECT created_by FROM rooms WHERE id = 'r1'").get()?.created_by).toBeNull();
  });
});

describe("0002_auth dari DB berisi data 0001", () => {
  function legacyDb() {
    const db = connectDb(":memory:");
    runMigrations(db, [M0001!]);
    db.run("INSERT INTO users (id, name, is_admin, created_at) VALUES ('admin', 'Admin', 1, 1), ('u_guest', 'Tamu', 0, 1)");
    db.run("INSERT INTO rooms (id, title, created_by, layout_json, layout_version, created_at) VALUES ('r1', 'R1', 'admin', '{\"v\":1}', 3, 10)");
    db.run("INSERT INTO room_members (room_id, user_id, role) VALUES ('r1', 'admin', 'admin'), ('r1', 'u_guest', 'viewer')");
    return db;
  }

  test("room & layout dipertahankan; users lama dibuang (A13); created_by tanpa akun → NULL", () => {
    const db = legacyDb();
    expect(runMigrations(db)).toEqual(ALL.slice(1));
    expect(tableExists(db, "users")).toBe(false);
    expect(db.query("SELECT id, title, created_by, layout_json, layout_version, created_at FROM rooms").all()).toEqual([
      { id: "r1", title: "R1", created_by: null, layout_json: '{"v":1}', layout_version: 3, created_at: 10 },
    ]);
    // Member lama tidak punya akun Better Auth → tidak bisa disalin (FK).
    expect(count(db, "room_members")).toBe(0);
    expect(db.query("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  test("member yang akunnya sudah ada di \"user\": role admin → host, lainnya tetap", () => {
    const db = legacyDb();
    // Simulasi tabel "user" sudah dibuat lebih dulu (mis. CLI Better Auth) dengan id yang sama: IF NOT EXISTS melewatinya.
    db.run(`CREATE TABLE "user" (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, emailVerified INTEGER NOT NULL,
      image TEXT, createdAt DATE NOT NULL, updatedAt DATE NOT NULL, role TEXT, banned INTEGER, banReason TEXT, banExpires DATE)`);
    addUser(db, "admin");
    addUser(db, "u_guest");
    runMigrations(db);
    expect(db.query("SELECT user_id, role FROM room_members ORDER BY user_id").all()).toEqual([
      { user_id: "admin", role: "host" },
      { user_id: "u_guest", role: "viewer" },
    ]);
    expect(db.query<{ created_by: string }, []>("SELECT created_by FROM rooms").get()?.created_by).toBe("admin");
  });

  test("SQL 0002 aman dijalankan ulang langsung (tanpa schema_migrations) dan data tetap", () => {
    const db = seed();
    db.run("INSERT INTO room_members (room_id, user_id, role) VALUES ('r1', 'u1', 'host')");
    db.transaction(() => db.run(M0002!.sql))();
    expect(db.query("SELECT room_id, user_id, role FROM room_members").all()).toEqual([{ room_id: "r1", user_id: "u1", role: "host" }]);
    expect(db.query<{ created_by: string }, []>("SELECT created_by FROM rooms").get()?.created_by).toBe("u1");
    expect(db.query("PRAGMA foreign_key_check").all()).toEqual([]);
  });
});
