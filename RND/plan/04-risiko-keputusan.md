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

## Keputusan terbuka untuk user

Urut dari yang paling memblokir.

| # | Keputusan | Opsi | Rekomendasi | Memblokir |
|---|---|---|---|---|
| **K1** (default D1) | **Model akses internet.** Server ada di IP Tailscale 100.64.0.8. Artefak default ke (b); konfirmasi user masih diperlukan sebelum deploy. | (a) Semua user wajib anggota tailnet, subdomain → IP Tailscale, sertifikat `tailscale cert` atau DNS-01. (b) VPS/IP publik untuk LiveKit + TURN, app boleh tetap di tailnet. (c) Relay/tunnel TCP saja (media lewat TURN/TLS, kualitas turun; dukungan UDP belum diverifikasi). | (a) bila user internal semua. (b) bila ada tamu luar tailnet. | M4, R5 |
| **K2** ✅ | **Auth pengguna** — **Diputuskan (a):** admin global via `ADMIN_PASSWORD` + link undangan HMAC per room+role, multi-pakai sampai kedaluwarsa (default 72 jam, maks 720 jam), tidak bisa dicabut (R18). | (a) Satu admin (password dari env) + link undangan bertanda tangan per role + nama tamu. (b) Email/password (mis. Better Auth). (c) Identitas Tailscale (header `tailscale serve`), hanya bila K1=a. (d) SSO/OIDC. | (a) untuk MVP internal: tabel minimal dan tanpa email. Naik ke (b)/(d) bila butuh akun permanen. | M1 |
| **K3** | **Domain + TLS** | Subdomain apa (`app.`, `lk.`, `turn.`)? CA: Let's Encrypt (butuh 80/443 publik atau DNS-01) vs `tailscale cert`. | Ikuti K1. TURN butuh domain + sertifikat sendiri (`01` §Deploy 3). | M4 |
| **K4** | **Router** | React Router (rekomendasi user) vs TanStack Router | React Router declarative. Hanya ~3 rute, jadi type-safe search params tidak dibutuhkan. | M1 (ringan) |
| **K5** | **Batas peserta & layar** per room | Contoh: maks N peserta, maks M layar per peserta, maks total share per room | Angka awal dari `07` (lokal): ≤ 12 share × 24 penonton masih bersih (loss 0.08%), 16 × 30 rusak. Usulan sementara maks ~8 share aktif per room (0% loss lokal), final setelah load test produksi + uji decode browser. Ditegakkan di backend (token/moderasi) sebagai konstanta bernama. | M2/M4, R3 |
| **K6** | **Rekaman/egress** | Tidak / ya (Egress v1.15.0 butuh Redis + service terpisah) | Tidak untuk MVP | Arsitektur M4 |
| **K7** | **Preset layout buatan user** (simpan/muat) | Tidak (hanya 3 template bawaan) / ya (tabel `layout_presets`) | Tidak sampai diminta | M3 |
| **K8** | **Multi admin per room** | Satu admin / banyak admin | Banyak boleh, karena CAS sudah menangani konflik | M3 |
| **K9** | **Audio layar** | Wajib / opsional (hanya Chromium tab audio, sistem audio hanya Windows/ChromeOS) | Opsional dengan centang di picker | M2 |
| **K10** | **Hardware server** | Spek CPU/bandwidth 100.64.0.8 | Tentukan dari hasil M0 | M0/M4 |
