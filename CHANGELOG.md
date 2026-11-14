# Changelog

The format follows [Keep a Changelog](https://keepachangelog.com/). Versions follow `version` in `package.json`.

## [Unreleased]

### Added

- **Docker image + GHCR**: pushes to `main` (and `v*` tags) run the tests and then publish
  `ghcr.io/bipprojectbali/zoomin` (`latest`, `sha-<commit>`, version). Deploy it as a Portainer stack from
  `compose.yml` (Traefik, `zoomin.wibudev.com`, SQLite data in a volume); roll back by changing `ZOOMIN_TAG`. Guide in
  `deploy/README.md`.
- `zoomin healthcheck` command: checks `/api/health` on the local server and exits 0/1 (used by the container
  healthcheck).
- Favicon, app icons (apple-touch-icon, 192/512 icons + `site.webmanifest`), and an `og-image.png` preview image for
  shared links. Pages have SEO meta tags (description, Open Graph, Twitter card, canonical, theme-color); absolute URLs
  in them follow `PUBLIC_APP_URL`. `/robots.txt` allows the landing page and disallows private pages (`/app`,
  `/rooms`, `/invite`, `/admin`, `/dev`, `/settings`, `/api`); `/sitemap.xml` lists the landing page. Regenerate the
  icons with `bun scripts/build.icons.ts`.
- **Password-protected rooms**: besides Public and Private, a room can be of type Password. Anyone who knows the room
  ID or holds an invite link can join with the password and automatically becomes a member. The host can set, change,
  or remove the password at any time; existing members are not removed when the password changes. Passwords are
  stored as hashes and wrong attempts are limited to 5 per minute.
- When creating a room, an admin can invite people right away: registered accounts become members, unregistered
  emails become pending invitations. Everything is created at once; if one email is rejected (e.g. domain not
  allowed), the room is not created.
- Search for registered accounts (by name or email) when inviting people, available to admins and room hosts. Banned
  accounts are not listed.
- **Single binary**: `bun run build:binary` (host) or `bun run build:binary:all` (Linux x64/arm64, macOS arm64/x64,
  Windows x64) produces a single `bin/zoomin-<os>-<arch>` file containing the server, SPA, and migrations. It runs on
  machines without Bun or the repository files; production mode by default.
- `zoomin check` and `zoomin migrate` commands to validate the configuration and apply migrations without starting
  the server.
- When the server listens on all interfaces, the startup log shows `http://localhost:<port>/` (not `0.0.0.0`, which
  breaks camera, screen sharing, and clipboard) plus LAN addresses for other devices.
- LiveKit signaling proxy at `/livekit`: set `PUBLIC_LIVEKIT_URL=wss://<app-domain>/livekit` so browsers only need to
  reach one hostname (e.g. through a Cloudflare Tunnel), without a LiveKit subdomain. Media still goes directly to
  LiveKit.
- **Sign in with Google** (Better Auth) replaces the admin password login. Any Google account can register; new users
  can only join rooms they are invited to.
- **Global roles** `user` / `admin` / `super_admin`. Super admins are defined by `SUPER_ADMIN_EMAILS` (synced on
  every sign-in); admins are promoted or demoted by a super admin. Only admins and super admins can create rooms.
- **Profile page** `/settings`: change display name, use your Google photo, view and revoke sign-in sessions on other
  devices, delete your own account. The profile photo appears on avatar tiles and in the participant list.
- **Admin panel** `/admin`: search accounts, ban (with a reason and optional duration; the account is immediately
  removed from rooms it is in), unban, revoke sessions, delete accounts, and manage rooms (delete rooms).
- **Developer console** `/dev` (super admin): promote/demote admins, system health (LiveKit, DB), audit log of admin
  actions, sign-in email domain restrictions, and a configuration summary without secrets.
- Public **landing page** at `/` highlighting side-by-side sharing of multiple screens.
- Emergency commands `zoomin user list`, `zoomin user promote <email> --role admin|user`, and
  `zoomin user unban <email>` to manage accounts directly on the server.
- New env variables: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
  `SUPER_ADMIN_EMAILS`, `WEB_DIST_DIR` (optional), and `ZOOMIN_TEST_AUTH` (automated tests only). The guide for
  creating a Google OAuth client is in `.env.example` / `zoomin env`.
- **Public / private rooms.** Public rooms (default) can be joined by anyone signed in who holds an invite link;
  private rooms are only for members invited by email, and invite links are rejected. The type can be changed at any
  time (public → private invalidates links that were already shared).
- **Invite members by email** (public and private rooms) with role `host`/`participant`/`viewer`. Emails without an
  account are stored as pending invitations and automatically become members when that person first signs in with
  Google. Hosts can change roles, remove members (disconnected immediately if in the room), and cancel pending
  invitations; the last host cannot be demoted or removed.
- **"Room settings" dialog** (from the ⋯ menu on lobby room cards and from `/admin`) with General (title, type),
  Members, Status, and danger zone tabs.
- **Activate / deactivate rooms.** Deactivating a room disconnects all participants immediately; an inactive room
  cannot be joined until it is reactivated. Room data (layout, members) is kept.
- **Room expiry** (no limit by default, max 365 days) when creating a room or from the Status tab, with quick buttons
  +1 / +7 / +30 days, "No limit", or a date picker. Expired rooms are closed automatically (checked every 60 seconds)
  and become active again once extended.
- **Room hosts can delete their own room** (confirmed by typing the room ID); previously only admins could.
- Room cards show a Private badge, Inactive/Expired status (the Join button is disabled with a reason), and the end
  date.

### Changed

- UI and README are now English only.
- The invite picker is now a searchable multi-select dropdown with a checkbox per account; manually typed emails stay
  saved as options. Account search works without a query (lists all accounts sorted by name) and returns up to 50
  results.
- **BREAKING:** the lobby moved from `/` to `/app`; `/` is now the landing page (shown even when signed in).
- **BREAKING:** the room role `admin` is renamed to **`host`** (including the role choice in invite links).
- **BREAKING:** guests must sign in with Google before accepting an invite; name-only guest accounts are gone. Old
  accounts (password admin and guests) are not migrated: rooms and their layouts remain, but old room member lists
  are empty, so re-invite participants.
- Admins and super admins who open a room without an invite are treated as host.
- `/admin` › Rooms: new Type and Status columns, plus a "Settings" action that opens the room settings dialog.
- The **Invite** button inside a private room opens member management (invite by email) instead of an invite link.
- `POST /api/rooms` accepts optional `visibility` and `expiresAt` fields; `RoomSummary` gains `visibility`, `status`,
  `expiresAt`, `canManage`.
- **BREAKING (API):** the `active` field (room currently live in LiveKit) in `GET /api/admin/rooms` is renamed to
  `live`.

### Removed

- **BREAKING:** admin password login (`ADMIN_PASSWORD`, `POST /api/auth/admin-login`) and `SESSION_SECRET` (replaced
  by `BETTER_AUTH_SECRET`). Remove both from the production env.

### Fixed

- `bun run build:binary -- --target <target>` failed ("Unknown option '--target'"), and `--outdir` was also used as
  the SPA build folder, so the binary embedded a stale `dist/web` (or failed if it did not exist).

### Security

- **BREAKING:** all existing sessions and invite links are invalid after upgrading (new signing key); everyone must
  sign in again and invites must be recreated.
- Admin actions (ban, unban, delete account, change role, revoke sessions, delete room, change settings) are recorded
  in the audit log.
- Better Auth's built-in admin endpoints are not exposed over HTTP; the rules on who may manage whom are enforced by
  the server (admins cannot touch other admins or super admins, nobody can manage their own account).
- Sign-in is rate limited per IP by Better Auth. The test-only login path (`ZOOMIN_TEST_AUTH`) is always disabled in
  production, and a test proves it.

## [0.1.0] - 2026-11-14

Rilis stabil pertama. Disiapkan 2026-11-14, **belum dideploy**; deploy menunggu perintah user (langkah di
`deploy/README.md`).

### Added

- Login admin dengan password dari env, lalu lobby berisi daftar room (ter-paginate) dan form buat room. ID room
  dibuat otomatis dari judul (bisa diubah di "Opsi lanjutan").
- Link undangan per room dan per peran (admin, participant, viewer) dengan masa berlaku (default 72 jam, maks
  720 jam). Link Admin diberi peringatan. Link bisa dibuat dari lobby maupun lewat tombol **Undang** di dalam room.
- Halaman undangan menampilkan judul room dan peran sebelum masuk. Bila browser sudah punya sesi, halaman memberi
  tahu Anda akan masuk sebagai siapa, plus tautan "Bukan Anda? Keluar".
- Layar **pre-join**: preview kamera, toggle mic/kamera, pilihan kamera/mic, meter mic, nama tamu, judul room dan
  peran. Pilihan perangkat diingat untuk kunjungan berikutnya.
- **Control bar** bawah dengan tinggi tetap: Mikrofon dan Kamera (merah saat mati, menu ganti mic, speaker, atau
  kamera), Layar
  (jumlah layar aktif + daftar), Peserta, Undang, dan **Keluar** merah dengan konfirmasi. Shortcut ⌘/Ctrl+D (mic)
  dan ⌘/Ctrl+E (kamera). Di layar sempit tombol sekunder masuk menu "Lainnya".
- **Daftar peserta**: nama, peran, penanda "(Anda)", status mic, jumlah layar, dan kualitas koneksi. Penonton ikut
  tercantum.
- **Toast** saat peserta bergabung/keluar dan saat layar mulai dibagikan.
- **Banner koneksi**: begitu jaringan putus muncul banner "menyambung ulang" dengan lama waktu, kontrol publish
  dinonaktifkan, lalu layar "Anda terputus" dengan tombol Sambung ulang / Ke lobby bila gagal sekitar 45 detik.
- Sesi ganda (room yang sama dibuka di tab/perangkat lain) ditangani dengan pilihan **Pakai di tab ini**.
- "Tambah layar": satu peserta bisa membagikan beberapa layar sekaligus, termasuk audio layar di Chromium. Tiap
  layar bisa dihentikan sendiri.
- Panggung dengan template side-by-side (maks 3 kolom, lalu turun baris), grid, dan focus. Admin room bisa menukar
  slot dengan drag-drop, me-resize panel, memfokuskan satu tile untuk semua orang, dan **menghapus slot** dari
  layout. Semua penonton, termasuk yang join belakangan, melihat layout yang sama.
- **Perbesar** dan **Layar penuh** per tile, hanya untuk tampilan Anda sendiri (penonton juga bisa).
- Indikator mic mati dan sedang bicara di tile. **Tile avatar** untuk peserta tanpa kamera, skeleton saat video
  memuat. Kamera sendiri di-mirror dan diberi label "(Anda)".
- Layar yang Anda bagikan sendiri tampil sebagai pemberitahuan "Anda sedang membagikan layar", bukan video cermin
  tak berujung.
- Layout tersimpan dan dipulihkan saat room dibuka ulang. Perubahan bersamaan dari dua admin tidak saling
  menimpa diam-diam (konflik ditolak).
- Halaman 404, halaman "Room tidak ditemukan", dan layar "Anda telah keluar" dengan opsi gabung lagi.
- Build produksi `bun run build`: aset diperkecil dan dipecah, halaman login/lobby jauh lebih ringan (130 KB gzip).
- Artefak deploy satu server di `deploy/`: konfigurasi Caddy (TLS + header keamanan + CSP), LiveKit dengan TURN/TLS
  di port 443, unit systemd, backup SQLite harian, langkah rollback, dan smoke test produksi.
- Opsi `HOST` (interface listen) dan `TRUST_PROXY` (IP klien dari reverse proxy), serta HTTPS lokal opsional lewat
  `TLS_CERT_PATH`/`TLS_KEY_PATH` untuk uji dari perangkat lain.

### Changed

- Semua pesan error tampil dalam bahasa Indonesia dengan langkah selanjutnya (password salah, ID room sudah dipakai,
  link kedaluwarsa, izin kamera ditolak, kamera dipakai aplikasi lain, dan sebagainya).
- Label konsisten: "Keluar akun" di lobby, "Keluar" di room, "Ke lobby" untuk kembali, "Layar N" di semua tempat.
- Halaman login menampilkan nama app dan petunjuk untuk tamu (butuh link undangan).
- Tombol aksi tile muncul saat hover/fokus agar tidak menutupi isi layar; tile yang difokuskan diberi badge.
- Saat ada layar dibagikan, kamera otomatis pindah ke strip kecil agar layar mendapat ruang terbesar.

### Fixed

- Validasi ID room di browser tidak pernah berjalan.
- Alamat tak dikenal menampilkan halaman kosong.
- Setelah koneksi terputus, kontrol publish dan layout masih bisa diklik.
- Dialog konfirmasi yang dibuka ulang cepat tidak bisa diklik.
- Slot layout milik peserta yang keluar menampilkan ID internal; sekarang nama terakhirnya dipertahankan, dan fokus
  pada slot mati jatuh ke slot aktif.

### Security

- Login admin dibatasi 5 percobaan gagal per IP per 15 menit; penerimaan undangan dibatasi 200 per jam per IP.
  Pesan menampilkan berapa lama harus menunggu.
- Kontras warna tombol merah (Keluar, mic/kamera mati) memenuhi WCAG AA di tema terang dan gelap.
- Di produksi: header keamanan dan CSP ketat dari Caddy (uji: 0 pelanggaran), port internal app dan LiveKit
  ditutup firewall (app bisa listen di `127.0.0.1` lewat `HOST`), sourcemap tidak disajikan, link undangan bertoken tidak bocor lewat Referer.
- Token browser tidak bisa menulis metadata room; peran selalu diambil dari database, bukan dari request.
