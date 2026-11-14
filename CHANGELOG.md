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
