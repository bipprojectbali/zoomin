# zoomin

Ruang meeting self-hosted di atas LiveKit. Satu peserta bisa membagikan **beberapa layar sekaligus** (plus kamera
dan mic), dan admin room mengatur layout panggung (side-by-side, grid, focus; tukar slot, resize) yang sama untuk
semua penonton. Backend Bun + Elysia + SQLite, frontend React (SPA) yang di-bundle oleh Bun.

## Prasyarat

- **Bun 1.4.2**
- **LiveKit server** (diuji dengan 1.13.11). Untuk dev lokal jalankan `livekit-server --dev` (kredensial test-only
  `devkey`/`secret`, URL `ws://127.0.0.1:7880`). Tidak ada binary macOS resmi; cara build dan menjalankannya ada di
  [`RND/spike/01-livekit-server.md`](RND/spike/01-livekit-server.md).

## Setup

```bash
bun install
cp .env.example .env   # isi bila perlu; di development semua punya default
```

Di `NODE_ENV=production`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `SESSION_SECRET` (minimal 32 karakter), dan
`ADMIN_PASSWORD` wajib diset. Server gagal start bila ada yang kosong. Daftar variabel lengkap: `.env.example`.

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

Test integrasi (`test/*.integration.test.ts`) dan e2e butuh LiveKit dev server aktif di `ws://127.0.0.1:7880`.
E2e menyalakan app sendiri di port 3101 dengan DB sementara; pasang browser-nya sekali dengan
`bunx --bun playwright install chromium`. Laporan dan trace ada di `e2e/.artifacts/`, bug yang ditemukan e2e
dicatat di `e2e/BUGS.md`.

Smoke test setelah deploy: `SMOKE_URL=https://<domain> bun test test/smoke.prod.test.ts`.

## Deploy

Artefak dan langkah untuk satu server Linux (Caddy + LiveKit + systemd + backup SQLite + rollback) ada di
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
src/server/   API Elysia, auth (sesi + undangan), room, token LiveKit, layout (CAS SQLite + room metadata)
src/shared/   kontrak API, model layout, konvensi nama track (screen-<n>)
src/web/      SPA React: pages/, lobby/, prejoin/, room/ (media + multi layar), stage/ (layout + edit admin)
scripts/      build SPA produksi
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
- Artefak deploy produksi sudah ada di `deploy/`, tetapi belum pernah dijalankan di server.
- Belum ada chat, angkat tangan, reaksi, pilihan speaker, atau toggle tema (tema mengikuti OS).
- HTTPS lokal: sertifikat self-signed (atau CA mkcert yang belum dipercaya) membuat browser memblokir atau
  menampilkan peringatan. LiveKit juga harus diakses lewat `wss://` dari perangkat lain, sedangkan
  `livekit-server --dev` hanya `ws://`; untuk uji multi-perangkat lihat
  [`RND/spike/01-livekit-server.md`](RND/spike/01-livekit-server.md) §Deploy.

## Rencana

Arsitektur, stack, milestone, dan risiko/keputusan: [`RND/plan/`](RND/plan/).
