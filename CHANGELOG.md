# Changelog

Format mengikuti [Keep a Changelog](https://keepachangelog.com/). Versi mengikuti `version` di `package.json`.

## [Unreleased]

### Added

- **Single binary**: `bun run build:binary` (host) atau `bun run build:binary:all` (Linux x64/arm64, macOS
  arm64/x64, Windows x64) menghasilkan satu file `bin/zoomin-<os>-<arch>` berisi server, SPA, dan migrasi. Bisa
  dijalankan di mesin tanpa Bun maupun file repo; default mode produksi.
- Perintah `zoomin check` dan `zoomin migrate` untuk memvalidasi konfigurasi dan menerapkan migrasi tanpa start
  server.
- Saat server listen di semua interface, log start menampilkan `http://localhost:<port>/` (bukan `0.0.0.0`, yang
  membuat kamera/share layar/clipboard gagal) plus alamat LAN untuk perangkat lain.
- Proxy signaling LiveKit di `/livekit`: set `PUBLIC_LIVEKIT_URL=wss://<domain-app>/livekit` agar browser cukup
  menjangkau satu hostname (mis. lewat Cloudflare Tunnel), tanpa subdomain LiveKit. Media tetap langsung ke LiveKit.
- **Login dengan akun Google** (Better Auth) menggantikan login password admin. Akun Google mana pun bisa mendaftar;
  user baru hanya bisa masuk room yang mengundangnya.
- **Peran global** `user` / `admin` / `super_admin`. Super admin ditentukan oleh `SUPER_ADMIN_EMAILS` (disinkronkan
  setiap login); admin diangkat atau diturunkan oleh super admin. Hanya admin dan super admin yang bisa membuat room.
- **Halaman profil** `/settings`: ubah nama tampilan, pakai foto Google, lihat dan cabut sesi login di perangkat lain,
  hapus akun sendiri. Foto profil tampil di tile avatar dan daftar peserta.
- **Panel admin** `/admin`: cari akun, blokir (dengan alasan dan masa berlaku opsional; akun langsung dikeluarkan dari
  room yang sedang diikuti), buka blokir, cabut sesi, hapus akun, dan kelola room (hapus room).
- **Konsol developer** `/dev` (super admin): angkat/turunkan admin, kesehatan sistem (LiveKit, DB), audit log aksi
  admin, pembatasan domain email login, dan ringkasan konfigurasi tanpa secret.
- **Landing page** publik di `/` yang menonjolkan perbandingan beberapa layar sekaligus.
- Perintah darurat `zoomin user list`, `zoomin user promote <email> --role admin|user`, dan `zoomin user unban <email>`
  untuk mengelola akun langsung di server.
- Variabel env baru: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
  `SUPER_ADMIN_EMAILS`, `WEB_DIST_DIR` (opsional), dan `ZOOMIN_TEST_AUTH` (khusus test otomatis). Panduan membuat
  OAuth client Google ada di `.env.example` / `zoomin env`.
- **Room public / private.** Room public (default) bisa dimasuki siapa pun yang login dan memegang link undangan;
  room private hanya untuk anggota yang diundang lewat email, link undangan ditolak. Tipe bisa diubah kapan saja
  (public → private membuat link yang sudah dibagikan tidak berlaku lagi).
- **Undang anggota lewat email** (public maupun private) dengan peran `host`/`participant`/`viewer`. Email yang belum
  punya akun disimpan sebagai undangan tertunda dan otomatis jadi anggota saat orang itu login pertama kali dengan
  Google. Host bisa mengubah peran, mengeluarkan anggota (langsung terputus bila sedang di room), dan membatalkan
  undangan tertunda; host terakhir tidak bisa diturunkan atau dikeluarkan.
- **Dialog "Pengaturan room"** (dari menu ⋯ kartu room di lobby dan dari `/admin`) dengan tab Umum (judul, tipe),
  Anggota, Status, dan zona bahaya.
- **Aktifkan / nonaktifkan room.** Menonaktifkan room langsung memutus semua peserta; room nonaktif tidak bisa
  dimasuki sampai diaktifkan lagi. Data room (layout, anggota) tetap tersimpan.
- **Masa berlaku room** (default tanpa batas, maks 365 hari) saat membuat room atau dari tab Status, dengan tombol
  cepat +1 / +7 / +30 hari, "Tanpa batas", atau pilih tanggal. Room yang kadaluarsa ditutup otomatis (diperiksa tiap
  60 detik) dan aktif lagi begitu diperpanjang.
- **Host room bisa menghapus room** sendiri (konfirmasi dengan mengetik ID room); sebelumnya hanya admin.
- Kartu room menampilkan badge Private, status Nonaktif/Kadaluarsa (tombol Masuk dimatikan dengan alasan), dan tanggal
  berakhir.

### Changed

- **BREAKING:** lobby pindah dari `/` ke `/app`; `/` sekarang landing page (tetap tampil walau sudah login).
- **BREAKING:** peran room `admin` berganti nama menjadi **`host`** (termasuk pilihan peran di link undangan).
- **BREAKING:** tamu wajib masuk dengan Google sebelum menerima undangan; tidak ada lagi akun tamu yang cukup
  mengisi nama. Akun lama (admin password dan tamu) tidak dimigrasikan: room dan layout-nya tetap ada, tapi daftar
  anggota room lama kosong, jadi undang ulang peserta.
- Admin dan super admin yang membuka room tanpa undangan diperlakukan sebagai host.
- Panel `/admin` › Room: kolom Tipe dan Status baru, plus aksi "Pengaturan" yang membuka dialog pengaturan room.
- Tombol **Undang** di dalam room private membuka pengelolaan anggota (undang lewat email), bukan link undangan.
- `POST /api/rooms` menerima field opsional `visibility` dan `expiresAt`; `RoomSummary` bertambah `visibility`,
  `status`, `expiresAt`, `canManage`.
- **BREAKING (API):** field `active` (room sedang live di LiveKit) di `GET /api/admin/rooms` berganti nama menjadi
  `live`.

### Removed

- **BREAKING:** login password admin (`ADMIN_PASSWORD`, `POST /api/auth/admin-login`) dan `SESSION_SECRET` (diganti
  `BETTER_AUTH_SECRET`). Hapus keduanya dari env produksi.

### Security

- **BREAKING:** semua sesi lama dan semua link undangan lama tidak berlaku setelah upgrade (kunci tanda tangan baru);
  semua orang perlu login ulang dan undangan perlu dibuat ulang.
- Aksi admin (blokir, buka blokir, hapus akun, ubah peran, cabut sesi, hapus room, ubah setting) dicatat di audit log.
- Endpoint admin bawaan Better Auth tidak dibuka lewat HTTP; aturan siapa boleh mengelola siapa ditegakkan server
  (admin tidak bisa menyentuh admin lain atau super admin, tidak ada yang bisa mengelola akunnya sendiri).
- Login dibatasi rate limit Better Auth per IP. Jalur login khusus test (`ZOOMIN_TEST_AUTH`) selalu mati di production
  dan dibuktikan oleh test.

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
