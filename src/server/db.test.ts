import { describe, expect, test } from "bun:test";
import { openDb, runMigrations } from "./db";

function seed() {
  const db = openDb(":memory:");
  db.run("INSERT INTO users (id, name, created_at) VALUES ('u1', 'U1', 1)");
  db.run("INSERT INTO rooms (id, title, created_by, created_at) VALUES ('r1', 'R1', 'u1', 1)");
  return db;
}

describe("db", () => {
  test("migrasi idempotent: jalan 2x tanpa error dan tercatat sekali", () => {
    const db = openDb(":memory:");
    expect(runMigrations(db)).toEqual([]);
    const rows = db.query<{ name: string }, []>("SELECT name FROM schema_migrations").all();
    expect(rows.map((r) => r.name)).toEqual(["0001_init.sql"]);
  });

  test("foreign_keys aktif", () => {
    const db = openDb(":memory:");
    expect(db.query<{ foreign_keys: number }, []>("PRAGMA foreign_keys").get()?.foreign_keys).toBe(1);
  });

  test("CHECK role menolak 'owner'", () => {
    const db = seed();
    expect(() =>
      db.run("INSERT INTO room_members (room_id, user_id, role) VALUES ('r1', 'u1', 'owner')"),
    ).toThrow(/CHECK/);
    db.run("INSERT INTO room_members (room_id, user_id, role) VALUES ('r1', 'u1', 'viewer')");
  });

  test("CHECK is_admin menolak nilai selain 0/1", () => {
    const db = seed();
    expect(() => db.run("INSERT INTO users (id, name, is_admin, created_at) VALUES ('x', 'X', 2, 1)")).toThrow(/CHECK/);
  });

  test("FK: member ke room tak dikenal ditolak; hapus room → member ikut terhapus", () => {
    const db = seed();
    expect(() =>
      db.run("INSERT INTO room_members (room_id, user_id, role) VALUES ('nope', 'u1', 'admin')"),
    ).toThrow(/FOREIGN KEY/);
    db.run("INSERT INTO room_members (room_id, user_id, role) VALUES ('r1', 'u1', 'admin')");
    db.run("DELETE FROM rooms WHERE id = 'r1'");
    expect(db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM room_members").get()?.n).toBe(0);
  });
});
