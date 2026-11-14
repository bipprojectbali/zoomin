# 06 — Room public/private, status aktif, kadaluarsa, anggota (spec terkunci 2026-11-14)

Disetujui user 2026-11-14 ("ikut rekomendasi"). Kontrak di sini mengikat semua worker; perubahan hanya lewat orkestrator.
Melanjutkan `05-auth-roles.md` (A1–A14 tetap berlaku).

## Keputusan

| # | Keputusan |
|---|---|
| R1 | `rooms.visibility` = `public` (default, perilaku sekarang: siapa pun yang login + memegang link undangan) atau `private` (link undangan DITOLAK; masuk hanya bila sudah anggota). |
| R2 | Anggota ditambah lewat **email** (public maupun private). Email milik user yang sudah ada → langsung `room_members`. Belum punya akun → baris **pending** di `room_invitations`, diklaim otomatis saat user dengan email itu dibuat/login (hook Better Auth `session.create` yang sudah ada, sama tempat sinkron super_admin) lalu baris pending dihapus. Email dinormalisasi `trim().toLowerCase()`. Allowlist domain (`app_settings.allowed_email_domains`) ditegakkan → 400 `email_domain_not_allowed`. |
| R3 | **Pengelola room** = host room (anggota ber-role `host`) ATAU admin/super_admin global. Satu fungsi `canManageRoom(db, user, roomId)` di `room.access.ts` dipakai semua route (ganti cek host manual di `auth.invite.route.ts` dan `layout.route.ts`). |
| R4 | Public → private: anggota lama tetap; link undangan lama otomatis ditolak (cek visibility saat preview/accept, bukan di token undangan). Private → public: link kembali berlaku; pending invitation tetap. |
| R5 | Status room: `rooms.disabled_at` (null = aktif) dan `rooms.expires_at` (ms epoch, null = tanpa batas, **default tanpa batas**). Status turunan server: `inactive` bila disabled, else `expired` bila `expires_at <= now`, else `active`. Room non-active: token 403 (`room_inactive` / `room_expired`), preview/accept undangan juga ditolak dengan kode sama. Pengelola tetap bisa membuka pengaturan. Data (layout, anggota) tidak dihapus. |
| R6 | Nonaktifkan → langsung `roomService.deleteRoom(roomId)` (semua peserta terputus; gagal LiveKit = warn). Kadaluarsa ditegakkan oleh **enforcer** `room.enforcer.ts`: interval 60 s, `roomService.listRooms()` (room live saja), untuk tiap room live yang **ada di DB** dan tidak `active` → `deleteRoom`. Room yang tidak ada di DB dibiarkan
(revisi E2E-04: LiveKit bisa dipakai bersama instance/app lain; room yang dihapus sudah ditutup saat `deleteRoom`). Dimulai di `main.ts`/serve, dihentikan saat shutdown; tidak dijalankan di test kecuali dipanggil manual (`runEnforcerOnce(deps)` diekspor untuk test). Komentar `ponytail:`: token yang sudah terbit (TTL 2 jam) bisa bergabung ulang ≤60 s sebelum ditendang lagi. |
| R7 | Perpanjang = set `expiresAt` baru (> now, ≤ now + 365 hari) atau `null`. Mengaktifkan/memperpanjang room kadaluarsa membuatnya aktif lagi (status murni turunan). UI tombol cepat: +1 hari, +7 hari, +30 hari dihitung dari `max(now, expiresAt)`, plus "Tanpa batas" dan pilih tanggal (`<input type="datetime-local">`). |
| R8 | Hapus room: host room atau admin+ (`DELETE /api/rooms/:roomId`). Logika hapus dipindah ke `room.service.ts#deleteRoom` dan dipakai juga oleh `DELETE /api/admin/rooms/:id`. Konfirmasi UI: ketik ID room. |
| R9 | Anggota: ubah role, keluarkan (juga `removeParticipant` LiveKit bila sedang di room, gagal = warn), batalkan pending. Tidak boleh menurunkan/mengeluarkan **host terakhir** → 409 `last_host`. |
| R10 | Audit (A8) semua aksi baru. AuditAction baru: `room.update` (judul), `room.visibility`, `room.activate`, `room.deactivate`, `room.expiry`, `room.member.add`, `room.member.role`, `room.member.remove`. Detail tanpa email user lain? → boleh email target di `detail` (audit hanya dibaca super_admin), JANGAN di console log. |
| R11 | `AdminRoomSummary.active` (live di LiveKit) di-rename `live` agar tidak bentrok dengan status. |

## Migrasi `migrations/0004_room_access.sql`

```sql
-- Kenapa: mode public/private, aktif/nonaktif, dan kadaluarsa room (RND/plan/06). Default = perilaku lama.
ALTER TABLE rooms ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','private'));
ALTER TABLE rooms ADD COLUMN disabled_at INTEGER;
ALTER TABLE rooms ADD COLUMN expires_at INTEGER;
CREATE TABLE IF NOT EXISTS room_invitations (
  room_id    TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  email      TEXT NOT NULL,              -- lowercase
  role       TEXT NOT NULL CHECK (role IN ('host','participant','viewer')),
  invited_by TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (room_id, email)
);
CREATE INDEX IF NOT EXISTS idx_room_invitations_email ON room_invitations(email);
```
(Runner `schema_migrations` menjamin sekali jalan; ALTER tidak punya IF NOT EXISTS di SQLite.) Daftarkan di `MIGRATIONS`.

## Kontrak tipe (`src/shared/api.types.ts`)

```ts
export type RoomVisibility = "public" | "private";
export type RoomStatus = "active" | "inactive" | "expired";
// RoomSummary bertambah:
//   visibility: RoomVisibility; status: RoomStatus; expiresAt: number | null; canManage: boolean;
export type CreateRoomBody = { id: string; title: string; visibility?: RoomVisibility; expiresAt?: number | null };
export type UpdateRoomBody = { title?: string; visibility?: RoomVisibility; enabled?: boolean; expiresAt?: number | null };
export type RoomMemberItem =
  | { kind: "member"; userId: string; name: string; email: string; image: string | null; role: RoomRole }
  | { kind: "pending"; email: string; role: RoomRole; invitedAt: number };
export type AddRoomMemberBody = { email: string; role: RoomRole };
export type UpdateRoomMemberBody = { role: RoomRole };
export type AdminRoomSummary = RoomSummary & { members: number; live: boolean; participants: number }; // R11
```
Batas: `ROOM_EXPIRY_MAX_DAYS = 365` (konstanta bernama, diekspor dari api.types). Kode error baru: `room_inactive`,
`room_expired`, `room_private`, `last_host`, `member_not_found` (+ terjemahan di `src/web/error.message.ts`).

## Endpoint

| Method & path | Akses | Respons |
|---|---|---|
| `POST /api/rooms` (+`visibility`, `expiresAt`) | admin+ | `RoomSummary` (expiresAt di luar (now, now+365d] → 400 `invalid_input`) |
| `GET /api/rooms`, `GET /api/rooms/:roomId` | seperti sekarang | `RoomSummary` dengan field baru |
| `PATCH /api/rooms/:roomId` `UpdateRoomBody` | pengelola (R3) | `RoomSummary`; `enabled:false` → deleteRoom LiveKit |
| `DELETE /api/rooms/:roomId` | pengelola | 204 |
| `GET /api/rooms/:roomId/members?limit=&cursor=` | pengelola | `Page<RoomMemberItem>` (member dulu urut nama, lalu pending urut email; limit default 50 max 200) |
| `POST /api/rooms/:roomId/members` `AddRoomMemberBody` | pengelola | 201 `RoomMemberItem` (user ada → member, role di-set persis; belum ada → pending) |
| `PATCH /api/rooms/:roomId/members/:userId` `UpdateRoomMemberBody` | pengelola | `RoomMemberItem` / 404 `member_not_found` / 409 `last_host` |
| `DELETE /api/rooms/:roomId/members/:userId` | pengelola | 204 / 409 `last_host` |
| `DELETE /api/rooms/:roomId/invitations/:email` | pengelola | 204 / 404 `member_not_found` |
| `POST /api/rooms/:roomId/token` | anggota / admin+ | + 403 `room_inactive`/`room_expired` (berlaku juga untuk admin; pengelola mengaktifkan dulu) |
| `GET /api/invites/preview`, `POST /api/invites/accept` | seperti sekarang | + 403 `room_private` (kecuali pemanggil sudah anggota) / `room_inactive` / `room_expired` |
| `POST /api/rooms/:roomId/invites` | pengelola | room private → 403 `room_private` (UI menyembunyikan link di room private) |

Non-pengelola memanggil endpoint pengelola → 403 `forbidden`; room tak ada → 404 `room_not_found`.

## UI

- **Buat room** (`CreateRoomForm`): segmented control "Public / Private" di bawah judul dengan deskripsi singkat
  (Public: "Siapa pun yang punya link undangan bisa masuk" · Private: "Hanya orang yang Anda undang lewat email");
  "Opsi lanjutan": ID room + "Kadaluarsa" (Tanpa batas default / 1 hari / 7 hari / 30 hari / tanggal).
- **Kartu room** (`RoomCard`): badge Private (ikon gembok), badge status Nonaktif/Kadaluarsa (Masuk di-disable dengan
  tooltip alasan), teks "Berakhir <tanggal>" bila ada. Pengelola: menu ⋯ (DropdownMenu) → Pengaturan, Undang, Hapus.
  Di room private, "Undang" membuka tab Anggota (bukan link).
- **Dialog/Sheet "Pengaturan room"** (`src/web/room-settings/**`, dipakai lobby DAN `/admin`): tab Umum (judul, tipe),
  Anggota (form email+role, daftar member & pending dengan Select role dan tombol keluarkan/batalkan; paginasi
  "Muat lagi"), Status (Switch aktif, kadaluarsa + tombol cepat), Zona bahaya (hapus, ketik ID room).
  Mengubah ke private menampilkan konfirmasi "Link undangan yang sudah dibagikan tidak berlaku lagi".
- `/admin` RoomsPanel: kolom Tipe & Status, kolom live pakai `live`, aksi "Pengaturan" membuka dialog yang sama.
- Label Indonesia di `room-settings.labels.ts`; `data-testid` untuk elemen e2e.

## Kepemilikan file

**Gelombang 1 (server, paralel)**
- **wkr-room-core**: `src/shared/api.types.ts`, `migrations/0004_room_access.sql`, `src/server/db.ts`,
  `rooms.repository.ts` (pecah bila >250 baris), `rooms.route.ts` (PATCH/DELETE; pecah ke `rooms.manage.route.ts` bila
  >150), `room.access.ts` (baru: `canManageRoom`, `roomStatus`, `getRoomAccess`), `room.service.ts` (baru: update,
  delete, kick), `room.enforcer.ts` (baru), `token.route.ts`, `auth.invite.route.ts`, `layout.route.ts` (cek host →
  `canManageRoom`), `admin.service.ts`/`admin.route.ts` (delete delegasi + rename `live`), `main.ts`/`server.hooks.ts`
  (start/stop enforcer), `src/web/error.message.ts` (kode baru), `src/web/admin/RoomsPanel.tsx` HANYA rename
  `active`→`live`, test semua file tsb. Tulis tipe di api.types.ts PERTAMA (worker lain bergantung).
- **wkr-room-members**: `src/server/room.members.repository.ts`, `room.members.route.ts`, `room.invitations.claim.ts`
  (fungsi `claimPendingInvitations(db, userId, email)`), test-nya, + pemasangan route di `api.ts` dan pemanggilan claim
  di hook `auth.better.ts` (hanya baris pemanggilan). Pakai `canManageRoom` dari `room.access.ts` (dibuat wkr-room-core;
  bila belum ada saat mulai, tunggu/koordinasi lewat import nama yang sama).

**Gelombang 2 (web)** — **wkr-web-room-settings**: `src/web/api.client.ts`, `src/web/lobby/**`,
`src/web/room-settings/**` (baru), `src/web/admin/RoomsPanel.tsx`, `src/web/pages/LobbyPage.tsx`, unit test web.

**Gelombang 3** — **wkr-e2e-room-access**: `e2e/room-access.spec.ts` (+ fixture bila perlu). Docs (README §fitur,
CHANGELOG `[Unreleased]`, `RND/plan/04` keputusan) oleh orkestrator-delegasi satu worker di akhir.
