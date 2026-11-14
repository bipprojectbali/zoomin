# 08 — Room public dengan password (spec terkunci 2026-11-14)

Disetujui user 2026-11-14 ("ya setuju" = ikut rekomendasi). Melanjutkan 06 (R1–R11) dan 07 (P1–P6). Mengikat worker.

## Keputusan

| # | Keputusan |
|---|---|
| W1 | Tipe room di API jadi tiga: `RoomVisibility = "public" \| "password" \| "private"`. Di DB **tidak** mengubah CHECK `visibility` (hindari rebuild tabel): `password` = `visibility='public'` + kolom baru `rooms.password_hash` NOT NULL. Fungsi turunan tunggal di `room.access.ts`. Private selalu `password_hash = NULL` (diset NULL saat pindah ke private). |
| W2 | Hash `Bun.password.hash` (argon2id, bawaan Bun). Host tidak bisa melihat password lama; UI menampilkan + tombol salin **sekali** saat dibuat/diubah. Password 6–64 karakter (trim tidak diterapkan; spasi dihitung). Tombol "Buat acak" di UI (10 karakter, alfabet tanpa karakter ambigu, `crypto.getRandomValues`). |
| W3 | Masuk dengan password → user jadi **anggota permanen** `participant` (UPSERT yang hanya menaikkan role, sama dengan accept undangan). Host/admin+/anggota tidak pernah ditanya. Ganti password tidak mengeluarkan anggota lama. |
| W4 | Room password bisa dimasuki lewat **link undangan atau ID room** (`/rooms/:roomId`), keduanya + password. Room `public` tanpa password tetap wajib link (perilaku lama). Room private tetap R1. |
| W5 | Endpoint `POST /api/rooms/:roomId/join { password }` (sesi wajib): room harus ada & `active` (403 `room_inactive`/`room_expired`), tipe `password` (selain itu 403 `forbidden`/`room_private`), password salah → 403 `password_invalid` (pesan seragam). Rate limit per `userId:roomId` 5 percobaan/menit → 429 `rate_limited` + `retry-after`. Sukses → `{ roomId, role }` (RoomRole efektif) + audit TIDAK perlu (bukan aksi admin). Jangan log password. |
| W6 | Token `POST /rooms/:roomId/token` untuk non-anggota di room password → 403 `password_required` (UI menampilkan form password). Invite preview: tambah `passwordRequired: boolean` (true bila tipe password dan pemanggil bukan anggota). Invite accept: room password + bukan anggota → body wajib `password` (salah → `password_invalid`, kosong → `password_required`), rate limit sama dengan W5. |
| W7 | Set/ganti/hapus password: `POST /api/rooms` (`visibility:"password"` wajib `password`), `PATCH /api/rooms/:roomId` (`visibility:"password"` + `password` = set/ganti; `visibility:"password"` tanpa `password` saat sudah password = tidak berubah; ke `public`/`private` = hapus hash). Hanya pengelola (R3). Audit `room.password` dengan detail `{ action: "set" \| "change" \| "clear" }` (tanpa isi). `RoomSummary` TIDAK pernah membawa hash/password. |
| W8 | UI: toggle tiga pilihan Public / Password / Private (form buat room + tab Umum), kolom password (tampilkan/sembunyikan, Buat acak, salin); di tab Umum tombol "Ganti password". Kartu room: badge "Password" (ikon kunci-bulat). Halaman undangan & RoomPage: form "Room ini dilindungi password" saat `passwordRequired`/`password_required`. Lobby: kolom "Gabung dengan ID room" → navigasi `/rooms/:id`. Label di `*.labels.ts`, kode error baru diterjemahkan di `error.message.ts`. |

## Migrasi `migrations/0005_room_password.sql`

```sql
-- Kenapa: room public ber-password (RND/plan/08). NULL = tanpa password (perilaku lama).
ALTER TABLE rooms ADD COLUMN password_hash TEXT;
```

## Kontrak tipe

```ts
export type RoomVisibility = "public" | "password" | "private";
export type CreateRoomBody = { ...; visibility?: RoomVisibility; password?: string };   // password wajib bila visibility "password"
export type UpdateRoomBody = { ...; visibility?: RoomVisibility; password?: string };
export type JoinRoomBody = { password: string };
export type JoinRoomResponse = { roomId: string; role: RoomRole };
// InvitePreview + passwordRequired: boolean; AcceptInviteBody + password?: string
export const ROOM_PASSWORD_MIN = 6; export const ROOM_PASSWORD_MAX = 64;
// ApiErrorCode + "password_required" | "password_invalid"; AuditAction + "room.password"
```

## Kepemilikan file

- **wkr-pw-server**: `src/shared/api.types.ts` (PERTAMA), `migrations/0005_room_password.sql` + `db.ts`, `room.access.ts`, `room.service.ts`, `rooms.repository.ts`, `rooms.route.ts`, `rooms.manage.route.ts`, `room.join.route.ts` (baru) + mount `api.ts`, `token.route.ts`, `auth.invite.route.ts`, `src/web/error.message.ts`, `src/web/dev/dev.labels.ts` (label audit), test server, README §API, CHANGELOG, CLAUDE.md (migrasi berikutnya 0006).
- **wkr-pw-web**: `src/web/api.client.ts`, `src/web/room-settings/**` (VisibilityToggle, GeneralTab, RoomBadges), `src/web/lobby/**`, `src/web/pages/InvitePage.tsx`, `src/web/pages/RoomPage.tsx`, `src/web/room/**` (form password sebelum join), komponen baru `src/web/room-password/**`, unit test web.
- **wkr-pw-e2e** (setelah keduanya): `e2e/room-password.spec.ts`.
