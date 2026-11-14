# 01 — Audit UX/UI zoomin (branch `feature/prod-ready`)

Auditor: `wkr-ux-02` · Tanggal: 2026-11-14 · Metode: uji browser nyata (ego-browser/Chromium, viewport 1600×850, 390×844 mobile,
dark & light via emulasi `prefers-color-scheme`) + baca kode `src/web/**`. Screenshot di `RND/qa/screens/`.

## Ringkasan

Fondasi teknisnya sudah jalan: login admin, buat room, link undangan + salin (dengan toast), join tamu, kamera, mic, beberapa
screen share sekaligus, ganti template (Berdampingan/Grid/Fokus), tukar slot dengan drag-drop, resize panel, dan sinkron layout
ke peserta lain. Semua bekerja di uji dua sesi (admin di `localhost`, tamu di `127.0.0.1` sebagai cookie jar terpisah).

Masalahnya, room masih terasa seperti alat developer dan belum seperti Zoom/Meet. Yang paling terasa:

- **Tidak ada pre-join.** Link undangan langsung membawa ke room tanpa preview kamera, toggle mic/kamera, atau pilihan perangkat.
- **Peserta tidak bisa dilihat.** Tidak ada daftar peserta, indikator mic/bicara, avatar, atau toast masuk/keluar. Peserta
  tanpa kamera tidak muncul di layar sama sekali.
- **Slot layout yang mati tampil sebagai ID internal mentah** (`u_eZXQ…/camera (tidak aktif)`), dan admin tidak bisa
  menghapusnya. Setelah admin reload atau peserta keluar, stage penuh tile mati.
- **Pesan error mentah berbahasa Inggris** (`unauthorized`, `room already exists`, `Expected string to match '^[A-Za-z0-9_-]{1,64}$'`).
- **Setelah koneksi terputus, room tetap tampak hidup** (kontrol publish dan layout masih bisa diklik).

Jumlah temuan: **P0: 0 · P1: 14 · P2: 17 · P3: 3**, termasuk 3 bug fungsional (BUG-01..03).

### Catatan lingkungan uji

- Prompt izin kamera di browser tidak bisa diotomasi. Untuk menguji tile, layout, dan multi-share, `getUserMedia` dan
  `getDisplayMedia` diganti stream kanvas palsu di halaman. Penanganan izin **ditolak** dinilai dari kode, tidak diuji langsung.
- Picker layar asli browser juga tidak bisa diotomasi. Penambahan layar memakai stub yang sama.
- Mode dev Bun (`development: true` di `src/server/main.ts`) memasang overlay HMR. Overlay itu menangkap error dari *ekstensi
  browser* penguji (bukan dari app) dan menghalangi klik. Ini bukan temuan app, tetapi pastikan `NODE_ENV=production` di
  deploy supaya overlay ini tidak muncul ke pengguna.
- Tab latar belakang menampilkan tile hitam karena `adaptiveStream` menjeda video yang tidak terlihat. Itu perilaku LiveKit
  yang benar, bukan bug.

---

## Temuan UX

### UX-01 — Tidak ada halaman pre-join
- **Area:** Undangan → Room, Lobby → "Masuk room"
- **Severity:** P1
- **Deskripsi:** `InvitePage` hanya meminta nama, lalu langsung `navigate` ke room. Admin juga langsung masuk dari lobby. Kamera
  dan mic selalu mati di awal, jadi pengguna baru tahu kameranya bermasalah setelah berada di dalam room. Halaman undangan juga
  tidak menyebut **room mana** dan **sebagai peran apa** pengguna diundang (`10-invite.png`).
- **Pola standar:** Meet/Zoom/Teams punya layar "Siap bergabung?": preview kamera sendiri, toggle mic/kamera sebelum masuk,
  pilihan kamera/mic/speaker, nama tampilan, judul meeting, lalu tombol "Gabung sekarang". Peran viewer cukup melihat nama + judul.
- **File:** `src/web/pages/InvitePage.tsx`, `src/web/pages/RoomPage.tsx`, `src/web/room/room.connection.ts` (connect langsung
  saat mount), `src/web/room/MediaControls.tsx`
- **Screenshot:** `10-invite.png`, `11-participant-joined.png`

### UX-02 — Control bar bawah belum mengikuti pola standar
- **Area:** Room, footer
- **Severity:** P1
- **Deskripsi:**
  - Tombol keluar ada di **kiri atas** sebagai tombol ghost "← Keluar". Tombol ini tidak merah, tidak ada konfirmasi, dan secara
    visual tampak seperti tombol "kembali".
  - Kamera dan mic hanya berupa ikon tanpa label teks. Status on/off hanya dibedakan lewat varian tombol (terisi vs outline),
    tidak ada merah untuk "mic mati".
  - Tombol "Tambah layar" melebar penuh kolom ketika daftar layar muncul. Daftar `screen-1 ×` dan teks info audio ditaruh di
    footer, sehingga tinggi footer berubah-ubah dan menggerus tinggi stage (`09`, `13`). Di desktop footer jadi sekitar 110 px.
- **Pola standar:** Satu bar bawah dengan tinggi tetap, berisi Mic, Kamera, Share, Peserta, (Undang), dan **Keluar merah** di
  kanan/tengah. Setiap tombol diberi tooltip + label pendek. Mic mati ditandai merah/garis miring. Info sekunder tampil sebagai
  toast, bukan teks permanen.
- **File:** `src/web/pages/RoomPage.tsx` (header + footer), `src/web/room/MediaControls.tsx`, `src/web/room/ScreenControls.tsx`
- **Screenshot:** `08-room-camera.png`, `09-room-2-screens-auto.png`, `13-admin-view-with-budi.png`

### UX-03 — Tidak ada indikator mic mati / sedang bicara di tile
- **Area:** Stage, tile
- **Severity:** P1
- **Deskripsi:** Label tile hanya berisi `Nama · kamera`. Tile tidak menampilkan ikon mic mati, dan tile yang sedang bicara tidak
  diberi bingkai/aksen. Di uji, admin mic-on dan Budi mic-off tampil identik (`13`).
- **Pola standar:** Ikon mic-off di pojok tile dan border hijau/biru pada active speaker (`useIsSpeaking`/`useIsMuted` dari
  `@livekit/components-react`, yang sudah terpasang).
- **File:** `src/web/stage/StageTile.tsx` (`TileView`)
- **Screenshot:** `13-admin-view-with-budi.png`

### UX-04 — Tidak ada daftar peserta; peserta tanpa kamera tidak terlihat
- **Area:** Room
- **Severity:** P1
- **Deskripsi:** Stage hanya merender track Camera/ScreenShare (`useTracks(SOURCES)`). Peserta yang bergabung tanpa kamera (dan
  seluruh viewer) **tidak punya representasi apa pun**. Tidak ada cara mengetahui siapa yang hadir, perannya, atau status
  mic-nya. Admin juga tidak bisa melihat siapa yang sedang share untuk diatur di layout.
- **Pola standar:** Panel "Peserta (N)" berisi nama, peran, ikon mic/kamera, dan penanda "(Anda)". Peserta tanpa kamera tampil
  sebagai tile avatar inisial.
- **File:** `src/web/stage/Stage.tsx`, `src/web/pages/RoomPage.tsx` (belum ada komponen peserta)
- **Screenshot:** `11-participant-joined.png` (Budi masuk tanpa kamera: tidak ada tanda kehadiran di sisi admin)

### UX-05 — Tidak ada toast notifikasi kejadian room
- **Area:** Room
- **Severity:** P1
- **Deskripsi:** `<Toaster />` sudah dipasang global (`main.tsx`) tetapi hanya dipakai untuk "Link tersalin". Di dalam room tidak
  ada notifikasi untuk peserta masuk/keluar, layar baru dibagikan/dihentikan, layout diubah admin, atau error. Error room tampil
  sebagai teks merah inline di beberapa tempat berbeda (header banner, atas stage, footer).
- **Pola standar:** Toast singkat "Budi bergabung", "Budi keluar", "Budi mulai berbagi layar 2". Error memakai toast `error`
  yang konsisten.
- **File:** `src/web/main.tsx`, `src/web/pages/RoomPage.tsx`, `src/web/room/room.connection.ts` (`ParticipantConnected/Disconnected`
  belum didengar), `src/web/room/ScreenControls.tsx`, `src/web/room/MediaControls.tsx`
- **Screenshot:** `06-copy-toast.png` (toast yang sudah ada), `21-admin-after-budi-left.png` (Budi keluar tanpa notifikasi)

### UX-06 — Slot layout mati menampilkan ID internal dan tidak bisa dihapus
- **Area:** Stage (admin & semua penonton)
- **Severity:** P1
- **Deskripsi:** Begitu track di slot layout tidak aktif (peserta keluar, mematikan kamera, admin reload halaman), tile berubah
  menjadi `u_eZXQTEqZF10bDVlkJKzh/camera (tidak aktif)` dengan label `u_eZXQTEqZF10bDVlkJKzh · kamera`. Nama manusia hilang
  walaupun peserta masih di room. Admin hanya punya aksi geser/fokus, **tidak ada "Hapus dari layout"**. Setelah admin reload,
  semua slot milik admin ikut mati sampai ia share ulang, sehingga stage penuh kotak abu-abu (`28`). Di mobile kotak mati ini
  memakan seluruh layar (`25`).
- **Pola standar:** Tile placeholder memakai nama peserta (atau "Peserta sudah keluar") + avatar. Admin punya aksi hapus slot,
  dan slot yatim bisa disembunyikan otomatis bagi penonton.
- **File:** `src/web/stage/StageTile.tsx` (`TileView` baris placeholder), `src/web/stage/stage.edit.ts`,
  `src/shared/layout.model.ts` (belum ada aksi remove), `src/web/stage/stage.labels.ts`
- **Screenshot:** `21-admin-after-budi-left.png`, `25-viewer-mobile.png`, `28-keyboard-focus.png`

### UX-07 — Pesan error mentah berbahasa Inggris
- **Area:** Login, Lobby, Undangan
- **Severity:** P1
- **Deskripsi:** `errorMessage()` menampilkan `body.error` dari server apa adanya. Hasilnya: password salah → `unauthorized`;
  ID room duplikat → `room already exists`; ID tidak valid → `Expected string to match '^[A-Za-z0-9_-]{1,64}$'`; link rusak atau
  kedaluwarsa → `invite invalid or expired`. Ini tidak konsisten dengan UI yang berbahasa Indonesia (pesan rate-limit justru
  sudah Indonesia).
- **Pola standar:** Pesan manusiawi dalam bahasa UI + langkah selanjutnya, misalnya "Password salah", "ID room sudah dipakai",
  "Link undangan tidak valid atau sudah kedaluwarsa. Minta link baru ke admin room."
- **File:** `src/web/error.message.ts` (petakan status/kode → teks), `src/server/auth.route.ts`, `src/server/rooms.route.ts`,
  `src/server/auth.invite.route.ts` (pertimbangkan field `code` yang stabil)
- **Screenshot:** `02-login-wrong.png`, `04-lobby-duplicate.png`, `04-lobby-invalid-id.png`, `22-invite-broken.png`

### UX-08 — Menerima undangan saat sudah bersesi: nama & peran diabaikan diam-diam
- **Area:** Undangan
- **Severity:** P1
- **Deskripsi:** Bila browser sudah punya sesi (mis. Budi peserta, atau admin yang mencoba link sendiri), `/invites/accept`
  memakai user lama. Nama yang diketik diabaikan, dan peran hanya bisa naik. Uji: membuka link **Penonton** di sesi Budi
  menghasilkan masuk room sebagai **Peserta** bernama "Budi Peserta", padahal form diisi "Citra Penonton". UI tidak memberi tahu
  apa pun. Di komputer bersama, orang kedua akan masuk memakai identitas orang pertama.
- **Pola standar:** Bila sudah login, tampilkan "Anda akan bergabung sebagai **Budi** (Peserta)" + tautan "Bukan Anda? Keluar".
  Field nama hanya untuk tamu baru.
- **File:** `src/web/pages/InvitePage.tsx`, `src/server/auth.invite.route.ts` (baris `existing ?? {…}` dan `UPSERT_MEMBER`)
- **Screenshot:** `25-viewer-mobile.png` (badge "Peserta" setelah membuka link Penonton)

### UX-09 — Izin kamera/mic ditolak & error perangkat tidak dipandu
- **Area:** Room, kontrol media
- **Severity:** P1
- **Deskripsi:** (Dari kode; prompt izin browser tidak bisa diotomasi.) Kegagalan `setCameraEnabled`/`setMicrophoneEnabled`
  tampil sebagai teks merah kecil `Kamera: <err.message>`, yaitu pesan browser mentah berbahasa Inggris (mis. "Permission
  denied"). `RoomEvent.MediaDevicesError` hanya di-`console.error`. Tidak ada panduan cara membuka izin, tidak ada status
  "diblokir" pada tombol, dan tidak ada deteksi perangkat tidak ditemukan atau sedang dipakai aplikasi lain.
- **Pola standar:** Dialog/banner "Kamera diblokir. Klik ikon gembok di address bar → izinkan kamera, lalu muat ulang." Tombol
  diberi badge peringatan, dan pesan dibedakan untuk `NotAllowedError`, `NotFoundError`, dan `NotReadableError`.
- **File:** `src/web/room/MediaControls.tsx`, `src/web/room/room.connection.ts` (handler `MediaDevicesError`)
- **Screenshot:** — (tidak bisa direproduksi otomatis)

### UX-10 — Audio diblokir autoplay: ajakan aktifkan suara mudah terlewat
- **Area:** Room, footer
- **Severity:** P1
- **Deskripsi:** Setelah reload/masuk tanpa gesture, `StartAudio` tampil sebagai kotak teks kecil "Klik untuk mengaktifkan
  suara" di footer, sejajar dengan tombol lain (`28`). Pengguna bisa duduk di room tanpa mendengar siapa pun dan tidak sadar
  penyebabnya.
- **Pola standar:** Banner/overlay jelas di atas stage, "Suara diblokir browser — klik untuk mendengar", dengan ikon speaker.
  Pre-join (UX-01) juga menyelesaikan ini karena tombol "Gabung" sudah menjadi gesture.
- **File:** `src/web/pages/RoomPage.tsx` (baris `StartAudio`)
- **Screenshot:** `28-keyboard-focus.png`, `31-duplicate-tab-kicked.png`

### UX-11 — Status reconnect/putus hanya berupa badge kecil
- **Area:** Room, header
- **Severity:** P1
- **Deskripsi:** Saat reconnect, satu-satunya tanda adalah badge "Menyambung ulang…" di pojok kanan atas. Saat terputus, ada
  banner merah tipis, tetapi stage lama tetap tampil seolah normal (lihat BUG-03).
- **Pola standar:** Banner kuning penuh lebar "Koneksi terputus, menyambung ulang…" + stage diredupkan. Bila gagal permanen,
  layar "Anda terputus dari meeting" dengan tombol **Gabung lagi** dan **Kembali ke daftar room**.
- **File:** `src/web/pages/RoomPage.tsx` (`statusLabel`, blok `error`), `src/web/room/room.connection.ts`
- **Screenshot:** `31-duplicate-tab-kicked.png`

### UX-12 — Penonton tidak bisa memperbesar satu tile (fullscreen/pin lokal)
- **Area:** Stage
- **Severity:** P1
- **Deskripsi:** Produk ini dipakai untuk **membandingkan detail layar**, tetapi peserta/viewer tidak bisa memperbesar satu layar
  untuk dirinya sendiri. Dengan 5 track di template Berdampingan, tiap layar hanya sekitar 300 px lebar (`15`). Hanya admin yang
  bisa "Fokuskan", dan itu mengubah layout untuk semua orang.
- **Pola standar:** Double-click atau tombol "Layar penuh" pada tile (`requestFullscreen`), plus opsi "Pin untuk saya" yang
  hanya lokal. Cukup fullscreen per tile untuk rilis pertama.
- **File:** `src/web/stage/StageTile.tsx`
- **Screenshot:** `14-admin-side-by-side.png`, `15-participant-side-by-side.png`

### UX-13 — Tidak ada cara mengundang/menyalin link dari dalam room
- **Area:** Room
- **Severity:** P1
- **Deskripsi:** Link undangan hanya bisa dibuat di lobby. Admin yang sedang meeting harus **keluar dari room** (dan semua
  layarnya berhenti) untuk mengundang orang yang terlambat. Header room juga menampilkan ID `rapat-mingguan`, bukan judul "Rapat
  Mingguan Desain".
- **Pola standar:** Tombol "Undang"/"Info meeting" di control bar untuk menyalin link sesuai peran. Header menampilkan judul
  meeting.
- **File:** `src/web/pages/RoomPage.tsx` (header `<h1>{roomId}</h1>`), `src/web/lobby/InviteLinks.tsx` (bisa dipakai ulang di
  room)
- **Screenshot:** `07-room-admin-empty.png`

### UX-14 — Tidak ada shortcut keyboard
- **Area:** Room
- **Severity:** P2
- **Deskripsi:** `Ctrl/Cmd+D` (mic) dan `Ctrl/Cmd+E` (kamera) tidak berfungsi. Di uji, `Cmd+D` tidak mengubah mic, dan di browser
  tombol ini malah memicu bookmark.
- **Pola standar:** Meet memakai Ctrl/Cmd+D dan Ctrl/Cmd+E (`preventDefault`), Zoom memakai Alt+A/Alt+V. Shortcut ditampilkan
  di tooltip.
- **File:** `src/web/room/MediaControls.tsx`
- **Screenshot:** —

### UX-15 — Self-view tidak di-mirror, tanpa penanda "(Anda)", dan berisiko efek cermin
- **Area:** Stage
- **Severity:** P2
- **Deskripsi:** Kamera sendiri tidak di-mirror (`transform: none`) dan label tile hanya "Admin · kamera", tanpa penanda "(Anda)".
  Layar yang dibagikan sendiri juga dirender lagi di stage milik pembagi, sehingga membagikan seluruh layar menghasilkan efek
  cermin tak berujung.
- **Pola standar:** Self-view di-mirror + "(Anda)". Untuk layar sendiri: placeholder "Anda sedang membagikan layar 1" atau
  thumbnail kecil.
- **File:** `src/web/stage/StageTile.tsx` (`TileView`)
- **Screenshot:** `08-room-camera.png`, `09-room-2-screens-auto.png`

### UX-16 — Aksesibilitas: tile = `role="button"` bersarang, splitter tanpa nama
- **Area:** Stage (admin)
- **Severity:** P2
- **Deskripsi:** dnd-kit menjadikan tile `div role=button` yang bisa difokus tanpa nama selain isi teks placeholder, dan di
  dalamnya ada `<button>` lain (nested interactive). Splitter resize (`role=separator`) fokus tanpa `aria-label`. Urutan Tab di
  room: Keluar → 3 template → tile → geser → fokus → splitter → … → kontrol media di paling akhir, sehingga dengan 5 tile butuh
  lebih dari 20 Tab untuk mencapai mic.
- **Pola standar:** Kontrol utama (mic/kamera/keluar) dapat dicapai lebih dulu atau lewat shortcut. Handle drag terpisah dengan
  label ("Seret untuk memindah layar 1"). Splitter diberi label ("Ubah ukuran antara layar 1 dan layar 2").
- **File:** `src/web/stage/StageTile.tsx`, `src/web/stage/StageTemplates.tsx` (`ResizableHandle`), `src/web/pages/RoomPage.tsx`
- **Screenshot:** `28-keyboard-focus.png`

### UX-17 — Fokus ring tipis/kurang kontras
- **Area:** Global
- **Severity:** P2
- **Deskripsi:** `outline-ring/50` (ring 50% abu-abu) nyaris tak terlihat di dark mode, terutama pada tombol ikon kecil di atas
  video (`28`: tombol Fokuskan sedang fokus tetapi sulit dibedakan).
- **Pola standar:** Ring 2 px kontras ≥3:1 dengan offset, mis. `focus-visible:ring-2 ring-ring ring-offset-2`.
- **File:** `src/web/styles.css` (`@layer base`), `src/web/components/ui/button.tsx`
- **Screenshot:** `28-keyboard-focus.png`

### UX-18 — Penamaan layar tidak konsisten & info audio permanen
- **Area:** Footer vs tile
- **Severity:** P2
- **Deskripsi:** Footer menulis `screen-1`, `screen-2` (nama track internal), sedangkan tile menulis `layar 1`. Teks "Audio layar
  tidak ikut terbagi…" menetap di footer sampai aksi berikutnya.
- **Pola standar:** Pakai label yang sama ("Layar 1") di semua tempat. Info sekali tampil sebagai toast.
- **File:** `src/web/room/ScreenControls.tsx`, `src/web/stage/stage.labels.ts`
- **Screenshot:** `09-room-2-screens-auto.png`

### UX-19 — Template Berdampingan & resize kurang cocok untuk banyak track
- **Area:** Stage
- **Severity:** P2
- **Deskripsi:** Layout otomatis memasukkan **semua** track (termasuk kamera) ke slot. Berdampingan dengan 5 track menghasilkan
  5 kolom potret sempit: layar 16:9 jadi kecil (letterbox besar) dan kamera `object-cover` terpotong parah (`14`). Resize punya
  `minSize="5"`, sehingga panel bisa digencet sampai sekitar 70 px dan tombol aksinya terpotong (`17`).
- **Pola standar:** Default layout mengutamakan layar (kamera ke strip kecil). Berdampingan maksimal 2–3 kolom, lalu wrap ke
  baris. Ukuran panel minimum masuk akal (mis. 15%).
- **File:** `src/web/stage/stage.resolve.ts` (`autoLayout`), `src/web/stage/StageTemplates.tsx`
- **Screenshot:** `14-admin-side-by-side.png`, `17-admin-after-drag-resize.png`

### UX-20 — Mobile 390 px: footer makan ruang, grid satu kolom
- **Area:** Room mobile
- **Severity:** P2
- **Deskripsi:** Footer 191 px (~23% tinggi layar) karena tombol "Tambah layar" full-width + daftar layar + teks info. Grid
  menjadi 1 kolom dengan 5 baris sehingga tiap tile sangat pendek. Toolbar template admin menambah satu baris lagi. Tidak ada
  overflow horizontal (bagus).
- **Pola standar:** Control bar ringkas berisi ikon, toolbar admin di menu "Layout", dan stage maksimal. Pertimbangkan
  menyembunyikan "Tambah layar" bila `getDisplayMedia` tidak didukung (sudah ditangani, tetapi tampilannya masih teks panjang).
- **File:** `src/web/pages/RoomPage.tsx`, `src/web/room/ScreenControls.tsx`, `src/web/stage/StageTemplates.tsx` (`grid-cols-1`)
- **Screenshot:** `26-admin-mobile-grid.png`, `27-admin-mobile-focus-light.png`, `25-viewer-mobile.png`

### UX-21 — Tombol aksi admin menutupi konten & state fokus tidak terlihat
- **Area:** Stage (admin)
- **Severity:** P2
- **Deskripsi:** Tombol ←, →, dan Fokus selalu tampil di pojok kanan atas setiap tile, menutupi bagian konten layar yang
  dibagikan (sering berisi tombol/teks penting). Tombol "Fokuskan" tetap ada di tile yang sudah difokus, tanpa penanda "sedang
  difokus". Di template Fokus, label "Geser ke kiri/kanan" untuk tile besar membingungkan.
- **Pola standar:** Tombol overlay muncul saat hover/focus-within. Tile fokus diberi badge "Difokuskan" + aksi "Lepas fokus".
- **File:** `src/web/stage/StageTile.tsx`
- **Screenshot:** `18-admin-focus.png`, `19-admin-focus-camera.png`

### UX-22 — Lobby: ID room manual & label "Keluar" bermakna ganda
- **Area:** Lobby
- **Severity:** P2
- **Deskripsi:** Admin harus mengarang ID room (aturan regex) di samping judul. "Keluar" di lobby berarti **logout**, sedangkan
  "Keluar" di room berarti **kembali ke lobby**. Tamu yang menekan "Keluar" di lobby kehilangan sesi dan tidak bisa kembali
  tanpa link baru, tanpa konfirmasi.
- **Pola standar:** ID dibuat otomatis dari judul (slug, bisa diedit). Bedakan label: "Keluar akun" vs "Tinggalkan meeting".
  Logout tamu perlu konfirmasi.
- **File:** `src/web/lobby/CreateRoomForm.tsx`, `src/web/pages/LobbyPage.tsx`, `src/web/pages/RoomPage.tsx`
- **Screenshot:** `03-lobby-empty.png`, `20-participant-after-leave.png`

### UX-23 — Link undangan: format tanggal en-US, hilang saat reload, "Link Admin" tanpa peringatan
- **Area:** Lobby
- **Severity:** P2
- **Deskripsi:** "Berlaku sampai 11/17/2026, 12:50:01 PM" memakai locale browser, bukan `id-ID`. Link yang sudah dibuat hilang
  setelah reload. Setiap klik membuat token baru. "Link Admin" (memberi hak penuh) dibuat sekali klik tanpa peringatan. Kolom
  link terpotong di mobile (wajar karena ada tombol Salin).
- **Pola standar:** `toLocaleString("id-ID")` atau format relatif ("berlaku 3 hari"). Peringatan "Siapa pun dengan link ini
  menjadi admin room".
- **File:** `src/web/lobby/InviteLinks.tsx`
- **Screenshot:** `05-lobby-invites.png`, `29-lobby-mobile-light.png`

### UX-24 — Room tidak ditemukan: "Coba lagi" tidak berguna, tanpa jalan keluar jelas
- **Area:** Room (error)
- **Severity:** P2
- **Deskripsi:** Untuk 404 room tampil banner "Room tidak ditemukan" + tombol "Coba lagi", badge "Gagal", dan teks "Gagal" di
  tengah layar. Coba lagi tidak akan pernah berhasil.
- **Pola standar:** Halaman error penuh: "Room tidak ditemukan atau sudah dihapus" + tombol "Kembali ke daftar room". Retry hanya
  untuk error jaringan/server media.
- **File:** `src/web/pages/RoomPage.tsx`, `src/web/room/room.connection.ts`
- **Screenshot:** `23-room-not-found.png`

### UX-25 — Login: tanpa identitas app & tamu tersesat ke "Masuk admin"
- **Area:** Login
- **Severity:** P2
- **Deskripsi:** Halaman login hanya berisi "Masuk admin", tanpa nama/logo aplikasi. Tamu yang sesinya habis atau membuka `/`
  diarahkan ke form password admin tanpa penjelasan bahwa tamu butuh link undangan.
- **Pola standar:** Nama app + teks "Tamu? Buka link undangan dari admin room".
- **File:** `src/web/pages/LoginPage.tsx`, `src/web/session.context.tsx` (redirect 401)
- **Screenshot:** `01-login.png`, `02-login-wrong.png`

### UX-26 — Tidak ada layar "Anda telah keluar"
- **Area:** Room → keluar
- **Severity:** P2
- **Deskripsi:** Keluar langsung membawa ke lobby. Tidak ada konfirmasi bahwa meeting ditinggalkan dan tidak ada "Gabung lagi"
  (berguna bila tidak sengaja keluar).
- **Pola standar:** Meet: "Anda keluar dari rapat" + "Gabung kembali" + "Kembali ke beranda".
- **File:** `src/web/pages/RoomPage.tsx`
- **Screenshot:** `20-participant-after-leave.png`

### UX-27 — Tile tanpa state loading / avatar
- **Area:** Stage
- **Severity:** P2
- **Deskripsi:** Video yang belum menerima frame tampil sebagai kotak hitam/abu kosong, tanpa spinner atau avatar. Kamera yang
  dimatikan membuat tile hilang (bila layout otomatis) atau menjadi teks ID mentah (bila slot layout).
- **Pola standar:** Avatar inisial di atas latar netral, spinner kecil saat video memuat.
- **File:** `src/web/stage/StageTile.tsx`
- **Screenshot:** `21-admin-after-budi-left.png`

### UX-28 — Tidak ada pemilihan perangkat di dalam room
- **Area:** Room
- **Severity:** P2 (bagian pre-join masuk UX-01/P1)
- **Deskripsi:** Tidak ada menu untuk mengganti kamera/mic/speaker saat meeting (mis. ganti ke headset).
- **Pola standar:** Panah kecil (chevron) di samping tombol mic/kamera yang membuka daftar perangkat (`useMediaDeviceSelect`).
- **File:** `src/web/room/MediaControls.tsx`
- **Screenshot:** —

### UX-29 — Preferensi mic/kamera tidak diingat
- **Area:** Room
- **Severity:** P3
- **Deskripsi:** Setelah reload, kamera/mic selalu mati dan perangkat yang dipilih tidak diingat.
- **Pola standar:** Simpan preferensi di `localStorage`.
- **File:** `src/web/room/MediaControls.tsx`

### UX-30 — Tema hanya mengikuti OS
- **Area:** Global
- **Severity:** P3
- **Deskripsi:** Dark/light mengikuti `prefers-color-scheme` (keduanya tampil benar di uji, `27`, `29`), tetapi tidak ada toggle.
  Untuk app meeting, dark default di room lebih umum.
- **File:** `src/web/styles.css`
- **Screenshot:** `27-admin-mobile-focus-light.png`, `29-lobby-mobile-light.png`

### UX-31 — Fitur kolaborasi umum belum ada (chat, angkat tangan, reaksi)
- **Area:** Room
- **Severity:** P3
- **Deskripsi:** Standar di Zoom/Meet, tetapi bukan pembeda produk ini. Tunda.

---

## Bug fungsional

### BUG-01 — Validasi ID room di klien tidak pernah jalan (atribut `pattern` invalid)
- **Severity:** P2
- **File:** `src/shared/api.types.ts` (`SAFE_ID_PATTERN = "^[A-Za-z0-9_-]{1,64}$"`), `src/web/lobby/CreateRoomForm.tsx`
- **Penyebab:** Browser mengompilasi atribut `pattern` dengan flag `v`. Di mode `v`, `-` tak-ter-escape di akhir kelas karakter
  adalah syntax error (`Invalid character in character class`), sehingga pattern diabaikan dan input selalu valid. Pattern
  yang sama di server (tanpa flag `v`) tetap benar.
- **Reproduksi:**
  1. Login admin → lobby.
  2. Isi ID room `rapat desain` (dengan spasi), judul apa pun, klik **Buat**.
  3. **Hasil:** form terkirim dan tampil error server `Expected string to match '^[A-Za-z0-9_-]{1,64}$'`.
     **Harapan:** browser menahan submit dengan pesan validasi, atau tampil pesan Indonesia.
  4. Konfirmasi: `new RegExp("^(?:^[A-Za-z0-9_-]{1,64}$)$","v")` melempar SyntaxError.
- **Arah fix:** Escape `-` (`[A-Za-z0-9_\-]`) atau taruh di awal kelas, lalu cek ulang test server.
- **Screenshot:** `04-lobby-invalid-id.png`

### BUG-02 — Route tak dikenal menampilkan halaman kosong total
- **Severity:** P2
- **File:** `src/web/main.tsx` (tidak ada `<Route path="*">`)
- **Reproduksi:** buka `http://<host>/halaman-ngawur`. **Hasil:** layar kosong tanpa teks. **Harapan:** halaman 404 dengan
  tautan ke daftar room.
- **Screenshot:** `24-404.png`

### BUG-03 — Setelah terputus, stage & kontrol publish tetap aktif
- **Severity:** P1
- **File:** `src/web/room/room.connection.ts` (handler `Disconnected` hanya mengubah `status`/`error`; `room` tetap terisi),
  `src/web/pages/RoomPage.tsx` (`room ? <ConnectedRoom/> : …`)
- **Penyebab:** `RoomView` memilih tampilan berdasarkan ada/tidaknya objek `room`, bukan status. Setelah `Disconnected`, objek
  `room` lama tetap di state, sehingga toolbar layout, tombol kamera/mic, "Tambah layar", dan tile terus tampil dan bisa
  diklik pada koneksi yang sudah mati.
- **Reproduksi:**
  1. Admin masuk room `rapat-mingguan` di tab A.
  2. Buka room yang sama di tab B (akun sama) → tab A diputus (`DUPLICATE_IDENTITY`).
  3. **Hasil (tab A):** badge "Terputus" + banner "Akun ini masuk dari tab atau perangkat lain", tetapi stage, toolbar template,
     tombol kamera/mic/Tambah layar tetap aktif. "Coba lagi" akan menendang tab B (ping-pong).
  4. **Harapan:** layar terputus (UX-11) tanpa kontrol publish. Untuk duplicate identity, tawarkan "Pakai di tab ini" dengan
     penjelasan bahwa tab lain akan keluar.
- **Screenshot:** `31-duplicate-tab-kicked.png`

---

## Rekomendasi scope

### Rilis pertama stabil (P0 + P1)

Tidak ada P0, jadi alur inti tidak rusak. P1 berfokus pada "terasa seperti Zoom/Meet dan tidak membingungkan":

1. **Pre-join** (UX-01): preview kamera, toggle mic/kamera, pilih perangkat, nama, judul room + peran. Halaman ini sekaligus
   menyelesaikan gesture audio (UX-10) dan kasus sesi yang sudah ada (UX-08).
2. **Control bar standar** (UX-02): bar bawah tinggi tetap; mic/kamera berlabel dan merah saat mati; Share; Peserta; Undang
   (UX-13); **Keluar merah** dengan konfirmasi ringan. Header menampilkan judul room.
3. **Kesadaran peserta** (UX-03, UX-04, UX-05): ikon mic-off dan border active-speaker di tile, panel daftar peserta,
   toast masuk/keluar/share. Semua primitifnya sudah ada di `@livekit/components-react` + `sonner`.
4. **Slot layout mati** (UX-06): tampilkan nama peserta, bukan ID internal, dan tambahkan aksi admin "Hapus dari layout".
5. **Error manusiawi** (UX-07, UX-09): peta pesan Indonesia untuk error API dan izin perangkat.
6. **Status koneksi** (UX-11 + BUG-03): banner reconnect dan layar "terputus" yang mematikan kontrol.
7. **Fullscreen tile lokal** (UX-12): kecil, tetapi kritis untuk use case komparasi layar.

### Ditunda (P2/P3)

- P2 polish: shortcut (UX-14), mirror/"(Anda)" (UX-15), a11y tile/splitter & fokus ring (UX-16, UX-17), konsistensi label
  layar (UX-18), default layout & resize (UX-19), mobile (UX-20), overlay aksi admin (UX-21), lobby/undangan (UX-22, UX-23),
  halaman error/keluar/login (UX-24, UX-25, UX-26), avatar/loading tile (UX-27), device menu in-room (UX-28), BUG-01, BUG-02.
  BUG-01 dan BUG-02 masing-masing hanya beberapa baris, jadi layak diambil sekalian bila ada waktu.
- P3: ingat preferensi perangkat (UX-29), toggle tema (UX-30), chat/angkat tangan/reaksi (UX-31), daftar & cabut undangan.

**Saran tegas:** jangan menambah fitur baru (chat, rekaman, virtual background) sebelum tujuh butir P1 di atas selesai. Fitur
pembeda (multi-share + layout admin) sudah berfungsi. Yang menghambat adopsi adalah alur masuk dan kesadaran kehadiran yang
belum standar.
