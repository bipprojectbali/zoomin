# CLAUDE.md — zoomin

Panduan untuk agen AI di repo ini. Aturan global user (`~/.claude/CLAUDE.md`) tetap berlaku; file ini menambah
konvensi khusus proyek. Detail pakai/deploy: `README.md`, `deploy/README.md`.

## Proyek

Ruang meeting self-hosted di atas LiveKit. Pembeda: satu peserta bisa membagikan **beberapa layar sekaligus**, dan
host room mengatur layout panggung (template, drag-drop, resize, fokus) yang sama untuk semua penonton. Fitur lain:
login Google (Better Auth) + profil, peran global `user`/`admin`/`super_admin`, panel `/admin` dan `/dev` (audit log,
domain email, health), landing publik `/` (lobby di `/app`), room public/private (anggota diundang lewat email, undangan
tertunda bagi email tanpa akun), aktif/nonaktif + kadaluarsa room, dialog Pengaturan room, undangan per peran room
(`host`/`participant`/`viewer`), pre-join, daftar peserta, toast, banner koneksi, rate limit, build produksi, single
binary + CLI (`zoomin user` darurat), proxy signaling opsional `/livekit`. Spec auth: `RND/plan/05-auth-roles.md`;
spec akses room: `RND/plan/06-room-access.md`.

Status: app terbukti jalan lewat Cloudflare Tunnel + LiveKit 1.13.11 di VPS (stack Portainer
`deploy/livekit-compose.yml`). Versi rilis = `version` di `package.json` + `CHANGELOG.md`.

## Stack

- Runtime **Bun 1.4.2** (wajib Bun/TypeScript, bukan Node), TypeScript `^7.0.2`, ESM.
- Server: Elysia `^1.4.32`, SQLite `bun:sqlite`, `livekit-server-sdk` `^2.19.3`, **`better-auth` `^1.7.23`**
  (Google OAuth + plugin admin, DB = `bun:sqlite` yang sama; skema dari migrasi SQL, bukan CLI Better Auth).
- Web: React `^19.3.1` SPA di-bundle Bun (HTML import), `react-router` `^8.5.1`, `livekit-client` `^2.24.0`,
  `@livekit/components-react`, Tailwind `^4.3.5` (`bun-plugin-tailwind`), radix-ui/shadcn (`src/web/components/ui`),
  `@dnd-kit/react` **0.5.3 dipin exact** (R11), `react-resizable-panels`, `sonner`.
- Test: `bun test`; e2e Playwright `^1.65.1`; `@livekit/rtc-node` untuk media sintetis di test integrasi.
- LiveKit server 1.13.11.

## Peta folder

```
src/server/   API Elysia: auth.better (Better Auth), auth.guard (sesi → peran), auth.me/invite/test route, admin.*, dev.*,
              audit.*, settings.*, rooms, token, layout, livekit.proxy, static.serve, config, db
src/shared/   kontrak API (api.types.ts), model layout, room id, konvensi nama track (screen-<n>)
src/web/      SPA: pages/, landing/, app/ (header, guard), lobby/, prejoin/, room/, stage/ (layout), settings/,
              admin/, dev/, components/ui/; auth.client.ts (klien Better Auth)
src/cli/      CLI single binary (args, help, docs, check, run); entrypoint tetap src/server/main.ts
scripts/      build.web.ts (SPA → dist/web), build.binary.ts (→ bin/)
migrations/   SQL bernomor: 0001_init, 0002_auth (tabel Better Auth + peran room host), 0003_admin (audit_log, app_settings),
              0004_room_access (visibility, disabled_at, expires_at, room_invitations), 0005_room_password (password_hash)
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
bun run test:e2e         # Playwright (server dev :3101 + prod :3102); sekali: bunx --bun playwright install chromium
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
- **E2e terisolasi dari `.env`**: server e2e jalan dengan `bun --no-env-file` dan semua variabel config diset
  eksplisit di `playwright.config.ts` (`BASE_ENV`); env baru → tambahkan juga di sana. Login e2e lewat helper
  `e2e/fixtures.ts` (test login), build prod e2e ke folder sementara (`WEB_DIST_DIR`), bukan `dist/web`.
- **Jangan beri `roomAdmin`** di token browser (`src/server/token.service.ts`): pemegangnya bisa menulis metadata
  room tanpa validasi (R6). Perubahan layout lewat `PUT /api/rooms/:roomId/layout` (CAS versi).
- **Role & identity dari sesi Better Auth**, tidak pernah dari body request (R7). `identity = user.id`. Route membaca
  sesi lewat `src/server/auth.guard.ts` (macro Elysia `{ auth: "user" | "admin" | "super_admin" }`, atau
  `getSessionState`/`requireRole`): 401 tanpa sesi, 403 `banned`, 403 `insufficient_role`. Peran room dari
  `room_members`; admin/super_admin global tanpa keanggotaan diperlakukan `host`.
- **Aturan peran (A4/A5, `RND/plan/05-auth-roles.md`)**: `super_admin` HANYA dari env `SUPER_ADMIN_EMAILS`
  (disinkronkan tiap login di `auth.better.ts`), tidak pernah bisa diset lewat UI/API/CLI. `admin` diangkat/diturunkan
  hanya oleh super_admin (`PUT /api/dev/users/:id/role`). Admin hanya mengelola akun `user`; super_admin mengelola
  `user` + `admin`; tidak ada yang menyasar diri sendiri atau super_admin (`admin.service.ts`).
- **Jangan buka plugin admin Better Auth lewat HTTP**: `/api/auth/admin/*` diblok di `api.ts` karena tidak menegakkan
  A5. Aksi admin lewat `/api/admin/*` / `/api/dev/*` yang memanggil `auth.api.*` dari server.
- **Pengelola room** (host room ATAU admin/super_admin global) dicek HANYA lewat `canManageRoom` di
  `src/server/room.access.ts` (juga `roomStatus`/`getRoomAccess`); jangan tulis cek host manual di route.
- **Enforcer room** (`room.enforcer.ts`, tiap 60 s) hanya menutup room LiveKit yang ADA di DB dan berstatus non-active;
  room yang tak dikenal DB dibiarkan (LiveKit bisa dipakai bersama instance lain, E2E-04). Token yang sudah terbit
  bisa bergabung ulang ≤60 s sebelum ditendang lagi (ponytail, R6 di `06-room-access.md`).
- **Audit wajib** untuk setiap aksi admin/dev (ban, unban, hapus, ubah peran, revoke sesi, buat/hapus room, ubah
  setting, plus aksi pengelola room: tipe, aktif/nonaktif, kadaluarsa, anggota) lewat `recordAudit` (`audit.repository.ts`); aksi admin baru tanpa entri audit = bug.
- **Login test-only** `POST /api/test/login` (A12): hanya aktif bila `ZOOMIN_TEST_AUTH=1` DAN bukan production;
  e2e/test tidak pernah memanggil Google. Test `prod` membuktikan 404 di production; jangan longgarkan guard ini.
- **Error API wajib punya `code`** stabil: pakai `apiError(code, error, path?)` di `src/server/api.error.ts`;
  tambah kode baru di `ApiErrorCode` (`src/shared/api.types.ts`) dan terjemahannya di `src/web/error.message.ts`.
- **Label UI Bahasa Indonesia terpusat** di `*.labels.ts` (`room.labels.ts`, `prejoin.labels.ts`, `stage.labels.ts`,
  `role.label.ts`), bukan literal tersebar di komponen.
- **`data-testid`** untuk elemen e2e yang tidak punya role/label aksesibel stabil (`getByTestId`); jangan memilih
  lewat kelas CSS.
- **Batas file** (aturan global Rule 8): route 150, service 300, repository 250, types 300, test 400 baris; hard
  limit 500 baris / 20.000 karakter. Pecah, jangan menambah ke file yang sudah lewat batas.
- **Password room** (RND/plan/08): di-hash `Bun.password` (argon2id) di `rooms.password_hash`; tidak pernah di-log,
  diaudit isinya, atau dikembalikan API (`RoomSummary` hanya `visibility: "password"`, `ROOM_COLUMNS` memilih flag
  `has_password`). Tipe API turunan satu fungsi `roomVisibility` (`room.access.ts`). Percobaan join/accept dibatasi
  per `userId:roomId` (`room.password.ts`).
- **Migrasi**: file SQL bernomor baru di `migrations/` (berikutnya `0006_<nama>.sql`), lalu tambahkan import + entri di
  `MIGRATIONS` (`src/server/db.ts`); `db.test.ts` gagal bila daftar tak sinkron. Migrasi hanya maju, idempotent.
- **Secret**: jangan membaca, mencetak, atau commit `.env` (hanya `.env.example`). `zoomin check` menampilkan
  secret sebagai "set"/"empty". Variabel baru → tambahkan ke `.env.example` + `src/server/config.ts`
  (`src/cli/cli.docs.test.ts` gagal bila tak sinkron). Tabel Better Auth (`user`, `session`, `account`) berisi email
  dan token: jangan log isinya (pakai user id).
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
