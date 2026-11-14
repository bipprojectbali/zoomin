# 02 — Recheck UX/QA setelah gelombang perbaikan (branch `feature/prod-ready`)

Auditor: `wkr-c-qa` · Tanggal: 2026-11-14 · Basis: audit `01-ux-audit.md` (UX-01..31, BUG-01..03).
Screenshot: `RND/qa/screens2/`. Kode tidak diubah.

## Metode & lingkungan

- **Mode produksi**: `NODE_ENV=production bun src/server/main.ts` di `127.0.0.1:3601`, DB `/tmp/zm-qa2.sqlite` (sudah dihapus),
  LiveKit dev `ws://127.0.0.1:7880`. Tidak ada overlay dev Bun.
- **ego-browser** (Chromium nyata, profil pengguna): login, lobby, buat room, validasi ID, undangan, pre-join admin. Prompt izin
  kamera asli muncul dan tidak bisa diotomasi, sehingga alur media diuji di Playwright.
- **Playwright** (Chromium 1255 headless, `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`): 3 peran di
  context terpisah (admin desktop, peserta desktop, penonton 390 px), 2–3 layar + 2 kamera, layout, reconnect (`setOffline`),
  sesi ganda, error page, rate limit, izin ditolak (stub `NotAllowedError`/`NotReadableError`), tema terang/gelap,
  360/390/768/1280 px, keyboard, aria snapshot, CLS, kontras token.
- **CSP**: proxy lokal `:3602` menambahkan header persis dari `deploy/Caddyfile.example` (`connect-src` diarahkan ke
  `ws://127.0.0.1:7880 http://127.0.0.1:7880`) di depan app. Catatan: `page.route` Playwright pada dokumen ternyata merusak
  koneksi LiveKit (artefak alat, bukan bug app), jadi tidak dipakai.

### Angka produksi

| Item | Hasil |
|---|---|
| Waktu start server sampai `/api/health` 200 | **0,33 dtk**; request `/` pertama (bundling HTML) 0,25 dtk |
| Bundle JS | `chunk-*.js` **1.377.067 B** (gzip -9: **402.907 B**), 155 baris → **minified**, satu chunk tanpa code-splitting |
| Bundle CSS | `chunk-*.css` **85.739 B** (gzip 12.554 B), 1 baris → minified, Tailwind v4.1.14 |
| Cache | chunk: `Cache-Control: public, max-age=31536000, immutable` + ETag; `index.html`: `no-cache` ✅ |
| Kompresi | Bun tidak mengompres; `encode zstd gzip` di Caddy menanganinya ✅ |
| CLS | lobby **0,000**, room setelah join **0,000** |
| Overflow horizontal | tidak ada di 360/390/768/1280 (room, pre-join, lobby) ✅ |
| CPU kasar | 3 klien headless (admin: 1 layar + kamera; peserta: 2 layar + kamera; penonton) di satu Mac: **±208% CPU total, RSS 1,6 GB** semua proses Chromium (≈70% per klien, termasuk encode fake media) |
| Pelanggaran CSP | **0** (admin + peserta: login, lobby, salin link, pre-join, join, kamera, mic, layar, panel peserta, menu tile) ✅ |
| Konsol | Tidak ada error app yang tak terduga. Ada noise: lihat QA-10 |
| Log server | Bersih; SIGTERM → "server berhenti dan DB ditutup" ✅ |

---

## 1. Status regresi audit 01

Legenda: ✅ beres · ⚠️ sebagian · ❌ belum. Fokus pada P1 + bug. P2/P3 diringkas di bawah.

| ID | Sev lama | Status | Bukti |
|---|---|---|---|
| UX-01 Pre-join | P1 | ✅ | Preview kamera, toggle mic/kamera, pilih perangkat, meter mic, judul room + peran, nama tamu (`10`, `12`, `14`, `62`, `66`). Undangan tidak lagi masuk langsung ke room |
| UX-02 Control bar | P1 | ✅ | Bar bawah tinggi tetap 80 px: Mic·chevron, Kamera·chevron, Layar(+badge jumlah, daftar), Peserta (n), Undang, **Keluar merah** + konfirmasi (`16`, `27`). Mic/kamera mati = merah |
| UX-03 Indikator mic/bicara | P1 | ✅ | Badge mic-mati merah di label tile (`16`, aria `img "Mikrofon mati"`); `SpeakingRing` ada di kode (tidak terverifikasi visual karena audio palsu) |
| UX-04 Daftar peserta / tanpa kamera | P1 | ⚠️ | Panel "Peserta (3)" lengkap: peran, "(Anda)", jumlah layar, mic, kualitas koneksi, penonton ikut (`19`). **Tetapi peserta yang tidak pernah menyalakan kamera tetap tidak punya tile** → stage "Belum ada video" padahal 3 orang hadir (`72`). Lihat QA-01 |
| UX-05 Toast | P1 | ✅ | "Budi Peserta bergabung", "Citra Penonton bergabung", "Admin mulai membagikan layar 1", "Budi Peserta keluar" (`13`, `18`, `29`); agregasi 1,5 dtk |
| UX-06 Slot mati | P1 | ⚠️ | ID internal sudah hilang dan admin punya **Hapus dari layout** (`30`). Sisa: nama asli hilang menjadi "Peserta keluar" dengan avatar "PK", slot fokus tetap menunjuk track mati sehingga panggung besar kosong bagi semua orang (`29`). Lihat QA-03 |
| UX-07 Error mentah Inggris | P1 | ✅ | "Password salah. Periksa lalu coba lagi.", "ID room sudah dipakai. Ganti ID room di Opsi lanjutan.", "Link undangan tidak valid atau sudah kedaluwarsa…", "Room tidak ditemukan atau sudah dihapus" (`02`, `05-lobby-duplicate`, `48`, `50`) |
| UX-08 Undangan saat bersesi | P1 | ✅ | "Anda akan masuk sebagai Dewi Peserta (Peserta)" + "Undangan ini untuk Penonton, tetapi peran Anda… tetap Peserta" + "Bukan Anda? Keluar" (`47`) |
| UX-09 Izin ditolak / perangkat | P1 | ✅ | NotAllowed: "Akses kamera ditolak. Izinkan lewat ikon gembok…" + Muat ulang + badge peringatan di tombol (`70`). NotReadable: "Kamera sedang dipakai aplikasi lain…". Di room: toast error berbahasa Indonesia (`71`) |
| UX-10 Audio diblokir | P1 | ✅ (kode) | `AudioBlockedBanner` besar di atas stage; klik "Gabung sekarang" kini menjadi gesture sehingga kasus ini jarang muncul. Tidak bisa direproduksi dengan flag autoplay |
| UX-11 Status reconnect/putus | P1 | ⚠️ | Banner kuning "Koneksi terputus, menyambung ulang…", kontrol publish dinonaktifkan, layar "Anda terputus dari room" + Sambung ulang/Ke lobby (`43`). Sisa: 15 dtk pertama tanpa tanda, lalu ±117 dtk "menyambung ulang" sebelum menyerah. Lihat QA-05 |
| UX-12 Perbesar/fullscreen lokal | P1 | ✅ | Menu ⋯ tile: "Perbesar" (lokal, admin tidak terpengaruh, Esc kembali) + "Layar penuh" (`23`, `75`); juga untuk penonton |
| UX-13 Undang dari room + judul | P1 | ✅ | Dialog "Undang ke room" di control bar (`74`); header menampilkan judul room |
| BUG-01 Pattern ID room | P2 | ✅ | `pattern` valid; browser menahan submit `rapat desain` (`04`). Pesan validasi native masih Inggris (QA-07) |
| BUG-02 404 kosong | P2 | ✅ | Halaman 404 "Halaman tidak ditemukan" + "Ke daftar room" (`49`) |
| BUG-03 Kontrol aktif setelah putus | P1 | ✅ | Sesi ganda: tab lama → "Anda membuka room ini di tab/perangkat lain" + **Pakai di tab ini**; ping-pong bekerja sesuai label (`45`, `46`); tidak ada kontrol publish di layar putus |

**P2/P3 lama:** ✅ UX-14 (⌘D/⌘E di macOS terverifikasi; Ctrl di OS lain), ✅ UX-16 (tile `role=group`, handle seret terpisah berlabel,
splitter berlabel "Ubah ukuran antara …"; 0 kontrol tanpa nama), ✅ UX-17 (ring biru 2–3 px terlihat, `64`), ✅ UX-18 ("Layar N"
konsisten, info audio jadi toast sekali), ✅ UX-19 (kamera ke strip saat ada layar, ukuran minimum panel wajar `25`),
✅ UX-20 (mobile: overflow "Lainnya", footer tetap `15`, `76`), ✅ UX-21 (toolbar tile muncul saat hover/fokus, badge
"Difokuskan"), ✅ UX-22 (ID otomatis dari judul, konfirmasi logout tamu), ✅ UX-23 (format `id-ID`, peringatan Link Admin),
✅ UX-24, ✅ UX-25 (brand + petunjuk tamu), ✅ UX-26 (`28`), ✅ UX-27 (skeleton + avatar), ✅ UX-28 (chevron perangkat),
✅ UX-29 (preferensi tersimpan), ⚠️ **UX-15** (mirror + "(Anda)" beres, layar sendiri **masih dirender** di stage sendiri → QA-02),
❌ UX-30 / UX-31 (P3, sesuai rencana ditunda).

---

## 2. Temuan baru

Ringkasan: **P0: 0 · P1: 2 · P2: 7 · P3: 9**

### QA-01 — Peserta tanpa kamera tidak muncul di stage (sisa UX-04)
- **Severity:** P1
- **Reproduksi:** admin masuk tanpa kamera → peserta "Indra" join dengan mic saja → stage admin menampilkan "Belum ada video"
  padahal ada 3 orang dan Indra sedang bicara (`72`). Bila Indra menyalakan lalu mematikan kamera, barulah muncul tile avatar
  "IK · Kamera mati" (`73`). Perilakunya jadi tidak konsisten, tergantung riwayat kamera.
- **Harapan (Meet/Zoom):** setiap peserta (bukan penonton) punya tile avatar + indikator bicara walau kamera tidak pernah nyala.
- **Kode:** `src/web/stage/Stage.tsx` (`useTracks([Camera, ScreenShare], { onlySubscribed: false })` hanya memberi publikasi yang ada),
  `src/web/stage/stage.resolve.ts` (`autoLayout`). Arah: tambahkan placeholder kamera untuk peserta `canPublish` tanpa publikasi
  kamera (`useTracks` dengan `withPlaceholder` dari `@livekit/components-react` menyediakannya).

### QA-02 — Layar sendiri dirender di stage sendiri (efek cermin; sisa UX-15)
- **Severity:** P1 (produk ini berpusat pada berbagi layar; berbagi *seluruh layar* adalah kasus umum)
- **Reproduksi:** peserta klik "Bagikan layar" → di stage miliknya sendiri muncul tile `… (Anda) · Layar 1` berisi `<video>` aktif
  (`17`, data `pOwnScreenTile`). Saat yang dibagikan seluruh layar, hasilnya cermin tak berujung, dan klien juga ikut merender
  ulang video lokal setiap frame.
- **Harapan:** placeholder "Anda sedang membagikan Layar 1" (+ tombol Hentikan) atau thumbnail kecil, seperti Meet/Zoom.
- **Kode:** `src/web/stage/TileView.tsx` (`TileMedia` untuk semua track), `src/web/stage/stage.tile.logic.ts` (sudah ada `isLocal`).

### QA-03 — Slot yatim: nama hilang, avatar "PK", fokus nyangkut di slot mati
- **Severity:** P2 (fix murah untuk penonton)
- **Reproduksi:** admin "Fokuskan untuk semua" layar 2 milik Budi → Budi keluar → semua orang melihat panggung besar abu-abu
  "Peserta keluar · Layar 2 · Difokuskan" dengan avatar **"PK"** (inisial dari teks placeholder), sampai admin bertindak (`29`).
- **Harapan:** bagi non-admin, slot tidak aktif disembunyikan/dilewati (fokus jatuh ke slot aktif berikutnya). Bila tetap ditampilkan,
  pakai ikon netral, bukan inisial "PK".
- **Kode:** `src/web/stage/stage.tile.logic.ts` (`personOf` → `participantLeft`), `src/web/stage/TileView.tsx` (`TileAvatar` untuk slot
  mati), `src/web/stage/stage.resolve.ts` (`resolveSlots`).

### QA-04 — Avatar tile kecil: nama dobel & status tertimpa label
- **Severity:** P2 (murah)
- **Reproduksi:** tile kecil (strip "Lainnya", mobile) dengan kamera mati / slot mati → teks status "Kamera mati" / "Layar 1 · tidak
  aktif" tertimpa label bawah, dan nama tampil dua kali (di bawah avatar dan di label) (`29` kiri bawah, `76` tile "IK").
- **Kode:** `src/web/stage/TileParts.tsx` (`TileAvatar` selalu merender nama + status). Arah: di tile kecil cukup avatar, karena
  nama dan status sudah ada di label (sembunyikan dengan container query / `@sm`).

### QA-05 — Putus jaringan: 15 dtk tanpa tanda, lalu ±2 menit "menyambung ulang"
- **Severity:** P2
- **Reproduksi:** `context.setOffline(true)` pada peserta. Status tetap `connected` selama **15 dtk** (tombol tetap aktif, tidak ada
  banner, `40`). Lalu `reconnecting` (banner tipis kuning, stage beku tetap tampil) selama **±117 dtk** sebelum layar
  "Anda terputus" (`43`). Setelah online lagi, "Sambung ulang" berhasil (`43c`). Reconnect singkat (offline 12 dtk) pulih sendiri.
- **Harapan:** tanda instan dari event `offline`/`online` browser. Stage diredupkan selama reconnect. Setelah ±30 dtk tawarkan
  "Keluar" / "Coba sambung ulang" tanpa menunggu kebijakan default LiveKit habis.
- **Kode:** `src/web/room/room.connection.ts` (tidak mendengar `window` `offline`; `new Room({...})` tanpa `reconnectPolicy`),
  `src/web/room/ConnectionBanner.tsx`, `src/web/pages/RoomPage.tsx`.

### QA-06 — Kontras: teks/ikon putih di atas merah (dark mode) 2,89:1
- **Severity:** P2 (murah)
- **Bukti:** token dark `--destructive: oklch(0.704 0.191 22.2)` dengan teks putih = **2,89:1** (butuh 4,5:1 untuk teks "Keluar",
  3:1 untuk ikon mic/kamera mati). Light mode 4,77:1 OK. Muted-foreground di atas `--muted` (light) 4,35:1, sedikit di bawah 4,5
  untuk teks kecil "Kamera mati" di avatar.
- **Kode:** `src/web/styles.css` (blok `.dark` `--destructive`), tombol di `src/web/room/ControlBar.tsx`, `MediaControls.tsx`,
  `src/web/prejoin/MediaToggle.tsx`. Screenshot `16` (Keluar redup).

### QA-07 — Konsistensi bahasa & label
- **Severity:** P2 (murah, satu PR copy)
- "**Logout**" / "**Logout dari zoomin?**" di lobby (`03`, `51`). App lain berbahasa Indonesia ("Masuk", "Keluar"). Sarankan
  "Keluar akun". → `src/web/lobby/LobbyHeader.tsx`
- Region toast terbaca "**Notifications alt+T**" (default sonner) → `src/web/main.tsx` / `components/ui/sonner.tsx`
  (`containerAriaLabel="Notifikasi"`).
- Pesan validasi ID room memakai teks native browser ("Please match the requested format." di Chromium berbahasa Inggris)
  → `src/web/lobby/CreateRoomForm.tsx` (`setCustomValidity` dengan `idHint`).
- Tujuan yang sama punya tiga label: "Ke lobby" (`RoomStatusScreen.tsx`), "Ke daftar room" (`NotFoundPage.tsx`), "Ke halaman
  utama" (`InvitePage.tsx`). Pilih satu.
- Toast "Admin mulai membagikan **layar** 1" vs label "**Layar** 1" → `src/web/room/participants.model.ts` (`screenToastText`).
- Brand "zoomin" (header/login) vs `<title>Zoomin</title>` → `src/web/index.html` / `app.brand.tsx`.

### QA-08 — "Layout otomatis (admin belum mengatur)" tampil ke semua orang
- **Severity:** P2 (murah)
- **Reproduksi:** peserta/penonton di room baru melihat teks abu-abu itu di atas stage (`15`, `18`). Bagi non-admin, teks ini
  terasa seperti teks internal.
- **Kode:** `src/web/stage/Stage.tsx` (`{!layout && <p>…autoLayout</p>}`): tampilkan hanya bila `actions` (admin).

### QA-09 — Pre-join tanpa jalan kembali
- **Severity:** P2
- **Reproduksi:** admin klik "Masuk" di lobby → pre-join tanpa header, brand, atau tombol "Kembali" (`07`, `10`). Satu-satunya jalan
  keluar adalah tombol back browser.
- **Kode:** `src/web/prejoin/PreJoin.tsx` (tambahkan link "Kembali ke daftar room" untuk pengguna bersesi).

### QA-10 — Noise konsol di produksi
- **Severity:** P3
- Error yang **diharapkan** dicetak `console.error` lengkap dengan stack (password salah 401, undangan rusak 400, room 404, rate limit
  429) → `src/web/pages/LoginPage.tsx`, `InvitePage.tsx`, `RoomPage.tsx`. Sebaiknya `warn` tanpa stack, atau diam untuk 4xx.
- Saat keluar dengan layar aktif: 4× warning LiveKit "track was not unpublished because no publication was found". Penyebabnya,
  `ScreenPublisher.dispose()` meng-unpublish setelah room diputus → `src/web/room/screen.publisher.ts`,
  `src/web/room/ScreenControls.tsx` (cleanup).

### QA-11 — Rate limit login: kunci 15 menit, teks "Tunggu sebentar"
- **Severity:** P3
- Setelah 5 password salah dari IP yang sama, password **benar** pun ditolak selama ±15 menit (server: `retry in 898s`), tetapi UI hanya
  menulis "Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi." (`52`). Tampilkan menit dari `Retry-After`.
- **Kode:** `src/web/error.message.ts` (`rate_limited`), `src/server/auth.ratelimit.ts`.

### QA-12 — Bundle tunggal 1,38 MB
- **Severity:** P3
- Login/lobby/undangan ikut mengunduh `livekit-client` + dnd-kit + panel (403 KB gzip). Di 3G, halaman undangan pertama lambat.
  Opsi: `React.lazy` untuk `RoomPage`/`PreJoin` (Bun mendukung `splitting`).

### QA-13 — Login dari `/` menampilkan peringatan "butuh sesi aktif"
- **Severity:** P3 (murah)
- Admin yang membuka `/` pertama kali langsung melihat kotak status "Halaman yang Anda buka butuh sesi aktif…" (`01`). Peringatan
  ini hanya relevan bila asalnya deep link (mis. `/rooms/x`) → `src/web/pages/LoginPage.tsx` (`state.reason === "session"`
  juga untuk `from === "/"`).

### QA-14 — Copy layar sesi ganda janggal
- **Severity:** P3 (murah)
- "Bergabung di sini akan **mengeluarkan room dari** tab/perangkat lain" → "…akan menutup room di tab/perangkat lain"
  (`45`) → `src/web/room/RoomStatusScreen.tsx` (`duplicateHint`).

### QA-15 — Lobby: panel undangan selalu terbuka; "Admin / Admin"
- **Severity:** P3
- Setiap kartu room selalu menampilkan blok "Undang orang", sehingga lobby dengan banyak room jadi sangat panjang (`61`). Header
  menampilkan nama "Admin" dan peran "Admin" bertumpuk (`03`). → `src/web/lobby/RoomCard.tsx`, `LobbyHeader.tsx`.

### QA-16 — Urutan Tab: stage dulu, kontrol belakangan
- **Severity:** P3
- Dari stage, Tab melewati handle + menu + splitter setiap tile sebelum Mikrofon (2 tile = 5 Tab, 5 tile ≈ 15 Tab). Shortcut ⌘/Ctrl+D/E
  menutup sebagian masalah. Opsi: skip-link "Ke kontrol" atau `tabindex` stage yang lebih ringkas. → `src/web/pages/RoomPage.tsx`.

### QA-17 — Mengosongkan ID room tidak kembali ke otomatis
- **Severity:** P3
- Opsi lanjutan → hapus isi ID → field `required` menahan submit. Field tidak kembali ke slug otomatis. → `CreateRoomForm.tsx`
  (`customId === "" → null`).

### QA-18 — `data-testid="stage"` ganda
- **Severity:** P3 (kesehatan test)
- Root `Stage` dan `ResizablePanel id="stage"` sama-sama punya `data-testid="stage"`, sehingga locator e2e strict jadi ambigu.
  → `src/web/stage/Stage.tsx`, `src/web/stage/StageTemplates.tsx`.

---

## 3. Yang sudah baik (tidak perlu disentuh)

- CSP Caddy kompatibel penuh (0 violation). Tidak ada inline script, dan `style-src 'unsafe-inline'` memang dibutuhkan.
- Tidak ada layout shift, overflow horizontal, kontrol tanpa nama aksesibel, atau ID DOM ganda. Heading room `h1` = judul.
- Fokus terlihat jelas (ring biru) di light dan dark.
- Pesan error API dan perangkat manusiawi dan berbahasa Indonesia. Sesi ganda tertangani rapi.
- Drag-swap, resize, template, fokus, dan hapus slot tersinkron ke penonton (`orderAfter` sama di admin dan penonton).

## 4. Wajib diperbaiki sebelum rilis 0.1.0

P0: tidak ada.

**P1**
1. **QA-01** — Tile avatar untuk peserta yang tidak pernah menyalakan kamera (`Stage.tsx` / `stage.resolve.ts`).
2. **QA-02** — Jangan render video layar sendiri di stage sendiri; tampilkan placeholder "Anda sedang membagikan Layar N" (`TileView.tsx`).

**P2 murah (≤ ~1 jam masing-masing, disarankan ikut)**
3. **QA-06** — Naikkan kontras `--destructive` dark mode (`styles.css`).
4. **QA-07** — Satu PR copy: "Logout" → "Keluar akun", aria toast "Notifikasi", `setCustomValidity` ID room, satu label "Ke daftar
   room", "Layar N" di toast, brand konsisten.
5. **QA-08** — Teks "Layout otomatis…" hanya untuk admin (`Stage.tsx`).
6. **QA-04** — Avatar tile kecil tanpa nama/status ganda (`TileParts.tsx`).
7. **QA-03** — Sembunyikan slot tidak aktif bagi non-admin, dan jangan pakai inisial "PK" (`stage.resolve.ts` / `stage.tile.logic.ts`).

**P2 lain (boleh menyusul 0.1.x):** QA-05 (deteksi offline instan + batas reconnect), QA-09 (tombol kembali di pre-join).
