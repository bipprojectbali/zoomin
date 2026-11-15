# Bug app dari e2e

Ditemukan suite Playwright (`bun run test:e2e`). Test repro ditandai `test.fail()` + `// BUG(e2e): E2E-xx`;
begitu bug diperbaiki test itu jadi "unexpectedly passed" → hapus `test.fail()`.

## E2E-01 — Dialog yang dibuka ulang cepat tertutup overlay-nya sendiri (tidak bisa diklik) ✅ diperbaiki

- **Status:** ✅ diperbaiki di commit `28159c6`: overlay `z-40` (konten tetap di atasnya) + durasi animasi overlay
  dan konten disamakan. Regresi dijaga `e2e/dialog.spec.ts` (tanpa `test.fail()`).

- **Test:** `e2e/dialog.spec.ts` › "dialog konfirmasi Keluar dibuka ulang cepat tetap bisa diklik"
- **Dampak:** sedang. Konfirmasi Keluar (room) dan konfirmasi Logout tamu (lobby) tampil redup dan semua tombolnya
  tidak bisa diklik; hanya Escape yang menutupnya. Terjadi pada pemakaian wajar: klik Batal lalu langsung klik
  tombol pemicu lagi. Sempat bikin `lobby.spec.ts` & `session.spec.ts` flaky (timeout 60 dtk) sebelum test-nya
  menunggu animasi tutup selesai.
- **Langkah reproduksi:**
  1. Masuk room, klik `leave-room` → dialog "Keluar dari room?" muncul.
  2. Klik "Batal".
  3. 160-190 ms kemudian klik `leave-room` lagi.
  4. Dialog muncul tapi lebih gelap; klik "Keluar"/"Batal" tidak berpengaruh.
- **Ekspektasi:** dialog yang terbuka selalu berada di atas overlay dan bisa diklik.
- **Aktual:** `document.elementFromPoint` di tengah konten mengenai `[data-slot="alert-dialog-overlay"]`. Playwright:
  `<div data-state="open" data-slot="alert-dialog-overlay" …> intercepts pointer events`. Terukur stabil: jeda
  160-190 ms → macet di setiap percobaan; <150 ms klik mengenai overlay lama (tidak membuka); ≥200 ms normal.
- **Dugaan akar:** `src/web/components/ui/alert-dialog.tsx` (pola sama di `dialog.tsx`). Overlay dan konten adalah
  saudara di portal `body` dengan `z-50` yang sama, jadi urutan tumpuk ditentukan urutan DOM. Animasi keluar overlay
  (default tw-animate ±150 ms) lebih pendek daripada konten (`duration-200`). Dibuka ulang di jendela 150-200 ms:
  overlay lama sudah unmount, konten lama masih ter-mount (Radix Presence) lalu dipakai ulang, sedangkan overlay
  baru di-append **setelah** konten → overlay di atas konten. Arah perbaikan: konten z-index lebih tinggi dari
  overlay (mis. overlay `z-50`, konten `z-[51]`) atau samakan durasi animasi overlay & konten.
  `sheet.tsx` (panel peserta) diuji dengan cara sama dan **tidak** terdampak.
- **Bukti:** jalankan test tanpa `test.fail()` → pesan berisi daftar jeda yang macet (mis. `[160, 165, …, 195]`),
  trace & screenshot di `e2e/.artifacts/results/dialog-dialog-konfirmasi-*/` (folder artefak di-reset tiap run).

## E2E-02 — Tombol "Ke lobby" di halaman 404 membuka landing `/`, bukan lobby `/app` ✅ diperbaiki

- **Test:** `e2e/auth.spec.ts` › "404: route tak dikenal menampilkan halaman tidak ditemukan dengan jalan pulang"
  (kini test normal; `test.fail()` dihapus).
- **Dampak:** rendah. Sejak lobby pindah ke `/app` (A10), label "Ke lobby" (dan teks "kembali ke lobby") tidak
  sesuai tujuan: user login dibawa ke landing promosi dan harus klik CTA lagi.
- **Langkah reproduksi:** buka `/tidak/ada` → klik "Ke lobby".
- **Ekspektasi:** ke `/app` (tanpa sesi → `/login`).
- **Aktual (sebelum fix):** ke `/` (landing).
- **Fix:** `src/web/pages/NotFoundPage.tsx` — `<Link to="/app">`.
- **Dugaan akar:** `src/web/pages/NotFoundPage.tsx` masih `<Link to="/">` dari sebelum rute A10. Arah perbaikan:
  `to="/app"` (atau ganti label jadi "Ke beranda" bila landing memang tujuannya).

## E2E-03 — Room nonaktif/kadaluarsa: anggota melihat "Anda bukan anggota room ini" ✅ diperbaiki

- **Status:** ✅ diperbaiki: `joinErrorFor` memeriksa `err.code` lebih dulu; `room_inactive`/`room_expired`/
  `room_private` → pesan `errorMessage(err)` (teks `CODE_TEXT` di `src/web/error.message.ts`), kind `forbidden`
  (tanpa retry, log warn); baru setelah itu fallback per status HTTP. Unit test di `room.connection.test.ts`.
- **Test:** `e2e/room-access.spec.ts` › "nonaktif: anggota yang membuka /rooms/:id mendapat pesan room dinonaktifkan"
  (kini test normal; `test.fail()` dihapus).
- **Dampak:** sedang. Anggota sah room yang dinonaktifkan host (atau kadaluarsa) diberi tahu bahwa ia **bukan
  anggota**, tanpa petunjuk bahwa room hanya ditutup sementara / perlu diperpanjang. Menyesatkan dan memicu
  permintaan akses yang tidak perlu ke host.
- **Langkah reproduksi:** host menambahkan user X sebagai peserta → Pengaturan → Status → matikan "Room aktif" → X
  membuka `/rooms/:id` → Gabung.
- **Ekspektasi:** "Room ini sedang dinonaktifkan. Minta host room mengaktifkannya kembali." (`room_inactive`;
  analog `room_expired`), seperti `CODE_TEXT` di `src/web/error.message.ts`.
- **Aktual:** layar `room-status-screen`: "Tidak dapat bergabung ke room — Anda bukan anggota room ini".
- **Akar:** `src/web/room/room.connection.ts#joinErrorFor` memetakan `ApiRequestError` lewat `API_ERROR[err.status]`
  dulu, jadi setiap 403 dari `POST /api/rooms/:id/token` → `forbidden` "bukan anggota", mengabaikan `err.code`
  (`room_inactive`/`room_expired` yang ditambahkan RND/plan/06 R5). Arah perbaikan: cek `err.code` lebih dulu (kode
  room_inactive/room_expired → pesan `errorMessage(err)`, kind non-retry), baru fallback per status.

## E2E-04 — Enforcer room menutup room LiveKit milik instance lain yang berbagi server LiveKit ✅ diperbaiki

- **Status:** ✅ diperbaiki (R6 direvisi di `RND/plan/06-room-access.md`): `runEnforcerOnce` hanya menutup room live
  yang ADA di DB dan tidak `active`; room yang tidak dikenal DB dibiarkan (room yang dihapus sudah ditutup
  `deleteRoom` saat dihapus). Unit test `room.access.test.ts` membuktikan room live tak dikenal tidak ditutup.

- **Test terdampak (bukan `test.fail`, muncul sebagai gagal di test lain):** `e2e/room.spec.ts` › "toast: peserta lain
  bergabung…" dan `e2e/session.spec.ts` › "leave: keluar…": gagal di 2 dari 2 run penuh `bun run test:e2e`, host
  tiba-tiba di `room-status-screen` "Anda terputus dari room — Room sudah dihapus".
- **Dampak:** tinggi untuk e2e (suite merah ±60 dtk setelah server start); di luar e2e: dua instance zoomin (mis.
  `bun run dev` + produksi lokal, staging + prod) atau app lain yang memakai LiveKit yang sama saling menendang
  semua peserta tiap 60 dtk.
- **Akar:** `src/server/room.enforcer.ts#runEnforcerOnce` menutup **setiap** room live di LiveKit yang tidak ada di DB
  instance itu (`!row` → stale), sesuai R6 ("atau tidak ada"). Playwright menyalakan dua server (dev :3101 DB
  `zoomin.sqlite`, prod :3102 DB `zoomin-prod.sqlite`) dengan LiveKit dev yang sama; enforcer server prod tidak
  mengenal room project `chromium` → `deleteRoom` pada putaran pertama (60 dtk), dan sebaliknya.
- **Arah perbaikan (perlu keputusan orkestrator, menyentuh R6):** hanya tutup room yang ADA di DB dan non-active
  (room terhapus sudah ditutup `deleteRoom` saat dihapus), atau beri prefix/namespace nama room per instance; plus
  opsi env untuk mematikan enforcer di server e2e prod (`playwright.config.ts` `BASE_ENV`).

## E2E-05 — View "Gallery" menampilkan panggung kosong (tile kamera selebar 0 px)

- **Test:** `e2e/stage-view.spec.ts` › "view: Gallery menampilkan kamera semua orang (E2E-05)" (`test.fail()`).
- **Dampak:** tinggi untuk fitur S11. Memilih View → Gallery (desktop) mengosongkan area panggung: tile kamera ada di
  DOM (`people-gallery` › `stage-tile`) tapi tidak terlihat; Playwright: `toBeVisible` → "hidden".
- **Langkah reproduksi:** host + participant berkamera di room → host klik `view-menu` → "Gallery".
- **Ekspektasi:** semua kamera/avatar tiled memenuhi panggung. **Aktual:** panggung putih kosong.
- **Dugaan akar:** `PeopleGrid` (`src/web/stage/StageScenes.tsx`) berkelas `grid h-full …` tanpa `flex-1`/`w-full`, dirender
  langsung sebagai anak `div.flex.flex-row` di `Stage.tsx`. Sebagai flex item lebarnya mengikuti konten; kolom grid
  `minmax(…%, 1fr)` dan tile `w-full` tidak punya lebar intrinsik → lebar 0. `SpeakerView` tidak terdampak karena
  pembungkusnya `flex-1`. Arah perbaikan: tambah `min-w-0 flex-1` (atau `w-full`) di root `PeopleGrid`.
- **Bukti:** jalankan test tanpa `test.fail()` → `people-gallery` boundingBox width = 8 px (hanya padding `p-1`); screenshot
  `e2e/.artifacts/results/stage-view-view-Gallery-*/test-failed-1.png`.

## Catatan (bukan bug app, tidak di-`test.fail`)

- **Bentrok `data-testid="stage"`** (sudah beres): panel Fokus kini ber-id `focus-main`/`focus-strip`, jadi
  `data-testid="stage"` tunggal dan `stage()` di `fixtures.ts` cukup `getByTestId("stage")`.
- **Peserta yang keluar sangat cepat tidak memicu toast:** bila tamu keluar sebelum LiveKit menyiarkannya ke peserta
  lain (~<1 dtk setelah connect), admin tidak pernah menerima `ParticipantConnected`/`Disconnected`, jadi tak ada
  toast "bergabung"/"keluar". Perilaku LiveKit, wajar.
- **Server e2e mewarisi `.env` developer** (sudah beres di `playwright.config.ts`): `bunx --bun playwright` memuat
  `.env` ke proses Playwright, webServer mewarisinya → `PUBLIC_LIVEKIT_URL` produksi bocor ke server e2e dan semua
  join gagal "Server sedang bermasalah". Kini semua env config diset eksplisit + `bun --no-env-file`.
- **Menu Radix dibuka ulang saat masih animasi tutup diabaikan** (`screen-list`): klik pemicu ~200 ms setelah
  Escape tidak membuka menu. Kosmetik; test menunggu menu benar-benar tertutup.
- **Room private / public tanpa password lewat ID room** (`room-password.spec.ts`): non-anggota melihat pesan umum
  "Anda bukan anggota room ini", bukan teks `room_private`. `POST /api/rooms/:id/token` menjawab `forbidden` untuk
  keduanya (hanya `/join` yang membedakan `room_private`). Sesuai spec 08 (W5/W6 tidak mengatur kode token untuk
  private); bila ingin pesan privat yang spesifik, token route perlu `room_private` untuk room private.
