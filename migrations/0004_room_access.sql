-- 0004_room_access: mode public/private, aktif/nonaktif, dan kadaluarsa room + undangan email pending
-- (RND/plan/06-room-access.md). Default = perilaku lama: public, aktif (disabled_at NULL), tanpa batas (expires_at NULL).
-- ALTER TABLE tidak punya IF NOT EXISTS di SQLite; runner schema_migrations menjamin migrasi ini hanya jalan sekali.
ALTER TABLE rooms ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','private'));
ALTER TABLE rooms ADD COLUMN disabled_at INTEGER;
ALTER TABLE rooms ADD COLUMN expires_at INTEGER;

-- Undangan via email untuk orang yang belum punya akun (R2); diklaim lalu dihapus saat user dengan email itu login.
CREATE TABLE IF NOT EXISTS room_invitations (
  room_id    TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  email      TEXT NOT NULL,              -- lowercase
  role       TEXT NOT NULL CHECK (role IN ('host','participant','viewer')),
  invited_by TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (room_id, email)
);
CREATE INDEX IF NOT EXISTS idx_room_invitations_email ON room_invitations(email);
