-- 0002_auth: login Google via Better Auth + peran global (RND/plan/05-auth-roles.md A1, A3, A13).
-- Skema tabel Better Auth disalin dari `getMigrations(...).compileMigrations()` better-auth 1.7.23 (adapter Kysely
-- built-in untuk bun:sqlite) dengan plugin admin; JANGAN ubah nama tabel/kolom tanpa mengecek versi Better Auth.
-- Tanggal = TEXT ISO-8601 (adapter SQLite Better Auth menyimpan Date sebagai string), boolean = INTEGER 0/1.
-- Semua langkah aman diulang (IF NOT EXISTS / IF EXISTS, salin-ulang tabel) walau runMigrations hanya menjalankannya sekali.

CREATE TABLE IF NOT EXISTS "user" (
  "id"            TEXT NOT NULL PRIMARY KEY,
  "name"          TEXT NOT NULL,
  "email"         TEXT NOT NULL UNIQUE,
  "emailVerified" INTEGER NOT NULL,
  "image"         TEXT,
  "createdAt"     DATE NOT NULL,
  "updatedAt"     DATE NOT NULL,
  -- Kolom plugin admin: role global user|admin|super_admin (A3), ban (A6).
  "role"          TEXT,
  "banned"        INTEGER,
  "banReason"     TEXT,
  "banExpires"    DATE
);

CREATE TABLE IF NOT EXISTS "session" (
  "id"             TEXT NOT NULL PRIMARY KEY,
  "expiresAt"      DATE NOT NULL,
  "token"          TEXT NOT NULL UNIQUE,
  "createdAt"      DATE NOT NULL,
  "updatedAt"      DATE NOT NULL,
  "ipAddress"      TEXT,
  "userAgent"      TEXT,
  "userId"         TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "impersonatedBy" TEXT
);

CREATE TABLE IF NOT EXISTS "account" (
  "id"                    TEXT NOT NULL PRIMARY KEY,
  "accountId"             TEXT NOT NULL,
  "providerId"            TEXT NOT NULL,
  "userId"                TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "accessToken"           TEXT,
  "refreshToken"          TEXT,
  "idToken"               TEXT,
  "accessTokenExpiresAt"  DATE,
  "refreshTokenExpiresAt" DATE,
  "scope"                 TEXT,
  "password"              TEXT,
  "createdAt"             DATE NOT NULL,
  "updatedAt"             DATE NOT NULL
);

CREATE TABLE IF NOT EXISTS "verification" (
  "id"         TEXT NOT NULL PRIMARY KEY,
  "identifier" TEXT NOT NULL,
  "value"      TEXT NOT NULL,
  "expiresAt"  DATE NOT NULL,
  "createdAt"  DATE NOT NULL,
  "updatedAt"  DATE NOT NULL
);

CREATE INDEX IF NOT EXISTS "session_userId_idx" ON "session" ("userId");
CREATE INDEX IF NOT EXISTS "account_userId_idx" ON "account" ("userId");
CREATE INDEX IF NOT EXISTS "verification_identifier_idx" ON "verification" ("identifier");

-- SQLite tidak bisa ALTER FK/CHECK → rebuild rooms & room_members (buat baru, salin, drop lama, rename).
-- Urutan penting karena foreign_keys=ON: room_members_new merujuk rooms_new (bukan rooms lama), jadi DROP rooms lama
-- tidak memicu cascade ke data baru; RENAME rooms_new → rooms memperbarui referensi FK di room_members_new otomatis.
-- created_by kini nullable + ON DELETE SET NULL: room tetap ada saat akun pembuatnya dihapus (hard delete, A6).
CREATE TABLE IF NOT EXISTS rooms_new (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  created_by      TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  layout_json     TEXT,
  layout_version  INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL
);

-- A13: user lama (tabel users, tamu tanpa akun) tidak dimigrasikan → created_by yang tidak ada di "user" jadi NULL.
INSERT OR REPLACE INTO rooms_new (id, title, created_by, layout_json, layout_version, created_at)
  SELECT id, title, CASE WHEN created_by IN (SELECT id FROM "user") THEN created_by END, layout_json, layout_version, created_at
  FROM rooms;

-- Peran room: `host` menggantikan `admin` (A3).
CREATE TABLE IF NOT EXISTS room_members_new (
  room_id  TEXT NOT NULL REFERENCES rooms_new(id) ON DELETE CASCADE,
  user_id  TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  role     TEXT NOT NULL CHECK (role IN ('host','participant','viewer')),
  PRIMARY KEY (room_id, user_id)
);

-- Hanya member yang akunnya ada di "user" yang bisa disalin (FK); data `admin` → `host`.
INSERT OR REPLACE INTO room_members_new (room_id, user_id, role)
  SELECT room_id, user_id, CASE role WHEN 'admin' THEN 'host' ELSE role END
  FROM room_members
  WHERE user_id IN (SELECT id FROM "user") AND room_id IN (SELECT id FROM rooms_new);

DROP TABLE IF EXISTS room_members;
DROP TABLE IF EXISTS rooms;
-- Tabel user lama (login ADMIN_PASSWORD + tamu) diganti tabel "user" Better Auth.
DROP TABLE IF EXISTS users;
ALTER TABLE rooms_new RENAME TO rooms;
ALTER TABLE room_members_new RENAME TO room_members;

-- PK (room_id, user_id) tidak membantu query "room milik user X" (daftar room di lobby).
CREATE INDEX IF NOT EXISTS room_members_user_id_idx ON room_members(user_id);
