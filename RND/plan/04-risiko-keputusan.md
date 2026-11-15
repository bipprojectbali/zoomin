# 04 — Risiko & Keputusan Terbuka

## Risiko

| # | Risiko | Dampak | Mitigasi | Pemilik | Sumber |
|---|---|---|---|---|---|
| R1 | Multi screen share gagal atau tidak stabil di browser nyata (picker berulang, stop/ended, Firefox/Safari) | Fitur pembeda gagal | M0 checklist 06 adalah gerbang sebelum M2. Chrome/Edge jadi target utama. | User (uji manual) | `../spike/06-browser-manual.md`, `02` §6 |
| R2 | CPU encoder klien jenuh pada 3+ layar + kamera | Fps turun, laptop panas | Share ke-2 dan seterusnya pakai `h720fps15`. Layer `h360fps3`. Dynacast mematikan layer yang tak dipakai. Ukur di M0. H.264 hardware sebagai cadangan. | wkr-m2 | `02` §1–§3 |
| R3 | Kapasitas server tidak cukup untuk (share + kamera) × (N−1) subscription | Room besar macet | Data lokal (`07`, M1 laptop, server + generator satu mesin, layout 4x4): 8 pub×20 sub 0% loss, 12×24 0.08%, 16×30 5–7.5% loss; livekit rata-rata < 1 core. CPU SFU bukan batas utama; bandwidth uplink server dan **decode di browser penonton** paling mungkin jadi batas. Tile besar layer tertinggi belum diuji. Ulangi load test di server produksi dari mesin terpisah + uji decode browser (M0/M4). Tetapkan batas (K5). | wkr-loadtest | `../spike/07-load-test.md`, `02` §8 |
| R4 | Satu room = satu node. Room tidak bisa dibagi ke beberapa server. | Plafon skala per room = satu mesin | Pilih mesin compute-optimized. Multi-node + Redis hanya untuk menambah jumlah room, bukan memperbesar satu room. | Orkestrator | `01` §6, `02` §8 |
| R5 | Klien internet tidak bisa menjangkau 100.64.0.8 (IP CGNAT/Tailscale). DNS subdomain → IP Tailscale hanya jalan untuk anggota tailnet. | Akses "dari internet" gagal | K1 default (b) publik (D1 di bawah): artefak memakai IP eksternal + Let's Encrypt, jadi butuh server/VPS ber-IP publik. Jalur tailnet terdokumentasi di `deploy/README.md`. Belum dicek apakah Tailscale Funnel bisa meneruskan UDP media; anggap tidak. | User | `01` §Deploy 3 |
| R6 | Token `roomAdmin` bocor ke browser, sehingga pemegangnya menulis metadata mentah tanpa validasi | Layout dirusak, moderasi disalahgunakan | Hapus `roomAdmin` dari `grantsForRole`. Test integrasi M3 memastikan Twirp → 401 untuk semua token browser. | wkr-m1-server, wkr-m3-server | `05` §Hasil |
| R7 | Role/identity dari client dipercaya (spike `api.ts` menerima `role` di body) | User mengangkat diri jadi admin | Role dari `room_members`, identity dari sesi. Ada test eksplisit di M1. | wkr-m1-server | `lk-bun/src/api.ts` |
| R8 | Dua admin menulis layout bersamaan (last-write-wins) | Perubahan hilang diam-diam | CAS `layout_version` di SQLite → 409. Client mengabaikan versi lebih kecil. | wkr-m3-server | `05` §Batas |
| R9 ✅ | Viewer menekan publish, lalu menunggu timeout ~10 dtk | UX buruk | UI menyembunyikan kontrol berdasarkan role/permissions. Terverifikasi e2e + QA (`../qa/02-ux-recheck.md`). | wkr-m1-web | `03` temuan 2 |
| R10 | VP9/AV1 untuk layar: freeze saat ganti layer, fps turun | Layar macet | Kunci VP8 + simulcast di `screen.encoding.ts`, dengan test | wkr-m2 | `02` §2 |
| R11 | `@dnd-kit/react` masih 0.x, API bisa berubah | Upgrade merusak drag | Pin exact 0.5.3. Drag dibungkus satu modul `src/web/stage/`. **Status 2026-11-14:** tetap terbuka tapi terkendali; drag-swap kini dijaga e2e (`e2e/layout.spec.ts`), jadi upgrade yang merusak langsung ketahuan. | wkr-m3-admin | `02` §9 |
| R12 | Tidak ada binary macOS resmi livekit-server | Dev di Mac butuh build Go/CGO | Dev pakai binary build-source (`.bin/`) atau Docker. Produksi pakai Linux resmi. | Orkestrator | `01` §Versi |
| R13 ✅ | Layout merujuk `{identity, trackName}`. Identity yang tidak stabil atau dua tab satu user mengacaukan referensi. | Slot salah atau kosong | `identity = user.id`. Tab kedua menendang tab pertama (`DUPLICATE_IDENTITY`); tab lama menampilkan layar sesi ganda + **Pakai di tab ini**. Diuji `e2e/session.spec.ts`. | wkr-m1-server | `../qa/02-ux-recheck.md` BUG-03 |
| R14 | Room metadata hilang saat LiveKit menutup room kosong | Layout reset | Simpan `layout_json` di SQLite dan tulis ulang saat room dibuat ulang (M3) | wkr-m3-server | `01-arsitektur.md` §Layout |
| R15 | Desktop: getDisplayMedia di Electrobun/CEF Alloy tidak terbukti (CEF #3667) | Desktop gagal | Ditunda ke M5, berbentuk spike. Cadangan Electron. | Orkestrator | `02` §7 |
| R16 | Browser hanya di desktop. Audio layar hanya di Chromium. HTTPS wajib. | User mobile/Firefox terbatas | Sebutkan di UI dan README. HTTPS sejak M1 untuk uji dari device lain. | wkr-m1-web | `02` §6, `06` |
| R17 ✅ | `POST /api/auth/admin-login` tanpa rate limit | Brute force password admin global | **Beres:** 5 gagal / 15 menit per IP (`ADMIN_LOGIN_MAX_FAILURES`), accept undangan 200 / jam per IP, `429` + `Retry-After`. IP dari `X-Forwarded-For` hanya bila `TRUST_PROXY=true`. Limiter in-memory: reset saat restart, tidak dibagi antar proses (cukup untuk satu instance). | wkr-m4-infra | `src/server/auth.ratelimit.ts` |
| R18 | Link undangan HMAC tidak bisa dicabut (multi-pakai sampai kedaluwarsa, maks 720 jam) | Link bocor tetap berlaku | TTL pendek untuk role admin/participant. Bila perlu pencabutan: tabel `invites` (nonce + revoked) | Orkestrator | `src/server/auth.invite.ts` |
| R19 | Urutan cek 401 → 404 → 403 membocorkan keberadaan room ke user yang sudah login | Rendah: enumerasi id room | Terima untuk MVP. Bila perlu, samakan 404 dan 403 untuk non-member | Orkestrator | `*.route.ts` |
| R20 | Uji otomatis memakai kamera/mic/layar palsu Chromium. Picker asli, izin OS (macOS Screen Recording), Firefox/Safari, dan jaringan seluler belum diuji. | Bug yang hanya muncul di perangkat nyata lolos ke 0.1.0 | Checklist `../spike/06-browser-manual.md` + kriteria jaringan M4 dijalankan user setelah deploy. Ringkasan di `../qa/00-status-rilis.md`. | User | `../qa/02-ux-recheck.md` §Metode |
| R21 | Login hanya lewat Google (A1): Google down, OAuth client dihapus/disuspend, atau secret bocor/terputar membuat tidak ada yang bisa login | Seluruh app tak bisa dimasuki (sesi aktif tetap jalan sampai kedaluwarsa) | Sesi dibaca dari DB, tetap berlaku walau Google down. Jalan darurat CLI `zoomin user` (A11) untuk peran/ban. Secret di env produksi saja. Bila perlu login cadangan: tambah provider kedua (Better Auth) atas keputusan user. | User | `05` A1, A11 |
| R22 | Consent screen Google berstatus "Testing": hanya akun test user (maks 100) yang bisa login; lainnya ditolak Google | Tamu luar gagal login saat rilis | Langkah "Publish app" di `.env.example` bagian 4, README §Setup login Google, `deploy/README.md` §OAuth client Google. Cek sebelum deploy. | User | `.env.example` |
| R23 | Jalur login test-only `POST /api/test/login` (A12) aktif di server publik = siapa pun login sebagai email apa pun, termasuk super_admin | Ambil alih penuh | Aktif hanya bila `ZOOMIN_TEST_AUTH=1` DAN `NODE_ENV !== "production"` (`config.ts`); endpoint server-only Better Auth tidak dipasang tanpa flag. Dijaga test: `config.test.ts`, `auth.test.route.test.ts`, dan e2e `prod.spec.ts` (404 di production walau flag diset). Jangan jalankan mode dev di server publik. | Orkestrator | `05` A12 |
| R24 | `redirect_uri_mismatch` / origin drift: `BETTER_AUTH_URL`, `PUBLIC_APP_URL`, dan URL yang dibuka browser berbeda | Login Google gagal | A14: satu URL cukup, yang kosong mengikuti yang lain. Troubleshooting di README. | User | `05` A14 |

## Keputusan yang diambil (2026-11-14)

Diambil orkestrator atas wewenang yang diberikan user untuk menyiapkan rilis 0.1.0. Semua bisa dibalik user.

| # | Keputusan | Alasan | Cara membalik |
|---|---|---|---|
| D1 | **K1 default akses publik (b):** `LK_USE_EXTERNAL_IP=true`, Let's Encrypt HTTP-01, TURN/TLS di 443. | Paling umum untuk tamu di luar tailnet; tidak butuh plugin DNS. | Jalur tailnet (a) terdokumentasi di `deploy/README.md` §Keputusan (DNS-01 atau `tailscale cert`, `LK_USE_EXTERNAL_IP=false`). |
| D2 | Versi rilis pertama **0.1.0** (`package.json` + `CHANGELOG.md`). | Rilis stabil pertama, API belum dijanjikan stabil (0.x). | Ganti versi sebelum deploy. |
| D3 | `INVITE_ACCEPT_MAX` = **200 / jam / IP**. | Banyak tamu bisa berbagi satu IP publik (NAT kantor/kampus, CGNAT seluler); batas rendah akan memblokir rapat besar. Tetap menahan spam/brute force. | Konstanta di `src/server/auth.invite.route.ts`. |
| D4 | Sourcemap dibuat **external**, tidak disajikan server dan di-exclude dari tarball rilis. | Debug tetap bisa di mesin dev tanpa membuka source ke publik. | `scripts/build.web.ts`. |
| D5 | Kontrol **tetap aktif** selama banner offline (browser `offline` / kualitas `lost`); baru dinonaktifkan saat LiveKit menyatakan `reconnecting` (`controlsEnabled`). | Putus singkat sering pulih sendiri sebelum LiveKit bereaksi; mematikan kontrol untuk tiap kedipan jaringan terasa rusak. | `src/web/room/room.connection.ts`. |
| D6 | Stage **tidak diredupkan** saat reconnect. | Banner dengan lama waktu sudah cukup jelas; meredupkan membuat layar yang sedang dibandingkan tak terbaca untuk putus singkat. | `src/web/pages/RoomPage.tsx`. |
| D7 | `SIDE_BY_SIDE_MAX` = **3** kolom, lebih dari itu turun baris. | 4+ kolom membuat layar 16:9 terlalu sempit (UX-19). | `src/web/stage/stage.resolve.ts`. |
| D8 | Pre-join **tanpa tombol kembali** untuk tamu tanpa sesi. | Tamu tidak punya lobby untuk dituju; tombol kembali hanya untuk pengguna bersesi (QA-09). | `src/web/prejoin/PreJoin.tsx`. |
| D9 | **Pilihan speaker di pre-join ditunda.** Di dalam room, menu mic sudah memuat daftar speaker (`audiooutput`). | Pemilihan output (`setSinkId`) tidak didukung merata di semua browser; mic + kamera sudah bisa dipilih di pre-join. | Item P3 di `../qa/00-status-rilis.md`. |

## Keputusan auth & peran (2026-11-14, disetujui user)

Spec lengkap dan kontrak endpoint/skema: `05-auth-roles.md`. Ringkasan untuk jejak keputusan:

| # | Keputusan |
|---|---|
| A1 | Better Auth 1.7.x stabil; satu-satunya login Google OAuth. `ADMIN_PASSWORD` + `/api/auth/admin-login` dihapus. |
| A2 | Sign-up terbuka untuk akun Google mana pun; user baru = `user`, hanya masuk room yang mengundangnya. |
| A3 | Dua lapis peran: global `user`/`admin`/`super_admin`; room `host`/`participant`/`viewer` (`host` menggantikan `admin`). |
| A4 | `super_admin` hanya dari env `SUPER_ADMIN_EMAILS`, disinkronkan tiap login; tidak bisa diberikan/dicabut lewat UI/API. |
| A5 | `admin` diangkat/diturunkan hanya oleh super_admin. Admin tidak bisa mengubah peran atau menyentuh admin/super_admin; tidak ada yang bisa ban/hapus diri sendiri. |
| A6 | Ban via plugin admin Better Auth (alasan + masa berlaku opsional): sesi dicabut + dikeluarkan dari semua room LiveKit aktif. Hapus = hard delete. |
| A7 | Buat room: admin & super_admin; pembuat jadi `host`. Admin global tanpa keanggotaan diperlakukan `host`. |
| A8 | Audit log wajib untuk aksi admin/dev. |
| A9 | Setting `allowed_email_domains` di DB (`app_settings`), ditegakkan saat login. |
| A10 | Rute: `/` landing, `/login`, `/app` lobby, `/rooms/:roomId`, `/invite/:invite`, `/settings`, `/admin`, `/dev`, `*` 404. |
| A11 | Jalan darurat CLI `zoomin user list` / `promote <email> --role admin\|user` / `unban <email>` langsung ke DB. |
| A12 | Test/e2e tanpa Google: `POST /api/test/login` hanya bila bukan production DAN `ZOOMIN_TEST_AUTH=1`; test membuktikan 404 di production. |
| A13 | Akun lama (tamu tanpa akun) tidak dimigrasikan; migrasi tetap SQL bernomor idempotent. |
| A14 | `BETTER_AUTH_URL` default = `PUBLIC_APP_URL` (dan sebaliknya); redirect Google `<BETTER_AUTH_URL>/api/auth/callback/google`. |

Dampak ke keputusan lama: K2 (a) digantikan A1 (lihat di bawah); R17 (rate limit `admin-login`) tidak berlaku lagi
karena endpoint dihapus, limiter undangan tetap, login dibatasi rate limit Better Auth.

## Keputusan akses room (2026-11-14, disetujui user)

Spec lengkap, migrasi `0004_room_access`, dan kontrak endpoint: `06-room-access.md`. Nomor di bawah merujuk R1–R11
di dokumen itu (bukan risiko R1–R18 di atas).

| # | Keputusan |
|---|---|
| 06-R1 | `rooms.visibility` `public` (default, perilaku lama: link undangan) / `private` (link ditolak, hanya anggota). |
| 06-R2 | Anggota ditambah lewat email; email tanpa akun → baris pending `room_invitations`, diklaim di hook `session.create` Better Auth. Allowlist domain tetap berlaku. |
| 06-R3 | Pengelola room = host room atau admin+; satu fungsi `canManageRoom` (`room.access.ts`) untuk semua route. |
| 06-R4 | Ganti tipe tidak menghapus anggota; validitas link dicek terhadap visibility saat preview/accept, bukan di token undangan. |
| 06-R5 | Status turunan dari `disabled_at` + `expires_at` (default tanpa batas): `active`/`inactive`/`expired`; non-active → token & undangan 403 `room_inactive`/`room_expired`; data tidak dihapus. |
| 06-R6 | Nonaktifkan → `deleteRoom` LiveKit langsung. Kadaluarsa ditegakkan enforcer tiap 60 s yang hanya menutup room **yang ada di DB** dan non-active. **Batas diterima:** token yang sudah terbit (TTL 2 jam) bisa bergabung ulang ≤60 s sebelum ditendang lagi. **Revisi E2E-04:** versi awal juga menutup room live yang tidak dikenal DB; itu menendang peserta instance lain yang berbagi LiveKit (dev + prod e2e, staging + prod), jadi dibatalkan — room yang dihapus sudah ditutup saat dihapus. |
| 06-R7 | Perpanjang = set `expiresAt` baru (≤ now + 365 hari) atau `null`; memperpanjang/mengaktifkan langsung membuat room aktif lagi. |
| 06-R8 | Hapus room oleh host room atau admin+; logika tunggal `room.service.ts#deleteRoom` (juga dipakai `/api/admin/rooms`). |
| 06-R9 | Kelola anggota (ubah peran, keluarkan + `removeParticipant`, batalkan pending); host terakhir dilindungi → 409 `last_host`. |
| 06-R10 | Semua aksi baru diaudit (`room.update`, `room.visibility`, `room.activate`, `room.deactivate`, `room.expiry`, `room.member.*`); email target boleh di detail audit, tidak di console log. |
| 06-R11 | `AdminRoomSummary.active` → `live` agar tidak bentrok dengan status room (breaking kecil di API admin). |

## Keputusan stage control (2026-11-15, disetujui user)

Spec lengkap, migrasi `0006_stage_mode`, dan kontrak tipe: `11-stage-control.md` (nomor merujuk S1–S12 di sana).

| # | Keputusan |
|---|---|
| 11-S1 | `rooms.stage_mode` `host` (default) / `request` / `open`; diubah pengelola (`canManageRoom`) via `PUT .../stage-mode` atau PATCH room; ganti mode tidak mengubah layout. Audit `room.stage_mode`. |
| 11-S2 | Metadata room LiveKit = envelope `{ stageMode, layout }` (`stage.model.ts`); JSON lama berbentuk `LayoutState` dibaca sebagai mode `host`. SQLite sumber kebenaran, selalu dipublikasikan ulang dari DB. |
| 11-S3 | Izin `PUT /layout` di server lewat `canEditStage`: pengelola selalu, `open` juga `participant`, `viewer` tidak pernah → 403 `stage_locked`. CAS versi tetap. |
| 11-S4 | Request (mode `request`) hanya untuk track screen milik pemanggil; satu pending per user per room, 5/menit, TTL 60 s. **Risiko diterima:** store in-memory → request hilang saat restart; dampak kecil karena umurnya ≤60 s dan klien membaca ulang lewat `GET`. Audit hanya approve/deny. |
| 11-S5 | Event realtime `sendData` reliable topic `zoomin.stage` (`stage.notify.ts`). **Risiko diterima:** dikirim ke semua peserta tanpa filter identity; isi tidak sensitif (siapa minta tampil), UI hanya menampilkan ke pengelola + pemohon. Gagal kirim = warn. |
| 11-S6 | Approve diterapkan klien pengelola (`sharedEffectiveLayout` → `PUT /layout` CAS, konflik → reload + ulang sekali → `POST approve`); server tidak menghitung layout karena layout otomatis hanya diketahui klien. |
| 11-S7 | UI pemilih "Stage control" (room, Pengaturan › Umum, form Buat room), badge mode untuk semua, aksi tile "Request to show"/"Request full stage", toast + antrean untuk pengelola. |
| 11-S8 / S8a | Template `custom-grid`: `grid { cols, rows, cells }` (1–7, ≤ `LAYOUT_MAX_SLOTS`), sel boleh kosong hanya di custom-grid, tanpa `panelSizes` (ponytail). Operasi hanya di `src/shared/layout.grid.ts`; taruh ke sel terisi = tukar. |
| 11-S9 | Teks UI English di `*.labels.ts`, kode error baru (`stage_locked`, `stage_mode_mismatch`, `stage_request_not_found`) di `ApiErrorCode` + `error.message.ts`. |
| 11-S10 | Panggung bersama = konten (screen-share); kamera di strip orang. Kamera boleh di-spotlight ke panggung secara eksplisit; layout lama yang memuat kamera tetap valid. |
| 11-S11 | Menu View per orang (Auto/Gallery/Speaker/Content only + strip Right/Bottom/Hidden), `localStorage` `zoomin.view` dalam try/catch; tidak memengaruhi orang lain. |
| 11-S12 | Follow host (lokal, default on). Off = tata panggung sendiri tanpa PUT. **Risiko diterima:** edit lokal penonton bisa membuat mereka melihat layout berbeda dari host; dimitigasi chip "Viewing your own layout" + tanda "Host layout changed". |

## Keputusan terbuka untuk user

Urut dari yang paling memblokir.

| # | Keputusan | Opsi | Rekomendasi | Memblokir |
|---|---|---|---|---|
| **K1** (default D1) | **Model akses internet.** Server ada di IP Tailscale 100.64.0.8. Artefak default ke (b); konfirmasi user masih diperlukan sebelum deploy. | (a) Semua user wajib anggota tailnet, subdomain → IP Tailscale, sertifikat `tailscale cert` atau DNS-01. (b) VPS/IP publik untuk LiveKit + TURN, app boleh tetap di tailnet. (c) Relay/tunnel TCP saja (media lewat TURN/TLS, kualitas turun; dukungan UDP belum diverifikasi). | (a) bila user internal semua. (b) bila ada tamu luar tailnet. | M4, R5 |
| **K2** ✅ | **Auth pengguna** — **Diganti 2026-11-14 oleh A1 (Google via Better Auth, lihat §Keputusan auth & peran).** Sebelumnya diputuskan (a): admin global via `ADMIN_PASSWORD` + link undangan HMAC per room+role, multi-pakai sampai kedaluwarsa (default 72 jam, maks 720 jam), tidak bisa dicabut (R18). | (a) Satu admin (password dari env) + link undangan bertanda tangan per role + nama tamu. (b) Email/password (mis. Better Auth). (c) Identitas Tailscale (header `tailscale serve`), hanya bila K1=a. (d) SSO/OIDC. | (a) untuk MVP internal: tabel minimal dan tanpa email. Naik ke (b)/(d) bila butuh akun permanen. | M1 |
| **K3** | **Domain + TLS** | Subdomain apa (`app.`, `lk.`, `turn.`)? CA: Let's Encrypt (butuh 80/443 publik atau DNS-01) vs `tailscale cert`. | Ikuti K1. TURN butuh domain + sertifikat sendiri (`01` §Deploy 3). | M4 |
| **K4** | **Router** | React Router (rekomendasi user) vs TanStack Router | React Router declarative. Hanya ~3 rute, jadi type-safe search params tidak dibutuhkan. | M1 (ringan) |
| **K5** | **Batas peserta & layar** per room | Contoh: maks N peserta, maks M layar per peserta, maks total share per room | Angka awal dari `07` (lokal): ≤ 12 share × 24 penonton masih bersih (loss 0.08%), 16 × 30 rusak. Usulan sementara maks ~8 share aktif per room (0% loss lokal), final setelah load test produksi + uji decode browser. Ditegakkan di backend (token/moderasi) sebagai konstanta bernama. | M2/M4, R3 |
| **K6** | **Rekaman/egress** | Tidak / ya (Egress v1.15.0 butuh Redis + service terpisah) | Tidak untuk MVP | Arsitektur M4 |
| **K7** | **Preset layout buatan user** (simpan/muat) | Tidak (hanya 3 template bawaan) / ya (tabel `layout_presets`) | Tidak sampai diminta | M3 |
| **K8** | **Multi admin per room** | Satu admin / banyak admin | Banyak boleh, karena CAS sudah menangani konflik | M3 |
| **K9** | **Audio layar** | Wajib / opsional (hanya Chromium tab audio, sistem audio hanya Windows/ChromeOS) | Opsional dengan centang di picker | M2 |
| **K10** | **Hardware server** | Spek CPU/bandwidth 100.64.0.8 | Tentukan dari hasil M0 | M0/M4 |
