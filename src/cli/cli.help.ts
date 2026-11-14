/** Teks bantuan CLI (global + per perintah). Judul bagian ditandai `#` agar runCli bisa memberi warna. */

const DOCS_HINT = "Dokumentasi lengkap: zoomin --docs [usage|env|deploy|api|readme|list]";

const SERVE_OPTIONS = `# Options
  -p, --port <n>        Port listen (1-65535), menimpa PORT
  -H, --host <addr>     Interface listen, menimpa HOST
      --db <path>       Path file SQLite, menimpa DB_PATH
      --env-file <path> Muat variabel env dari file ini`;

export const GLOBAL_HELP = `zoomin - ruang meeting self-hosted di atas LiveKit

# Usage
  zoomin [command] [options]

# Commands
  serve           Jalankan server (default bila tanpa perintah)
  migrate         Terapkan migrasi SQLite lalu keluar
  check           Validasi konfigurasi tanpa menjalankan server
  healthcheck     Cek server lokal (GET /api/health), exit 0 sehat / 1 tidak (HEALTHCHECK Docker)
  user            Kelola akun darurat: list | promote <email> --role admin|user | unban <email>
  env             Cetak contoh file .env
  docs [topik]    Cetak dokumentasi (sama dengan --docs)
  help [command]  Bantuan umum atau per perintah

${SERVE_OPTIONS}
  -v, --version         Cetak versi
  -h, --help            Cetak bantuan ini
  -d, --docs [topik]    Cetak dokumentasi lengkap

# Examples
  zoomin                              Jalankan server dengan .env/env saat ini
  zoomin -p 8080 -H 127.0.0.1         Jalankan di 127.0.0.1:8080
  zoomin env > .env                   Buat file .env awal
  zoomin check --env-file /etc/zoomin/zoomin.env
  zoomin migrate --db ./data/zoomin.sqlite
  zoomin user promote ana@example.com --role admin
  zoomin serve --help                 Bantuan perintah serve

${DOCS_HINT}`;

/** Bantuan per perintah, kunci = nama perintah. */
export const COMMAND_HELP: Record<string, string> = {
  serve: `zoomin serve - jalankan server HTTP(S) app + API

# Usage
  zoomin [serve] [options]

${SERVE_OPTIONS}

# Examples
  zoomin serve -p 8080
  NODE_ENV=production zoomin serve --env-file /etc/zoomin/zoomin.env`,
  migrate: `zoomin migrate - terapkan migrasi SQLite yang belum jalan lalu keluar

# Usage
  zoomin migrate [--db <path>] [--env-file <path>]

${SERVE_OPTIONS}

# Examples
  zoomin migrate --db /var/lib/zoomin/zoomin.sqlite`,
  check: `zoomin check - validasi konfigurasi tanpa menjalankan server (exit 1 bila tidak valid)
Secret hanya ditampilkan sebagai "diset"/"kosong", nilainya tidak pernah dicetak.

# Usage
  zoomin check [options]

${SERVE_OPTIONS}

# Examples
  NODE_ENV=production zoomin check --env-file /etc/zoomin/zoomin.env`,
  healthcheck: `zoomin healthcheck - cek server lokal lewat GET /api/health (exit 0 sehat, 1 tidak sehat)
Dipakai HEALTHCHECK image Docker (tanpa curl). Port dari PORT/--port, https bila TLS_CERT_PATH diset.

# Usage
  zoomin healthcheck [-p <port>] [--env-file <path>]

# Examples
  zoomin healthcheck
  zoomin healthcheck -p 8080`,
  user: `zoomin user - kelola akun langsung di DB (jalan darurat, hanya di server)
Peran super_admin tidak bisa diatur di sini: selalu dari SUPER_ADMIN_EMAILS (disinkronkan saat login).

# Usage
  zoomin user list [--db <path>] [--env-file <path>]
  zoomin user promote <email> --role admin|user
  zoomin user unban <email>

# Options
      --role <peran>    Peran global baru untuk promote: admin atau user
      --db <path>       Path file SQLite, menimpa DB_PATH
      --env-file <path> Muat variabel env dari file ini

# Examples
  zoomin user list --env-file /etc/zoomin/zoomin.env
  zoomin user promote ana@example.com --role admin
  zoomin user promote ana@example.com --role user     Turunkan admin jadi user
  zoomin user unban budi@example.com`,
  env: `zoomin env - cetak contoh file .env (isi .env.example) ke stdout

# Usage
  zoomin env > .env`,
  docs: `zoomin docs - cetak dokumentasi lengkap ke stdout

# Usage
  zoomin docs [topik]
  zoomin --docs [topik]

# Topics
  usage   Panduan pakai CLI + quick start (default)
  env     Tabel variabel env
  deploy  Panduan deploy produksi
  api     Tabel endpoint API
  readme  README lengkap
  list    Daftar topik`,
  help: `zoomin help - tampilkan bantuan

# Usage
  zoomin help [command]
  zoomin <command> --help`,
};
