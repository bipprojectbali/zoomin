# zoomin

Ruang meeting self-hosted di atas LiveKit. Satu peserta bisa membagikan **beberapa layar sekaligus** (plus kamera
dan mic), dan host room mengatur layout panggung (side-by-side, grid, focus; tukar slot, resize) yang sama untuk
semua penonton. Login dengan akun Google (Better Auth). Backend Bun + Elysia + SQLite, frontend React (SPA) yang
di-bundle oleh Bun.

## Akun & peran

- **Login Google** adalah satu-satunya cara masuk (tidak ada login password). Akun Google mana pun boleh mendaftar,
  kecuali super admin membatasi domain email di `/dev`. Akun yang diblokir tidak bisa masuk.
- **Profil** (`/settings`): ubah nama tampilan, pakai foto Google, lihat dan cabut sesi login di perangkat lain,
  hapus akun sendiri. Foto profil tampil di tile avatar dan daftar peserta.
- **Dua lapis peran.** Peran global (akun): `user` · `admin` · `super_admin`. Peran room: `host` · `participant` ·
  `viewer` (dari link undangan; `host` dulu bernama `admin`).
  - `user`: hanya masuk room yang mengundangnya.
  - `admin`: membuat room (pembuat jadi host), masuk room mana pun sebagai host, dan di `/admin` memblokir/membuka
    blokir, mencabut sesi, atau menghapus akun `user`, serta menghapus room.
  - `super_admin`: semua kemampuan admin plus `/dev` (mengangkat/menurunkan admin, kesehatan sistem, audit log,
    domain email yang diizinkan, ringkasan konfigurasi). **Hanya dari env `SUPER_ADMIN_EMAILS`**, disinkronkan setiap
    login; tidak bisa diberikan lewat UI. Tidak ada yang bisa memblokir/menghapus dirinya sendiri.
- **Room public / private.** Room public (default): siapa pun yang login dan memegang link undangan bisa masuk. Room
  private: hanya anggota yang diundang lewat email. Host room (atau admin+) mengelola room lewat dialog **Pengaturan
  room**: judul, tipe, anggota (undang lewat email; email tanpa akun jadi undangan tertunda yang otomatis diklaim saat
  login pertama), aktif/nonaktif (menonaktifkan memutus semua peserta), masa berlaku (default tanpa batas, maks 365
  hari; room kadaluarsa ditutup otomatis dalam ≤60 detik), dan hapus room.
- **Halaman**: `/` landing publik, `/login`, `/app` lobby, `/rooms/:roomId`, `/invite/:invite`, `/settings`,
  `/admin` (admin+), `/dev` (super_admin). Aksi admin/dev tercatat di audit log.

## Prasyarat

- **Bun 1.4.2**
- **LiveKit server** (diuji dengan 1.13.11). Untuk dev lokal jalankan `livekit-server --dev` (kredensial test-only
  `devkey`/`secret`, URL `ws://127.0.0.1:7880`). Tidak ada binary macOS resmi; cara build dan menjalankannya ada di
  [`RND/spike/01-livekit-server.md`](RND/spike/01-livekit-server.md).

## Quick start lokal

```bash
bun install

# LiveKit dev (pilih salah satu), kredensial devkey/secret di ws://127.0.0.1:7880
RND/spike/.bin/livekit-server --dev                                  # binary build-source (lihat RND/spike/01)
docker run --rm -p 7880:7880 -p 7881:7881 -p 7882:7882/udp livekit/livekit-server:v1.13.11 --dev --bind 0.0.0.0 --node-ip 127.0.0.1

cp .env.example .env          # atau: bun src/server/main.ts env > .env  (binary: zoomin env > .env)
# isi GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET (§Setup login Google) dan SUPER_ADMIN_EMAILS=<email Google Anda>
bun run dev                   # http://localhost:3000
```

Buka **`http://localhost:3000`** (bukan `http://0.0.0.0:3000` atau IP LAN: itu bukan secure context sehingga
kamera/layar/salin link gagal, dan origin-nya tidak terdaftar di Google) lalu **Masuk dengan Google**. Email yang ada
di `SUPER_ADMIN_EMAILS` otomatis menjadi super_admin; angkat admin lain dari `/dev`. Tanpa kredensial Google, app
tetap jalan tapi tombol login menampilkan "Login Google belum dikonfigurasi".

## Setup

Di development semua variabel punya default (cocok dengan LiveKit `--dev`). Di `NODE_ENV=production`,
`LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `BETTER_AUTH_SECRET` (minimal 32 karakter), `GOOGLE_CLIENT_ID`, dan
`GOOGLE_CLIENT_SECRET` wajib diset; server gagal start bila ada yang kosong. Penjelasan tiap variabel: `.env.example`
(sama dengan output `zoomin env`; tabel: `zoomin --docs env`).

### Setup login Google

Langkah lengkap ada di `.env.example` bagian 4. Ringkasnya, di Google Cloud Console buat OAuth client tipe
**Web application** dengan:

- Authorized JavaScript origins: `PUBLIC_APP_URL` (lokal `http://localhost:3000`).
- Authorized redirect URI: `<BETTER_AUTH_URL>/api/auth/callback/google` (`BETTER_AUTH_URL` default = `PUBLIC_APP_URL`;
  lokal `http://localhost:3000/api/auth/callback/google`).
- Consent screen berstatus "Testing" hanya menerima akun yang didaftarkan sebagai test user (maks 100); tekan
  "Publish app" agar akun lain bisa login.

Salin Client ID/secret ke `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, buat `BETTER_AUTH_SECRET` dengan
`openssl rand -base64 48` (menggantinya membuat semua user ter-logout dan link undangan lama tidak berlaku), dan isi
`SUPER_ADMIN_EMAILS` (dipisah koma).

Variabel jaringan:

| Var | Default | Kegunaan |
|---|---|---|
| `HOST` | `0.0.0.0` | Interface listen. Di belakang reverse proxy pakai `127.0.0.1` agar port app tidak terbuka langsung. |
| `TRUST_PROXY` | `false` | `true` hanya bila app **hanya** bisa dicapai lewat reverse proxy: IP klien untuk rate limit diambil dari `X-Forwarded-For`. |
| `TLS_CERT_PATH` / `TLS_KEY_PATH` | kosong | HTTPS langsung dari app (lihat §HTTPS lokal). Set keduanya atau kosongkan keduanya. Di produksi TLS ditangani Caddy. |

## Menjalankan

```bash
bun run dev     # hot reload, http://localhost:3000
bun run build   # prebuild SPA ke dist/web (wajib sebelum start)
bun run start   # mode production, menyajikan dist/web
```

Buka http://localhost:3000 dan masuk dengan Google.

Mode production menolak start bila `dist/web/index.html` belum ada (lokasi bisa diganti env `WEB_DIST_DIR`). File
SPA dibaca per request, jadi `bun run build` saat server jalan langsung terpakai tanpa restart (tab yang masih memuat
build lama perlu reload). Untuk kerja lokal pakai `bun run dev`. `bun run build` menghasilkan aset ber-hash yang
diperkecil dan dipecah per halaman (`scripts/build.web.ts`); sourcemap dibuat terpisah dan tidak disajikan server.

### Single binary

`zoomin` bisa dibangun menjadi satu file executable (`bun build --compile`) yang membawa runtime Bun, server, SPA
(prebuild `dist/web`, minified + Tailwind), dan migrasi SQL. Saat dijalankan tidak butuh Bun, `dist/`,
`migrations/`, atau `node_modules`.

```bash
bun run build:binary       # host → bin/zoomin-<os>-<arch>
bun run build:binary:all   # linux-x64, linux-arm64, darwin-arm64, darwin-x64, windows-x64
bun scripts/build.binary.ts --target bun-linux-x64-musl --target bun-linux-arm64   # target tertentu
```

Pakai:

```bash
zoomin --help              # perintah dan opsi (-p/--port, -H/--host, --db, --env-file); zoomin -v = versi
zoomin --docs              # dokumentasi lengkap; topik: usage, env, deploy, api, readme, list
zoomin env > .env          # contoh .env, lalu isi secret
zoomin check               # validasi konfigurasi tanpa start; secret hanya ditampilkan "diset"/"kosong"
zoomin migrate             # terapkan migrasi lalu keluar
zoomin                     # jalankan server (= zoomin serve)
```

Jalan darurat akun (langsung ke DB di server, mis. saat tidak ada super_admin yang bisa login):

```bash
zoomin user list                                  # email, peran, status blokir
zoomin user promote ana@example.com --role admin  # atau --role user untuk menurunkan; super_admin hanya dari env
zoomin user unban ana@example.com
```

Dari source: `bun src/server/main.ts user list` (opsi `--db`/`--env-file` sama dengan perintah lain).

Binary berjalan sebagai `NODE_ENV=production` kecuali `NODE_ENV` diset eksplisit, jadi secret produksi wajib diisi
(`zoomin check` memberi tahu yang kurang). `.env` di direktori kerja dimuat otomatis. `--env-file` hanya mengisi
variabel yang belum diset di env proses; flag `--port/--host/--db` menimpa keduanya. Ukuran sekitar 90-110 MB per
target (sebagian besar runtime Bun).

### HTTPS lokal (uji dari perangkat lain)

Kamera, mic, dan share layar butuh secure context. `localhost` dikecualikan, tapi akses dari perangkat lain
(mis. lewat IP Tailscale) butuh HTTPS. Set `TLS_CERT_PATH` dan `TLS_KEY_PATH` (keduanya, file PEM) di `.env`:

```bash
# Opsi 1: sertifikat Tailscale (MagicDNS + HTTPS harus aktif di tailnet)
tailscale cert <host>.<tailnet>.ts.net   # menghasilkan <host>.<tailnet>.ts.net.crt dan .key
# Opsi 2: mkcert (install sendiri), CA lokal harus dipercaya di perangkat penguji
mkcert -install && mkcert <host> <ip>
```

Lalu buka `https://<host>:3000` dan set `PUBLIC_APP_URL` ke alamat itu agar link undangan benar. Hanya satu
variabel diset, atau file tidak ada, membuat server gagal start.

## Arsitektur deploy yang terbukti

Diuji 2026-11-14 dari perangkat lain: app berjalan di satu mesin (Mac/server, tanpa IP publik) di belakang
Cloudflare Tunnel; LiveKit 1.13.11 berjalan di VPS sebagai stack Portainer di belakang Traefik. App di belakang
Tunnel dijalankan dalam mode produksi (`bun run build && bun run start`, atau binary), bukan `bun run dev`.

```
app (HTTPS)       browser ──▶ Cloudflare ──▶ Cloudflare Tunnel ──▶ zoomin :3000 (Mac/server)
signaling (wss)   browser ──▶ Cloudflare ──▶ Traefik (lk.example.com) ──▶ LiveKit :7880 (VPS, tidak di-publish)
media (WebRTC)    browser ──────────────────▶ IP publik VPS 7882/udp (utama), 7881/tcp (cadangan)
token/API         zoomin ──▶ LIVEKIT_URL (wss://lk.example.com)
```

Cloudflare tidak meneruskan UDP/TCP mentah, jadi media selalu langsung ke IP VPS. Port media di-publish Docker dan
melewati ufw; TURN mati, sehingga klien di jaringan yang hanya membuka 443 gagal media. Langkah, uji, dan catatan
firewall: [`deploy/README.md`](deploy/README.md) §LiveKit via Portainer, stack
[`deploy/livekit-compose.yml`](deploy/livekit-compose.yml).

### Koneksi browser ke LiveKit: dua opsi

**A. Subdomain LiveKit (direkomendasikan, terbukti).** Browser bicara langsung ke LiveKit lewat Traefik:

```bash
PUBLIC_APP_URL=https://app.example.com
PUBLIC_LIVEKIT_URL=wss://lk.example.com   # dipakai browser
LIVEKIT_URL=wss://lk.example.com          # dipakai server (token, sync layout)
LIVEKIT_API_KEY / LIVEKIT_API_SECRET      # sama dengan env stack LiveKit
```

**B. Proxy same-origin `/livekit`.** App mem-proxy signaling LiveKit di path `/livekit` (WebSocket + HTTP
`GET`/`HEAD`, prefix dibuang, diteruskan ke `LIVEKIT_URL`; aktif di dev, `bun run start`, dan binary). Berguna bila
tidak ada subdomain untuk LiveKit, cukup satu hostname app:

```bash
PUBLIC_APP_URL=https://app.example.com
PUBLIC_LIVEKIT_URL=wss://app.example.com/livekit   # signaling lewat app
LIVEKIT_URL=ws://127.0.0.1:7880                     # atau LiveKit remote, mis. wss://lk.example.com
```

Proxy hanya membawa signaling. Media WebRTC tetap langsung dari browser ke LiveKit, jadi port media LiveKit
(`rtc.tcp_port` / `rtc.udp_port` / `rtc.port_range_*`) dan IP yang diumumkannya harus terjangkau dari perangkat
klien. Cookie sesi app tidak diteruskan ke LiveKit, dan token (`access_token`) tidak ikut di log.

## Alur pakai

1. Admin (peran global) membuat room di lobby `/app` (id + judul) dan menjadi host room itu.
2. Host membuat link undangan per peran (`host` / `participant` / `viewer`), masa berlaku default 72 jam, maks 720.
   Link juga bisa dibuat dari dalam room lewat tombol **Undang**. Alternatifnya (dan satu-satunya cara di room
   private) host mengundang lewat email di Pengaturan room › Anggota.
3. Tamu membuka link, melihat judul room + peran, masuk dengan Google bila belum, lalu memeriksa kamera/mic di layar
   pre-join sebelum masuk. Nama dan foto diambil dari profil.
4. Peserta menyalakan kamera/mic dan menekan "Tambah layar" berulang kali untuk membagikan beberapa layar.
5. Host memilih template, menukar slot (drag-drop), dan me-resize panel. Semua penonton, termasuk yang join
   belakangan, melihat layout yang sama.

Viewer hanya menonton: tidak ada tombol kamera/mic/layar, dan server menolak publish dari token viewer.

## Test

```bash
bun test            # unit + integrasi
bun run typecheck
bun run test:e2e    # browser (Playwright, Chromium dengan kamera/mic/layar palsu)
```

Test integrasi (`test/*.integration.test.ts`) dan e2e butuh LiveKit dev server aktif di `ws://127.0.0.1:7880`
dengan kredensial `devkey`/`secret` (lihat Quick start); `.env` yang menunjuk LiveKit lain membuat test integrasi gagal.
E2e menyalakan dua app sendiri dengan DB sementara: mode dev di port 3101 dan mode produksi di port 3102 (SPA di-build
ke folder sementara lewat `WEB_DIST_DIR`, bukan `dist/web`). E2e tidak memanggil Google: login memakai endpoint
test-only `POST /api/test/login` yang hanya aktif bila `ZOOMIN_TEST_AUTH=1` dan bukan production (project `prod`
membuktikan 404). Server e2e dijalankan dengan `bun --no-env-file` dan semua variabel diset eksplisit di
`playwright.config.ts`, jadi `.env` developer tidak ikut terbaca. Pasang browser-nya sekali dengan
`bunx --bun playwright install chromium`. Laporan dan trace ada di `e2e/.artifacts/`, bug yang ditemukan e2e
dicatat di `e2e/BUGS.md`.

Smoke test setelah deploy: `SMOKE_URL=https://<domain> bun test test/smoke.prod.test.ts`.

## Troubleshooting

| Gejala | Penyebab | Solusi |
|---|---|---|
| `Blocked: Host header does not match the dev server` saat dibuka lewat domain/tunnel | Dev server Bun (`bun run dev`) menolak Host selain localhost | Pakai mode produksi: `bun run build && bun run start` (atau binary) |
| Salin link undangan gagal, kamera/layar tidak bisa dipakai | Dibuka di `http://0.0.0.0:3000` atau IP LAN, bukan secure context | Buka `http://localhost:3000`, atau HTTPS (§HTTPS lokal / tunnel) |
| Link undangan 404 di produksi | Bug token bertitik di rute SPA (sudah diperbaiki) | Build ulang dan restart app dengan versi terbaru |
| Toast/banner "Gagal terhubung ke server media" | Browser tidak bisa menjangkau LiveKit | Cek `PUBLIC_LIVEKIT_URL` bisa dibuka dari perangkat klien (`wss://`, bukan `ws://127.0.0.1`), dan port media VPS terbuka |
| `POST /api/rooms/:id/token` 500, log `syncRoomLayout` gagal | `LIVEKIT_URL` atau key/secret tidak cocok dengan server LiveKit | Samakan `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` dengan server LiveKit, lalu restart app |
| Error `M_ID` dari `chrome-extension://...` di konsol | Ekstensi browser, bukan app | Abaikan, atau uji di profil/incognito tanpa ekstensi |
| Google menampilkan `Error 400: redirect_uri_mismatch` | `BETTER_AUTH_URL`/`PUBLIC_APP_URL` berbeda dengan origin yang dibuka browser, atau `<BETTER_AUTH_URL>/api/auth/callback/google` belum didaftarkan di OAuth client | Buka app persis di `PUBLIC_APP_URL` (lokal `http://localhost:3000`), daftarkan origin + redirect URI di Google Cloud Console, restart app |
| Tombol login: "Login Google belum dikonfigurasi" | `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` kosong (dev) | Isi keduanya di `.env` (§Setup login Google), restart app |
| Login ditolak: domain email tidak diizinkan | Super admin membatasi domain email di `/dev` → Pengaturan | Masuk dengan akun berdomain yang diizinkan, atau minta super admin menambah domain (super admin sendiri selalu bisa masuk) |
| "Akun Anda diblokir admin" | Akun diblokir dari `/admin` | Minta admin membuka blokir; darurat di server: `zoomin user unban <email>` |
| Login Google gagal untuk akun tertentu ("access blocked"/belum terdaftar) | Consent screen masih "Testing" dan akun bukan test user | Tambah akun sebagai test user, atau "Publish app" di OAuth consent screen |
| Halaman kosong, konsol menampilkan chunk `.js` 404 setelah `bun run build` | Server produksi membaca daftar file SPA sekali saat start; build baru menghapus chunk lama | Restart server setelah tiap build; untuk lokal pakai `bun run dev` |
| Log LiveKit memperingatkan UDP receive buffer kecil | Batas `net.core.rmem_max` kernel host | Opsional: naikkan `net.core.rmem_max` lewat sysctl di host VPS |

## Deploy

Dua jalur: LiveKit sebagai stack Portainer di VPS (yang terbukti, lihat §Arsitektur deploy yang terbukti), atau satu
server Linux penuh (Caddy + LiveKit + systemd + backup SQLite + rollback). Keduanya di
[`deploy/README.md`](deploy/README.md). Versi rilis mengikuti `version` di `package.json` dan `CHANGELOG.md`.

## API

Semua endpoint JSON di bawah `/api`, sesi lewat cookie Better Auth (login Google). Kontrak tipe:
`src/shared/api.types.ts`. Error dikembalikan sebagai `{ error, code?, path? }`: `code` stabil untuk diterjemahkan UI
(mis. `room_not_found`, `invite_invalid`, `rate_limited`, `banned`, `insufficient_role`, `cannot_modify_self`),
`path` untuk error validasi (400). Tanpa sesi → 401 `unauthorized`; akun diblokir → 403 `banned`; peran kurang →
403 `insufficient_role`. Penerimaan undangan dibatasi per IP; bila lewat batas → `429` + header `Retry-After`.

Better Auth dipasang di `/api/auth/*` (mis. `POST /api/auth/sign-in/social` untuk memulai login Google,
callback `/api/auth/callback/google`, `POST /api/auth/sign-out`). Endpoint plugin admin Better Auth
`/api/auth/admin/*` sengaja diblok (404); aksi admin lewat `/api/admin/*` dan `/api/dev/*`.

| Method | Path | Akses / body | Respons |
|---|---|---|---|
| GET | `/api/health` | publik | `{ ok: true }` |
| GET | `/api/me` | sesi | `{ user }` (`SessionUser`) \| 401 \| 403 `banned` |
| PATCH | `/api/me` | sesi, `{ name?, image? }` (nama 1-60; `image` URL https atau `null` = foto Google) | `{ user }` |
| DELETE | `/api/me` | sesi (bukan super_admin) | 204 (hapus akun sendiri) |
| GET | `/api/me/sessions` | sesi | `{ items }` (sesi login, tanda `current`) |
| DELETE | `/api/me/sessions` · `/api/me/sessions/:id` | sesi | 204 (cabut semua sesi lain / satu sesi) |
| GET | `/api/rooms?limit=&cursor=` | sesi | `{ items, nextCursor }` (user: room yang diikuti; admin+: semua; limit default 20, maks 100) |
| POST | `/api/rooms` | admin+, `{ id, title, visibility?, expiresAt? }` | `RoomSummary`; pembuat jadi host \| 403 `insufficient_role` |
| GET | `/api/rooms/:roomId` | anggota / admin+ | `RoomSummary` \| 401 \| 403 \| 404 |
| PATCH | `/api/rooms/:roomId` | host room / admin+, `{ title?, visibility?, enabled?, expiresAt? }` | `RoomSummary` (`enabled: false` memutus semua peserta) |
| DELETE | `/api/rooms/:roomId` | host room / admin+ | 204 (hapus room di DB + LiveKit) |
| GET | `/api/rooms/:roomId/members?limit=&cursor=` | host room / admin+ | `Page<RoomMemberItem>` (anggota lalu undangan tertunda; limit default 50, maks 200) |
| POST | `/api/rooms/:roomId/members` | host room / admin+, `{ email, role }` | 201 `RoomMemberItem` (akun ada → anggota; belum → tertunda) |
| PATCH · DELETE | `/api/rooms/:roomId/members/:userId` | host room / admin+, PATCH `{ role }` | `RoomMemberItem` / 204 \| 404 `member_not_found` \| 409 `last_host` |
| DELETE | `/api/rooms/:roomId/invitations/:email` | host room / admin+ | 204 (batalkan undangan tertunda) \| 404 `member_not_found` |
| POST | `/api/rooms/:roomId/invites` | host room / admin+, `{ role, ttlHours? }` | `{ url, expiresAt }` \| 403 `room_private` |
| GET | `/api/invites/preview?invite=` | publik (sesi opsional) | `InvitePreview` (judul room, peran, sesi saat ini) \| 400 \| 403 `room_private`/`room_inactive`/`room_expired` \| 404 |
| POST | `/api/invites/accept` | sesi, `{ invite }` | `{ user, roomId, role }` \| 401 \| 403 (seperti preview) \| 429 (200 / jam per IP) |
| POST | `/api/rooms/:roomId/token` | anggota / admin+ | `{ token, url, role }` (role dari DB, bukan dari body) \| 403 `room_inactive`/`room_expired` |
| GET | `/api/rooms/:roomId/layout` | anggota / admin+ | `{ version, layout \| null }` |
| PUT | `/api/rooms/:roomId/layout` | host / admin+, `{ baseVersion, layout }` | `{ version }` \| 409 `{ currentVersion }` |
| GET | `/api/admin/users?q=&role=&banned=&limit=&cursor=` | admin+ | `Page<AdminUser>` |
| POST | `/api/admin/users/:id/ban` | admin+, `{ reason, expiresInHours? }` | `{ user }` (sesi dicabut + dikeluarkan dari room aktif) |
| POST | `/api/admin/users/:id/unban` | admin+ | `{ user }` |
| DELETE | `/api/admin/users/:id` | admin+ | 204 |
| POST | `/api/admin/users/:id/sessions/revoke` | admin+ | 204 |
| GET | `/api/admin/rooms?limit=&cursor=` | admin+ | `Page<RoomSummary & { members, live, participants }>` |
| DELETE | `/api/admin/rooms/:id` | admin+ | 204 (hapus room di DB + LiveKit) |
| PUT | `/api/dev/users/:id/role` | super_admin, `{ role: "user" \| "admin" }` | `{ user }` |
| GET | `/api/dev/health` | super_admin | `SystemHealth` (versi, LiveKit, DB) |
| GET | `/api/dev/audit?action=&actorId=&limit=&cursor=` | super_admin | `Page<AuditEntry>` |
| GET · PUT | `/api/dev/settings` | super_admin, `{ allowedEmailDomains }` | `AppSettings` |
| GET | `/api/dev/config` | super_admin | ringkasan config (secret hanya "diset"/"kosong") |

Aksi `/api/admin/*` (admin+) hanya boleh menyasar akun `user`; super_admin juga boleh menyasar admin. Tidak ada yang
bisa menyasar dirinya sendiri (403 `cannot_modify_self`) atau super_admin. Semua aksi admin/dev dicatat di audit log.

## Struktur folder

```
src/cli/      CLI binary (serve, migrate, check, user, env, docs)
src/server/   API Elysia, auth (Better Auth + Google, peran, undangan), admin/dev, room, token LiveKit, layout
src/shared/   kontrak API, model layout, konvensi nama track (screen-<n>)
src/web/      SPA React: pages/, landing/, app/, lobby/, prejoin/, room/ (media + multi layar), stage/ (layout + edit
              host), settings/ (profil), admin/, dev/
scripts/      build SPA produksi + single binary
migrations/   migrasi SQLite
test/         test integrasi dengan LiveKit dev + smoke test produksi
e2e/          test browser Playwright
deploy/       artefak deploy produksi
RND/          rencana (plan/), spike, dan QA (qa/)
```

## Batasan yang diketahui

- Share layar hanya di browser desktop. Audio layar hanya di Chromium.
- Link undangan multi-pakai sampai kedaluwarsa dan **tidak bisa dicabut**.
- Login hanya lewat Google: bila Google/OAuth client bermasalah tidak ada yang bisa masuk (sesi yang sudah ada tetap
  berlaku). Jalan darurat peran/blokir: `zoomin user` di server.
- Uji browser otomatis (Playwright + QA mode produksi) memakai media palsu. Uji perangkat nyata dengan picker layar
  dan izin OS, serta jaringan seluler/UDP diblokir, belum dilakukan; checklist manual ada di
  `RND/spike/06-browser-manual.md`. Status rilis: [`RND/qa/00-status-rilis.md`](RND/qa/00-status-rilis.md).
- Dari artefak `deploy/`, baru stack LiveKit Portainer yang sudah dijalankan di VPS; jalur Caddy + systemd belum.
  TURN mati di stack itu, jadi jaringan yang hanya membuka 443 gagal media.
- Belum ada chat, angkat tangan, reaksi, pilihan speaker, atau toggle tema (tema mengikuti OS).
- HTTPS lokal: sertifikat self-signed (atau CA mkcert yang belum dipercaya) membuat browser memblokir atau
  menampilkan peringatan. LiveKit juga harus diakses lewat `wss://` dari perangkat lain, sedangkan
  `livekit-server --dev` hanya `ws://`; untuk uji multi-perangkat lihat
  [`RND/spike/01-livekit-server.md`](RND/spike/01-livekit-server.md) §Deploy.

## Rencana

Arsitektur, stack, milestone, dan risiko/keputusan: [`RND/plan/`](RND/plan/).
