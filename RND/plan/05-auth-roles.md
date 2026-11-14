# 05 — Login Google, peran global, admin, /dev, landing (spec terkunci 2026-11-14)

Disetujui user 2026-11-14. Semua worker membaca file ini; kontrak di sini mengikat. Perubahan kontrak hanya lewat
orkestrator.

## Keputusan

| # | Keputusan |
|---|---|
| A1 | Autentikasi: **Better Auth** stabil terbaru (1.7.x, bukan beta), satu-satunya metode login: **Google OAuth**. Login password admin (`ADMIN_PASSWORD`, `/api/auth/admin-login`) **dihapus**. |
| A2 | Semua akun Google boleh login (sign-up terbuka). User baru = peran `user`, hanya bisa masuk room yang mengundangnya. Pembatasan domain email = setting `/dev` (A9). |
| A3 | **Dua lapis peran.** Global (akun): `user` · `admin` · `super_admin`. Room: `host` · `participant` · `viewer` (`host` menggantikan peran room `admin`). |
| A4 | `super_admin` HANYA dari env `SUPER_ADMIN_EMAILS` (koma, case-insensitive, trim). Disinkronkan setiap login/sesi dibuat: email ada di daftar → `super_admin`; super_admin yang emailnya dihapus dari daftar → turun ke `user`. Tidak bisa diberikan/dicabut lewat UI/API. |
| A5 | `admin` diangkat/diturunkan hanya oleh `super_admin` (UI `/dev`). Admin TIDAK bisa mengubah peran siapa pun, tidak bisa ban/hapus admin lain maupun super_admin. Tidak ada yang bisa ban/hapus diri sendiri. |
| A6 | Ban = plugin admin Better Auth (alasan + masa berlaku opsional). Efek: sesi dicabut, dan **dikeluarkan dari semua room LiveKit aktif** (`RoomServiceClient.removeParticipant` untuk tiap room di mana identity hadir). Hapus user = hard delete dengan konfirmasi; UI menawarkan ban lebih dulu. |
| A7 | Buat room: `admin` & `super_admin` (global). Pembuat room menjadi `host`. `user` tidak bisa membuat room. Admin/super_admin global yang membuka room tanpa keanggotaan diperlakukan `host`. |
| A8 | Audit log wajib untuk aksi admin/dev (ban, unban, hapus, ubah peran, ubah setting, buat/hapus room, revoke sesi). |
| A9 | Setting proyek di DB (`app_settings`): `allowed_email_domains` (kosong = semua). Ditegakkan saat login (hook Better Auth, tolak dengan pesan jelas). |
| A10 | Rute: `/` landing publik · `/login` · `/app` lobby (dulu `/`) · `/rooms/:roomId` · `/invite/:invite` · `/settings` profil · `/admin` (admin+super_admin) · `/dev` (super_admin) · `*` 404. |
| A11 | Jalan darurat: CLI `zoomin user list`, `zoomin user promote <email> --role admin|user`, `zoomin user unban <email>` (langsung ke DB, hanya di server). |
| A12 | E2E/test tidak memanggil Google. Jalur login test-only: endpoint `POST /api/test/login {email, name}` aktif HANYA bila `NODE_ENV !== "production"` DAN env `ZOOMIN_TEST_AUTH=1`; membuat/mengambil user Better Auth dan sesi asli (cookie Better Auth sama). Test wajib membuktikan endpoint 404 di production. |
| A13 | Data user lama (tamu tanpa akun) tidak dimigrasikan (data uji). Migrasi tetap lewat file SQL bernomor, idempotent, dengan komentar alasan. |
| A14 | `BETTER_AUTH_URL` default = `PUBLIC_APP_URL` (dan sebaliknya bila hanya satu diisi) agar tidak drift. Redirect URI Google: `<BETTER_AUTH_URL>/api/auth/callback/google`. |

## Env baru (config.ts)

| Var | Wajib prod | Default dev |
|---|---|---|
| `BETTER_AUTH_SECRET` | ya (≥32) | kunci dev bawaan (test-only) |
| `BETTER_AUTH_URL` | tidak (fallback `PUBLIC_APP_URL`) | — |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | ya | kosong → tombol Google menampilkan "belum dikonfigurasi" di dev |
| `SUPER_ADMIN_EMAILS` | tidak (tanpa super_admin = peringatan di log) | kosong |
| `ZOOMIN_TEST_AUTH` | — (ditolak/diabaikan di production) | kosong |

Dihapus: `ADMIN_PASSWORD`, `SESSION_SECRET` (diganti `BETTER_AUTH_SECRET`; sesi lama tak berlaku — catat di CHANGELOG).

## Kontrak tipe (`src/shared/api.types.ts`)

```ts
export type GlobalRole = "user" | "admin" | "super_admin";
export type RoomRole = "host" | "participant" | "viewer";        // pengganti `Role` (hapus alias lama setelah migrasi)
export type SessionUser = { id: string; name: string; email: string; image: string | null; role: GlobalRole };
export type AdminUser = SessionUser & { banned: boolean; banReason: string | null; banExpires: number | null; createdAt: number; lastActiveAt: number | null };
export type AuditEntry = { id: string; at: number; actorId: string; actorEmail: string; action: AuditAction; targetType: "user" | "room" | "setting" | "session"; targetId: string; detail: Record<string, unknown> };
export type AuditAction = "user.ban" | "user.unban" | "user.delete" | "user.role" | "user.sessions.revoke" | "room.create" | "room.delete" | "setting.update";
export type AppSettings = { allowedEmailDomains: string[] };
export type SystemHealth = { version: string; bun: string; uptimeSec: number; nodeEnv: string; livekit: { url: string; ok: boolean; latencyMs: number | null; error: string | null }; db: { users: number; rooms: number; activeRooms: number; sizeBytes: number | null }; superAdminEmailsConfigured: number };
export type ProfileUpdateBody = { name?: string; image?: string | null };   // name 1–60 trim; image URL https atau null (pakai foto Google)
export type BanUserBody = { reason: string; expiresInHours?: number };      // reason 3–200; tanpa expires = permanen
export type SetRoleBody = { role: "user" | "admin" };                      // super_admin tidak bisa diset via API
```
Kode error baru: `banned`, `email_domain_not_allowed`, `cannot_modify_self`, `insufficient_role`, `user_not_found`.

## Endpoint

Auth (Better Auth, dipasang di `/api/auth/*` — handler Better Auth): `GET /api/auth/sign-in/social` dll. sesuai Better Auth.

| Method & path | Akses | Respons |
|---|---|---|
| `GET /api/me` | sesi | `{ user: SessionUser }` / 401 / 403 `banned` |
| `PATCH /api/me` `ProfileUpdateBody` | sesi | `{ user }` |
| `GET /api/me/sessions` | sesi | `{ items: { id, current, userAgent, ip, createdAt, expiresAt }[] }` |
| `DELETE /api/me/sessions/:id` · `DELETE /api/me/sessions` (selain current) | sesi | 204 |
| `DELETE /api/me` | sesi (bukan super_admin) | 204 (hapus akun sendiri; super_admin → 403) |
| `GET /api/admin/users?q=&role=&banned=&limit=&cursor=` | admin+ | `Page<AdminUser>` |
| `POST /api/admin/users/:id/ban` `BanUserBody` | admin+ (target harus `user`; super_admin boleh target admin) | `{ user: AdminUser }` |
| `POST /api/admin/users/:id/unban` | sama | `{ user }` |
| `DELETE /api/admin/users/:id` | sama | 204 |
| `POST /api/admin/users/:id/sessions/revoke` | sama | 204 |
| `GET /api/admin/rooms?limit=&cursor=` | admin+ | `Page<RoomSummary & { members: number; active: boolean; participants: number }>` |
| `DELETE /api/admin/rooms/:id` | admin+ | 204 (hapus room DB + `deleteRoom` LiveKit) |
| `PUT /api/dev/users/:id/role` `SetRoleBody` | super_admin | `{ user: AdminUser }` |
| `GET /api/dev/health` | super_admin | `SystemHealth` |
| `GET /api/dev/audit?action=&actorId=&limit=&cursor=` | super_admin | `Page<AuditEntry>` |
| `GET /api/dev/settings` · `PUT /api/dev/settings` `AppSettings` | super_admin | `AppSettings` |
| `GET /api/dev/config` | super_admin | ringkasan config non-rahasia (pakai `summarizeConfig`) |

Endpoint lama: `POST /api/rooms` → admin+ (403 `insufficient_role` untuk user). `POST /api/invites/accept` → wajib sesi (401), body hanya `{ invite }`. `GET /api/invites/preview` tetap publik + `currentUser`. Undangan `role` memakai `RoomRole`.

## Skema (migrasi)

- `0002_auth.sql` (wkr-auth-core): tabel Better Auth (`user`, `session`, `account`, `verification`) termasuk kolom plugin admin (`role`, `banned`, `banReason`, `banExpires`, `impersonatedBy`) — **verifikasi nama kolom/tabel dari skema Better Auth versi terpasang** (`npx @better-auth/cli generate` atau `getAuthTables`), DROP tabel `users` lama + FK `rooms.created_by` & `room_members.user_id` diarahkan ke `user(id)`; `room_members.role` CHECK menjadi `('host','participant','viewer')` dengan data `admin`→`host`. SQLite tidak bisa ALTER CHECK → rebuild tabel (create new, copy, drop, rename) dalam transaksi. Tambah kolom `user.display_name`? → TIDAK: pakai `user.name` (dari Google saat pertama, bisa diubah) dan `user.image`.
- `0003_admin.sql` (wkr-server-admin): `audit_log(id TEXT PK, at INTEGER, actor_id TEXT, actor_email TEXT, action TEXT, target_type TEXT, target_id TEXT, detail_json TEXT)` + index `(at)`, `(action, at)`, `(actor_id, at)`; `app_settings(key TEXT PK, value_json TEXT NOT NULL, updated_at INTEGER, updated_by TEXT)`.

## Kepemilikan file per gelombang

Gelombang 1 (paralel): **wkr-auth-core** — `package.json`/`bun.lock` (better-auth), `src/server/auth.*` (ganti `auth.session.ts`, `auth.route.ts`, `auth.invite*`), `src/server/config.ts`, `db.ts`, `migrations/0002_auth.sql`, `src/server/main.ts`, `api.ts`, `api.deps.ts`, `api.error.ts`, `src/shared/api.types.ts`, `src/web/api.client.ts`, `src/web/auth.client.ts` (baru), `src/cli/**` (perintah `user`), token/rooms/layout route + repository (rename `host`, role global), test server terkait. **wkr-landing** — `src/web/landing/**` saja (komponen `LandingPage` default export, tanpa wiring rute).

Gelombang 2 (setelah kontrak): **wkr-server-admin** (`src/server/admin.*`, `audit.*`, `settings.*`, `migrations/0003_admin.sql`, entri MIGRATIONS di db.ts), **wkr-server-dev** (`src/server/dev.*`), **wkr-web-auth** (`main.tsx`, `session.context.tsx`, `pages/LoginPage`, `InvitePage`, `pages/SettingsPage`, `src/web/settings/**`, `src/web/app/**` header/user menu, guard), **wkr-web-admin** (`src/web/admin/**`, `pages/AdminPage`), **wkr-web-dev** (`src/web/dev/**`, `pages/DevPage`), **wkr-web-rooms** (lobby, room, stage, prejoin, labels: rename `host`).

Gelombang 3: e2e (`e2e/**`), QA browser, docs (`README.md`, `CLAUDE.md`, `.env.example`, `CHANGELOG.md`, `RND/plan/04`).
