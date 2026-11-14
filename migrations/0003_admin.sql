-- 0003_admin: audit log aksi admin/dev (A8) + setting proyek (A9), RND/plan/05-auth-roles.md §Skema.
-- Idempotent (IF NOT EXISTS) walau runMigrations hanya menjalankannya sekali.

-- actor_id sengaja TANPA FK ke "user": jejak audit harus tetap ada setelah akun pelaku/target dihapus (hard delete),
-- karena itu email pelaku disalin ke actor_email saat aksi terjadi. detail_json = objek JSON bebas per aksi.
CREATE TABLE IF NOT EXISTS audit_log (
  id          TEXT PRIMARY KEY,
  at          INTEGER NOT NULL,
  actor_id    TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  action      TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id   TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}'
);

-- Daftar audit /dev: terbaru dulu (keyset at,id), opsional filter aksi atau pelaku.
CREATE INDEX IF NOT EXISTS audit_log_at_idx ON audit_log(at);
CREATE INDEX IF NOT EXISTS audit_log_action_at_idx ON audit_log(action, at);
CREATE INDEX IF NOT EXISTS audit_log_actor_at_idx ON audit_log(actor_id, at);

-- Key-value setting proyek; value_json = JSON (mis. allowed_email_domains = '["contoh.id"]', dibaca auth.better.ts
-- saat login). Tanpa baris = default. updated_by tanpa FK agar riwayat tidak hilang saat akun dihapus.
CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at INTEGER,
  updated_by TEXT
);
