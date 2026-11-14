-- 0005_room_password: room public ber-password (RND/plan/08-room-password.md, W1).
-- Kenapa: tipe API "password" = visibility 'public' + password_hash NOT NULL, tanpa mengubah CHECK visibility
-- (hindari rebuild tabel). NULL = tanpa password (perilaku lama). Hash Bun.password (argon2id), tidak pernah plaintext.
-- ALTER TABLE tidak punya IF NOT EXISTS di SQLite; runner schema_migrations menjamin migrasi ini hanya jalan sekali.
ALTER TABLE rooms ADD COLUMN password_hash TEXT;
