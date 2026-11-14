-- 0001_init: schema awal (RND/plan/01-arsitektur.md §Model data). Semua IF NOT EXISTS agar aman dijalankan ulang.

-- users.id juga dipakai sebagai identity LiveKit, jadi harus stabil dan cocok SAFE_ID_PATTERN.
-- is_admin = admin global (login via ADMIN_PASSWORD, id 'admin'); role per room tetap di room_members.
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  is_admin    INTEGER NOT NULL DEFAULT 0 CHECK (is_admin IN (0,1)),
  created_at  INTEGER NOT NULL
);

-- rooms.id = nama room LiveKit. layout_json menyimpan salinan LayoutState terakhir untuk restore saat
-- room LiveKit dibuat ulang; layout_version dipakai compare-and-set tulis layout (cegah last-write-wins).
CREATE TABLE IF NOT EXISTS rooms (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  created_by      TEXT NOT NULL REFERENCES users(id),
  layout_json     TEXT,
  layout_version  INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL
);

-- Role per room adalah sumber kebenaran grant token; CHECK menolak role asing di level DB.
CREATE TABLE IF NOT EXISTS room_members (
  room_id  TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role     TEXT NOT NULL CHECK (role IN ('admin','participant','viewer')),
  PRIMARY KEY (room_id, user_id)
);

-- PK (room_id, user_id) tidak membantu query "room milik user X" (daftar room di lobby).
CREATE INDEX IF NOT EXISTS room_members_user_id_idx ON room_members(user_id);
