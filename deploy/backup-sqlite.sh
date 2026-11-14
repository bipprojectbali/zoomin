#!/usr/bin/env bash
# Backup online SQLite zoomin (aman saat app jalan, WAL) memakai `.backup`, cek integritas, simpan N terbaru.
# Pakai: backup-sqlite.sh [DB_PATH] [BACKUP_DIR] [KEEP]. Butuh paket sqlite3. Jalankan sebagai user zoomin.
set -euo pipefail

DB_PATH="${1:-${DB_PATH:-/var/lib/zoomin/zoomin.sqlite}}"
BACKUP_DIR="${2:-${BACKUP_DIR:-/var/backups/zoomin}}"
KEEP="${3:-${BACKUP_KEEP:-14}}"

[[ -f "$DB_PATH" ]] || { echo "backup-sqlite: DB tidak ditemukan: $DB_PATH" >&2; exit 1; }
[[ "$KEEP" =~ ^[1-9][0-9]*$ ]] || { echo "backup-sqlite: KEEP harus bilangan >= 1 (dapat: $KEEP)" >&2; exit 1; }

umask 077
mkdir -p "$BACKUP_DIR"
out="$BACKUP_DIR/zoomin-$(date -u +%Y%m%dT%H%M%SZ).sqlite"
tmp="$out.partial"
trap 'rm -f "$tmp"' EXIT

sqlite3 "$DB_PATH" ".timeout 5000" ".backup '$tmp'"
result="$(sqlite3 "$tmp" "PRAGMA integrity_check;")"
[[ "$result" == "ok" ]] || { echo "backup-sqlite: integrity_check gagal untuk $tmp: $result" >&2; exit 1; }
mv "$tmp" "$out"
echo "backup-sqlite: $out"

# Rotasi: hapus semua kecuali KEEP file terbaru (nama berisi timestamp UTC, jadi urut nama = urut waktu).
ls -1 "$BACKUP_DIR"/zoomin-*.sqlite | sort -r | tail -n +"$((KEEP + 1))" | while read -r old; do
  rm -f -- "$old"
  echo "backup-sqlite: hapus $old"
done
