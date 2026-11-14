# 03 — Milestone

Aturan berlaku untuk semua milestone. Tiap milestone dikerjakan di branch `feature/m<N>-<nama>`. Milestone
dianggap selesai bila `bun test` dan `bun run typecheck` hijau dan semua kriteria selesai tercentang. Merge
hanya atas persetujuan user. Test integrasi memakai LiveKit dev server lokal (`--dev`, kredensial test-only),
bukan server produksi. Kerja paralel: tiap worker memegang file yang tercantum dan dilarang menyentuh file
worker lain. Worker tidak boleh commit, push, atau ganti branch.

---

## M0 — Bukti browser + kapasitas (tanpa kode produk)

**Scope:** jalankan checklist `../spike/06-browser-manual.md` dan ukur kapasitas server di hardware target.

**Kriteria selesai (bisa diuji):**
- Checklist 06 langkah 1–12 terisi ✅/❌ di Chrome. Matriks browser terisi minimal untuk Chrome, Edge,
  Firefox, dan Safari (langkah 5–9).
- Tabel "Yang perlu dicatat" (06) terisi: CPU publisher untuk 1/2/3 layar + kamera, CPU penonton, resolusi
  diterima, dan delay kasar layar/kamera.
- Satu percobaan 4 layar atau lebih dari satu klien Chrome. Sejauh ini baru 3 layar yang terbukti
  (`../spike/02-research.md` §1).
- [x] Load test lokal sudah dilakukan (`lk` v2.19.4, binary `RND/spike/.bin/lk`; hasil di `RND/spike/07-load-test.md`):
  8×20 loss 0%, 12×24 0.08%, 16×30 5–7.5%, semua di satu M1 laptop.
- `lk load-test` dari mesin terpisah ke server produksi (100.64.0.8, config YAML, bukan `--dev`). Hasilnya: jumlah
  publisher/subscriber/track video yang masih tahan sebelum loss > 1% atau CPU server ~80%, ditambahkan ke `07`.
  Bila hardware produksi belum siap di M0, kriteria ini pindah ke M4.
- Uji decode di browser penonton: 8–16 screen share ke 2–3 perangkat kelas rendah, catat CPU decode dan frame drop
  (`07` §Rekomendasi 4).
- Keputusan "go/no-go multi share di browser" ditulis di `00-ringkasan.md`.

**Test wajib:** tidak ada test baru. Spike tetap 56 pass.

**Paralelisasi:**
- User: uji browser manual. Butuh manusia untuk picker dan izin OS.
- `wkr-loadtest-01`: memegang `RND/spike/07-load-test.md` dan skrip load test di `RND/spike/loadtest/`.

**Gerbang:** bila multi share di browser ❌, berhenti dan evaluasi ulang sebelum M2.

---

## M1 — Room, join, kamera + mic

**Status:** diimplementasikan di `feature/m1-m3-core`, uji browser manual belum.

**Scope:** fondasi repo (`02-stack.md`), migrasi SQLite, auth (metode menurut K2), buat/daftar room, keanggotaan
+ role, token dari sesi, halaman room dengan kamera dan mic, grid sederhana untuk semua track, viewer tanpa
kontrol publish, dan HTTPS lokal untuk uji dari device lain. HTTPS lokal: opsional lewat `TLS_CERT_PATH` + `TLS_KEY_PATH` (README §HTTPS lokal), uji dari device lain belum.

**Kriteria selesai:**
- Dua user login, join room yang sama, saling melihat kamera dan mendengar mic. Diuji manual di 2 browser.
- Viewer tidak melihat tombol kamera/mic/layar. Bila dipaksa publish, server menolak (timeout, `03`).
  Penolakan server terbukti di `test/join.integration.test.ts`; UI tersembunyi belum dicek di browser.
- [x] Token yang diterbitkan **tidak** berisi `roomAdmin` untuk role apa pun.
- [x] Server production gagal start bila `LIVEKIT_API_KEY`/`SECRET` tidak diset.
- [x] Versi React, React Router, Tailwind, dan shadcn sudah diverifikasi dan dicatat di `02-stack.md`.

**Test wajib (`bun test`):**
- `token.service.test.ts`: grant per role. Assert eksplisit `roomAdmin` undefined untuk admin. Viewer punya
  `canPublish=false`. TTL dan metadata role. Input invalid ditolak.
- `token.route.test.ts`: tanpa sesi → 401. Bukan anggota → 403. Role diambil dari DB walaupun body mengirim
  `role`. Body invalid → 400 (bukan 422).
- `db.test.ts`: migrasi idempotent (jalan 2x tanpa error). Constraint `role` CHECK menolak nilai asing.
  Pakai DB `:memory:`.
- `rooms.route.test.ts`: list room ter-paginate (`limit`/`cursor`, aturan global Rule 13). Create room dengan
  id invalid → 400.
- `join.integration.test.ts` (rtc-node): participant dengan token dari endpoint bisa publish `camera` + `mic`,
  dan viewer tidak bisa.
- `config.test.ts`: production tanpa secret → throw.

**Paralelisasi:**
- `wkr-m1-server`: `src/server/{main,config,db,token.service,token.route,rooms.route}.ts`, `migrations/`, plus
  test terkait.
- `wkr-m1-auth`: `src/server/auth.*.ts` + test. Mulai setelah K2 diputuskan.
- `wkr-m1-web`: `src/web/**`, kecuali `components/ui/` yang di-generate oleh worker yang sama.
- Kontrak API (`src/shared/api.types.ts`) ditulis orkestrator **sebelum** worker diluncurkan. Isinya tipe saja.

---

## M2 — Multi screen share

**Status:** diimplementasikan di `feature/m1-m3-core`, uji browser manual belum.

**Scope:** tombol "Tambah layar" (getDisplayMedia berulang + `publishTrack`), konvensi nama track
`screen-<n>`/`screen-<n>-audio` di `src/shared/track.naming.ts`, encoding VP8 + simulcast (`h1080fps15`, lalu
`h720fps15` untuk share berikutnya, layer `h360fps3`, contentHint), stop per layar, event `ended`, adaptiveStream
+ dynacast, dan pesan error picker yang dibatalkan.

**Kriteria selesai:**
- Checklist `06` langkah 5–12 lulus di aplikasi produk, bukan halaman spike.
- 3 layar + kamera dari satu peserta dan A vs B dari dua peserta tampil bersamaan di penonton.
- Tile kecil menerima layer rendah. Dicek lewat label resolusi atau stats WebRTC.
- [x] Nomor layar tidak dipakai ulang dalam satu koneksi (`screen.publisher.test.ts`, `track.naming.test.ts`).

**Test wajib:**
- `track.naming.test.ts`: generator nama monoton, parser `screen-<n>` ↔ `screen-<n>-audio`, dan nama asing
  ditolak.
- `screen.encoding.test.ts`: fungsi pemilih opsi publish (share ke-1 vs ke-n) mengembalikan codec `vp8`,
  `simulcast: true`, dan layer yang diharapkan.
- `multishare.integration.test.ts`: port dari spike `multishare.test.ts`, memakai token dari endpoint produk dan
  nama dari `track.naming.ts`.

**Paralelisasi:**
- `wkr-m2-shared`: `src/shared/track.naming.ts`, `src/web/room/screen.encoding.ts` + test. Gelombang 1.
- `wkr-m2-web`: `src/web/room/screen.publisher.ts`, komponen kontrol layar. Gelombang 2, memakai hasil
  gelombang 1.
- `wkr-m2-it`: `test/multishare.integration.test.ts`, paralel dengan gelombang 2.

---

## M3 — Layout admin + template

**Status:** diimplementasikan di `feature/m1-m3-core`, uji browser manual belum.

**Scope:** render `LayoutState` (side-by-side, grid, focus), admin drag-drop tukar slot (`@dnd-kit/react`),
resize (`react-resizable-panels`), endpoint `PUT /api/rooms/:id/layout` dengan cek admin + `parseLayout` + CAS
SQLite + `updateRoomMetadata`, restore layout saat room dibuat ulang, dan slot kosong untuk track yang tidak
ada.

**Kriteria selesai:**
- Admin mengubah template, men-swap slot, dan me-resize. Semua penonton (termasuk yang join belakangan)
  melihat hasil yang sama. Sinkron ke semua klien dan late joiner terbukti di
  `test/layout-sync.integration.test.ts`; interaksi UI belum dicek di browser.
- [x] Non-admin yang memanggil endpoint → 403. Layout invalid → 400 dengan path field. `baseVersion` usang → 409.
- [x] Tidak ada token browser yang bisa menulis metadata (Twirp → 401, pola test `05`).
- Kirim layout hanya saat drop/mouseup, bukan per frame drag.

**Test wajib:**
- `layout.model.test.ts`: port 113 baris dari spike `layout.test.ts`, ditambah validasi field ukuran panel
  baru (jumlah sama dengan panel, total 100, angka finite).
- `layout.service.test.ts`: CAS. Dua tulis dengan `baseVersion` sama → satu sukses dan satu 409.
  `layout_json` tersimpan. `updateRoomMetadata` dipanggil dengan JSON yang lolos `parseLayout`.
- `layout.route.test.ts`: 401/403/400/409/200.
- `layout-sync.integration.test.ts`: port dari spike. Late joiner dapat layout. Token participant dan admin
  yang memanggil Twirp `UpdateRoomMetadata` → 401. Ini membuktikan `roomAdmin` sudah hilang.

**Paralelisasi:**
- `wkr-m3-model`: `src/shared/layout.model.ts` + test. Gelombang 1, karena kontrak dipakai semua pihak.
- `wkr-m3-server`: `src/server/layout.service.ts`, `layout.route.ts` + test. Gelombang 2.
- `wkr-m3-stage`: `src/web/stage/**`, untuk render dan template. Gelombang 2.
- `wkr-m3-admin`: `src/web/stage/admin/**`, untuk drag dan resize. Gelombang 2.
  **Realisasi:** digabung ke `wkr-m3-stage`; kode edit ada di `src/web/stage/` (`stage.edit.ts`, `Stage.tsx`,
  `StageToolbar.tsx`), bukan `stage/admin/`.

---

## M4 — Deploy produksi (100.64.0.8 / subdomain)

**Scope:** binary Linux resmi atau Docker livekit-server 1.13.11 dengan `livekit.yaml` (bukan `--dev`), Caddy
TLS, TURN bawaan (TLS 443), UDP 50000–60000, TCP 7881, `use_external_ip` sesuai jaringan, app sebagai service
systemd, file SQLite + backup, secret di env (`../spike/01-livekit-server.md` §Deploy). Model akses dari
internet mengikuti keputusan K1.

**Kriteria selesai:**
- Checklist pre-deploy (aturan global Rule 6) dan laporan pre-push (Rule 18) tampil ✅ semua.
- `CHANGELOG.md` berisi entry versi yang dideploy.
- Dari jaringan luar (HP via data seluler, laptop di jaringan lain): login, join, kamera/mic, dan 2 layar
  berjalan.
- Dari jaringan yang memblokir UDP: media lewat TURN/TLS 443.
- Load test produksi dan uji decode browser (kriteria M0) sudah tercatat di `07`, bila belum selesai di M0.
- Rollback terdokumentasi: versi binary sebelumnya dan backup SQLite.

**Test wajib:** suite `bun test` hijau di CI/lokal dan smoke test `bun test test/smoke.prod.test.ts` (env
`SMOKE_URL`): `/` 200 lewat HTTPS dan token endpoint menolak request tanpa sesi.

**Paralelisasi:** `wkr-m4-infra` memegang `deploy/**` (livekit.yaml template tanpa secret, Caddyfile, unit
systemd). `wkr-m4-docs` memegang `CHANGELOG.md` + bagian deploy di README, dikerjakan sekali di akhir.

---

## M5 — Desktop (opsional, ditunda)

**Scope:** spike terlebih dulu, bukan produk. Buktikan getDisplayMedia multi-layar di Electrobun 2.0.6 (CEF
Alloy, tanpa picker, CEF #3667) **atau** di Electron (`setDisplayMediaRequestHandler`), dengan picker native
sendiri (`../spike/02-research.md` §7).

**Kriteria selesai:** dokumen spike `RND/spike/08-desktop.md` + test yang mem-publish 2 layar dari app desktop
ke room lokal. Atau kesimpulan ❌ yang beralasan, lalu tetap web-only.

**Paralelisasi:** dua worker paralel, `wkr-m5-electrobun` (`RND/spike/desktop-electrobun/**`) dan
`wkr-m5-electron` (`RND/spike/desktop-electron/**`). Hasilnya dibandingkan.
