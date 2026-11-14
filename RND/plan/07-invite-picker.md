# 07 — Pemilih undangan (akun terdaftar + email manual) (spec terkunci 2026-11-14)

Disetujui user 2026-11-14. Melanjutkan `06-room-access.md` (R1–R11 tetap). Mengikat semua worker.

## Keputusan

| # | Keputusan |
|---|---|
| P1 | Satu komponen combobox "Undang orang" dipakai di form buat room (tampil saat Private dipilih; opsional juga untuk Public) dan di tab Anggota. |
| P2 | Ketik ≥2 huruf → saran akun terdaftar (foto, nama, email). Teks berbentuk email yang tidak ada di saran → opsi "Undang <email>" (jadi pending, diklaim saat login — mekanisme R2 yang sudah ada). Tempel banyak email (pisah koma/spasi/baris baru) → semua jadi chip; yang tidak valid ditandai dan tidak dikirim. |
| P3 | Tiap chip punya peran (default `participant`) dan tombol hapus; duplikat (case-insensitive) diabaikan; email diri sendiri diabaikan (pembuat otomatis host). |
| P4 | Pencarian akun `GET /api/users/search?q=&limit=` — akses: admin/super_admin global ATAU user yang menjadi `host` di minimal satu room; selain itu 403 `insufficient_role`. `q` trim 2–100 karakter (kurang → 400 `invalid_input`), cocok prefix/substring nama atau email (LIKE ber-ESCAPE, case-insensitive), limit default 8 max 10, **tanpa** user banned, urut nama. Respons `{ items: UserSearchItem[] }` (tanpa paginasi: hasil dibatasi limit — sengaja, ini autocomplete). Rate limit per user/IP seperti limiter yang sudah ada (mis. 30/menit) → 429 `rate_limited`. Tidak dicatat di audit (baca saja), tidak log q/email. |
| P5 | `POST /api/rooms` menerima `members?: AddRoomMemberBody[]` (maks 100; email dinormalisasi; allowlist domain ditegakkan → 400 `email_domain_not_allowed` dengan path `/members/<i>/email`). Room + host + semua anggota/pending dibuat dalam **satu transaksi** (gagal satu = tidak ada yang dibuat). Audit `room.create` + satu `room.member.add` per anggota. Email pembuat diabaikan. |
| P6 | Tab Anggota memakai combobox yang sama; menambah banyak sekaligus = beberapa `POST /members` berurutan (sudah ada), ringkasan toast "N ditambahkan, M gagal". |

## Kontrak tipe (`src/shared/api.types.ts`)

```ts
export type UserSearchItem = { id: string; name: string; email: string; image: string | null };
export type UserSearchResponse = { items: UserSearchItem[] };
export type CreateRoomBody = { id: string; title: string; visibility?: RoomVisibility; expiresAt?: number | null; members?: AddRoomMemberBody[] };
export const USER_SEARCH_MIN = 2; export const USER_SEARCH_MAX_RESULTS = 10; export const CREATE_ROOM_MAX_MEMBERS = 100;
```

## Kepemilikan file

- **wkr-picker-server**: `src/shared/api.types.ts` (tulis PERTAMA), `src/server/users.search.route.ts` + `users.search.repository.ts` (baru) + mount di `api.ts`, `rooms.route.ts` / `rooms.repository.ts` (members saat create; boleh pakai fungsi di `room.members.repository.ts` asal satu transaksi), test server, README §API, CHANGELOG `[Unreleased]`.
- **wkr-picker-web**: `src/web/api.client.ts`, `src/web/invite-picker/**` (baru: `InvitePicker.tsx`, parser email `invite.parse.ts` + test, labels), `src/web/lobby/CreateRoomForm.tsx`, `src/web/room-settings/MembersTab.tsx`, unit test web.
- **wkr-picker-e2e** (setelah keduanya): `e2e/invite-picker.spec.ts`.
