# zoomin

Ruang meeting self-hosted di atas LiveKit. Satu peserta bisa membagikan **beberapa layar sekaligus** (plus kamera
dan mic), dan admin room mengatur layout panggung (side-by-side, grid, focus; tukar slot, resize) yang sama untuk
semua penonton. Backend Bun + Elysia + SQLite, frontend React (SPA) yang di-bundle oleh Bun.

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
bun run dev                   # http://localhost:3000
```

Buka **`http://localhost:3000`** (bukan `http://0.0.0.0:3000`: itu bukan secure context, kamera/layar/salin link
gagal) dan login admin dengan `ADMIN_PASSWORD` (default dev: `admin`).

## Setup

Di development semua variabel punya default (cocok dengan LiveKit `--dev`). Di `NODE_ENV=production`,
`LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `SESSION_SECRET` (minimal 32 karakter), dan `ADMIN_PASSWORD` wajib diset;
server gagal start bila ada yang kosong. Penjelasan tiap variabel: `.env.example` (sama dengan output `zoomin env`).

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

Buka http://localhost:3000 dan login sebagai admin dengan `ADMIN_PASSWORD` (default dev: `admin`).

Mode production menolak start bila `dist/web/index.html` belum ada. `bun run build` menghasilkan aset ber-hash yang
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

1. Admin membuat room di lobby (id + judul).
2. Admin membuat link undangan per peran (`admin` / `participant` / `viewer`), masa berlaku default 72 jam, maks 720.
   Link juga bisa dibuat dari dalam room lewat tombol **Undang**.
3. Tamu membuka link, melihat judul room + peran, mengisi nama, lalu memeriksa kamera/mic di layar pre-join sebelum
   masuk.
4. Peserta menyalakan kamera/mic dan menekan "Tambah layar" berulang kali untuk membagikan beberapa layar.
5. Admin room memilih template, menukar slot (drag-drop), dan me-resize panel. Semua penonton, termasuk yang join
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
E2e menyalakan app sendiri di port 3101 dengan DB sementara; pasang browser-nya sekali dengan
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
| Log LiveKit memperingatkan UDP receive buffer kecil | Batas `net.core.rmem_max` kernel host | Opsional: naikkan `net.core.rmem_max` lewat sysctl di host VPS |

## Deploy

Dua jalur: LiveKit sebagai stack Portainer di VPS (yang terbukti, lihat §Arsitektur deploy yang terbukti), atau satu
server Linux penuh (Caddy + LiveKit + systemd + backup SQLite + rollback). Keduanya di
[`deploy/README.md`](deploy/README.md). Versi rilis mengikuti `version` di `package.json` dan `CHANGELOG.md`.

## API

Semua endpoint JSON di bawah `/api`, sesi lewat cookie `zm_session`. Kontrak tipe: `src/shared/api.types.ts`.
Error dikembalikan sebagai `{ error, code?, path? }`: `code` stabil untuk diterjemahkan UI (mis. `room_not_found`,
`invite_invalid`, `rate_limited`), `path` untuk error validasi (400). Login admin dan penerimaan undangan dibatasi per
IP; bila lewat batas → `429` + header `Retry-After`.

| Method | Path | Body | Respons |
|---|---|---|---|
| GET | `/api/health` | - | `{ ok: true }` |
| GET | `/api/me` | - | `{ user }` \| 401 |
| POST | `/api/auth/admin-login` | `{ password }` | `{ user }` + cookie \| 401 \| 429 (5 gagal / 15 menit per IP) |
| POST | `/api/auth/logout` | - | 204 |
| GET | `/api/rooms?limit=&cursor=` | - | `{ items, nextCursor }` (limit default 20, maks 100) |
| POST | `/api/rooms` | `{ id, title }` (admin global) | `RoomSummary`; pembuat jadi admin room |
| GET | `/api/rooms/:roomId` | - (anggota / admin global) | `RoomSummary` \| 401 \| 403 \| 404 |
| POST | `/api/rooms/:roomId/invites` | `{ role, ttlHours? }` (admin room / global) | `{ url, expiresAt }` |
| GET | `/api/invites/preview?invite=` | - (sesi opsional) | `InvitePreview` (judul room, peran, sesi saat ini) \| 400 \| 404 |
| POST | `/api/invites/accept` | `{ invite, name }` | `{ user, roomId }` + cookie \| 429 (200 / jam per IP) |
| POST | `/api/rooms/:roomId/token` | - | `{ token, url, role }` (role dari DB, bukan dari body) |
| GET | `/api/rooms/:roomId/layout` | - | `{ version, layout \| null }` |
| PUT | `/api/rooms/:roomId/layout` | `{ baseVersion, layout }` (admin room) | `{ version }` \| 409 `{ currentVersion }` |

## Struktur folder

```
src/cli/      CLI binary (serve, migrate, check, env, docs)
src/server/   API Elysia, auth (sesi + undangan), room, token LiveKit, layout (CAS SQLite + room metadata)
src/shared/   kontrak API, model layout, konvensi nama track (screen-<n>)
src/web/      SPA React: pages/, lobby/, prejoin/, room/ (media + multi layar), stage/ (layout + edit admin)
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
