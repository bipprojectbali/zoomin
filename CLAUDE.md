# CLAUDE.md — zoomin

Panduan untuk agen AI di repo ini. Aturan global user (`~/.claude/CLAUDE.md`) tetap berlaku; file ini menambah
konvensi khusus proyek. Detail pakai/deploy: `README.md`, `deploy/README.md`.

## Proyek

Ruang meeting self-hosted di atas LiveKit. Pembeda: satu peserta bisa membagikan **beberapa layar sekaligus**, dan
admin room mengatur layout panggung (template, drag-drop, resize, fokus) yang sama untuk semua penonton. Fitur lain:
room, undangan per peran (`admin`/`participant`/`viewer`), pre-join, daftar peserta, toast, banner koneksi, rate limit
login/undangan, build produksi, single binary + CLI, proxy signaling opsional `/livekit`.

Status: app terbukti jalan lewat Cloudflare Tunnel + LiveKit 1.13.11 di VPS (stack Portainer
`deploy/livekit-compose.yml`). Versi rilis = `version` di `package.json` + `CHANGELOG.md`.

## Stack

- Runtime **Bun 1.4.2** (wajib Bun/TypeScript, bukan Node), TypeScript `^7.0.2`, ESM.
- Server: Elysia `^1.4.32`, SQLite `bun:sqlite`, `livekit-server-sdk` `^2.19.3`.
- Web: React `^19.3.1` SPA di-bundle Bun (HTML import), `react-router` `^8.5.1`, `livekit-client` `^2.24.0`,
  `@livekit/components-react`, Tailwind `^4.3.5` (`bun-plugin-tailwind`), radix-ui/shadcn (`src/web/components/ui`),
  `@dnd-kit/react` **0.5.3 dipin exact** (R11), `react-resizable-panels`, `sonner`.
- Test: `bun test`; e2e Playwright `^1.65.1`; `@livekit/rtc-node` untuk media sintetis di test integrasi.
- LiveKit server 1.13.11.

## Peta folder

```
src/server/   API Elysia: auth (sesi, undangan, rate limit), rooms, token, layout, livekit.proxy, config, db
src/shared/   kontrak API (api.types.ts), model layout, room id, konvensi nama track (screen-<n>)
src/web/      SPA: pages/, lobby/, prejoin/, room/, stage/ (layout), components/ui/
src/cli/      CLI single binary (args, help, docs, check, run); entrypoint tetap src/server/main.ts
scripts/      build.web.ts (SPA → dist/web), build.binary.ts (→ bin/)
migrations/   SQL bernomor (0001_init.sql, ...)
test/         integrasi dengan LiveKit dev + smoke produksi
e2e/          Playwright (temuan bug di e2e/BUGS.md)
deploy/       artefak produksi (systemd/Caddy, stack Portainer LiveKit)
RND/          spike/, plan/, qa/ (dokumen riset & keputusan; diabaikan bun test)
```

Penamaan file `[domain].[layer].ts` (mis. `auth.invite.route.ts`, `layout.service.ts`, `rooms.repository.ts`,
`room.labels.ts`); komponen React PascalCase (`ControlBar.tsx`). Test berdampingan: `<nama>.test.ts`. Hindari
`utils`/`helpers`.

## Perintah

```bash
bun install
bun run dev              # hot reload, http://localhost:3000 (bukan 0.0.0.0)
bun test                 # unit + integrasi (integrasi butuh LiveKit dev)
bun run typecheck        # tsc --noEmit
bun run test:e2e         # Playwright; sekali: bunx --bun playwright install chromium
bun run build            # SPA produksi → dist/web (wajib sebelum bun run start)
bun run start            # NODE_ENV=production
bun run build:binary     # bin/zoomin-<os>-<arch>; build:binary:all untuk semua target
bun src/server/main.ts --help   # CLI dari source (sama dengan binary `zoomin --help`)
```

LiveKit dev lokal: `RND/spike/.bin/livekit-server --dev` (atau Docker `livekit/livekit-server --dev`), di
`ws://127.0.0.1:7880` dengan `devkey`/`secret` (= default config dev).

## Aturan proyek

- **Fitur baru wajib test `bun test`** di pekerjaan yang sama; UI → tambah e2e di `e2e/`. Jalankan sebelum lapor.
- **Test integrasi & e2e wajib memakai LiveKit dev lokal** (`devkey`/`secret`), bukan LiveKit VPS/produksi.
- **Jangan beri `roomAdmin`** di token browser (`src/server/token.service.ts`): pemegangnya bisa menulis metadata
  room tanpa validasi (R6). Perubahan layout lewat `PUT /api/rooms/:roomId/layout` (CAS versi).
- **Role & identity dari DB/sesi**, tidak pernah dari body request (R7). `identity = user.id`.
- **Error API wajib punya `code`** stabil: pakai `apiError(code, error, path?)` di `src/server/api.error.ts`;
  tambah kode baru di `ApiErrorCode` (`src/shared/api.types.ts`) dan terjemahannya di `src/web/error.message.ts`.
- **Label UI Bahasa Indonesia terpusat** di `*.labels.ts` (`room.labels.ts`, `prejoin.labels.ts`, `stage.labels.ts`,
  `role.label.ts`), bukan literal tersebar di komponen.
- **`data-testid`** untuk elemen e2e yang tidak punya role/label aksesibel stabil (`getByTestId`); jangan memilih
  lewat kelas CSS.
- **Batas file** (aturan global Rule 8): route 150, service 300, repository 250, types 300, test 400 baris; hard
  limit 500 baris / 20.000 karakter. Pecah, jangan menambah ke file yang sudah lewat batas.
- **Migrasi**: file SQL bernomor baru di `migrations/` (`0002_<nama>.sql`), lalu tambahkan import + entri di
  `MIGRATIONS` (`src/server/db.ts`); `db.test.ts` gagal bila daftar tak sinkron. Migrasi hanya maju, idempotent.
- **Secret**: jangan membaca, mencetak, atau commit `.env` (hanya `.env.example`). `zoomin check` menampilkan
  secret sebagai "diset"/"kosong". Variabel baru → tambahkan ke `.env.example` + `src/server/config.ts`.
- **Hardcoded value**: URL/host/kredensial lewat env (`config.ts`); default dev ditandai `// test-only`.

## Dokumen RND

- `RND/spike/` — hasil spike (LiveKit server, token, multi screenshare, layout sync, load test, checklist manual).
- `RND/plan/` — arsitektur, stack, milestone; **keputusan & risiko di `RND/plan/04-risiko-keputusan.md`**
  (catat keputusan arsitektur baru di sana).
- `RND/qa/` — status rilis (`00-status-rilis.md`) dan audit UX.

## Deploy

Panduan: `deploy/README.md` (jalur Caddy + systemd, jalur single binary, dan LiveKit via Portainer + Traefik dengan
media 7882/udp + 7881/tcp). Ringkasan arsitektur yang terbukti: README §Arsitektur deploy yang terbukti.

## Dilarang tanpa izin eksplisit user

- Deploy, `git push`, publish rilis, atau menjalankan perintah di server/VPS.
- Mengubah stack LiveKit di VPS (Portainer), firewall, DNS, Traefik, atau Cloudflare Tunnel.
- Memakai kredensial LiveKit produksi untuk test.
- Merge ke `main` (kerja di branch `feature/`/`fix/`/`chore/`).
