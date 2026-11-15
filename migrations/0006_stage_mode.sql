-- 0006_stage_mode: kebijakan panggung per room (RND/plan/11-stage-control.md S1).
-- Kenapa: host = hanya pengelola mengubah layout (perilaku lama), request = participant meminta tampil lewat
-- persetujuan pengelola, open = participant ikut mengedit. DEFAULT 'host' = room lama tetap berperilaku seperti dulu.
-- ALTER TABLE tidak punya IF NOT EXISTS di SQLite; runner schema_migrations menjamin migrasi ini hanya jalan sekali.
ALTER TABLE rooms ADD COLUMN stage_mode TEXT NOT NULL DEFAULT 'host' CHECK (stage_mode IN ('host', 'request', 'open'));
