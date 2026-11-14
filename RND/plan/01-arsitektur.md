# 01 — Arsitektur

Prinsip: satu proses app (Bun) + satu LiveKit server. Tidak ada Redis, egress, atau worker sampai ada bukti
kebutuhannya. Untuk satu node, Redis tidak dibutuhkan (`../spike/01-livekit-server.md` §6, `../spike/02-research.md` §8).

## Diagram

```
 Browser (desktop, HTTPS)                         Server Linux (100.64.0.8 / subdomain)
 ┌──────────────────────────────┐                ┌──────────────────────────────────────────┐
 │ React SPA                    │  HTTPS /api    │ Reverse proxy TLS (Caddy)                │
 │  - Lobby / Room page         │ ─────────────► │   ├─ app.<domain>  → app :3000           │
 │  - Stage: render LayoutState │                │   └─ lk.<domain>   → livekit :7880 (wss) │
 │  - Kontrol: cam/mic/+layar   │                │                                          │
 │  - Admin: template/drag/size │                │ App (Bun + Elysia)                       │
 │ livekit-client (Room)        │                │   - auth/sesi, role per room (SQLite)    │
 └───────┬──────────────────────┘                │   - POST /api/rooms/:id/token            │
         │ wss signaling + media                 │   - PUT  /api/rooms/:id/layout           │
         │ (UDP 50000-60000, TCP 7881,           │   - moderasi (kick/mute) via server SDK  │
         │  TURN/TLS 443 fallback)               │   - serve SPA build                      │
         ▼                                       │        │ livekit-server-sdk (API secret) │
 ┌──────────────────────────────┐                │        ▼                                 │
 │ LiveKit SFU (single node)    │ ◄───────────── │ RoomServiceClient.updateRoomMetadata     │
 │  room metadata = LayoutState │   Twirp HTTP   │ SQLite file (bun:sqlite)                 │
 └──────────────────────────────┘                └──────────────────────────────────────────┘
```

## Komponen dan tanggung jawab

| Komponen | Tanggung jawab | Tidak boleh |
|---|---|---|
| **LiveKit SFU** | Routing media, simulcast/dynacast, penegakan grant, broadcast room metadata | Menjadi tempat logika role app |
| **App server** (Elysia) | Auth, role per room, terbit token (tanpa `roomAdmin`), validasi + tulis layout, moderasi, serve SPA | Meneruskan media. Menerima `role`/`identity` dari body client. |
| **SQLite** | User, room, keanggotaan + role, salinan layout terakhir | Menyimpan state realtime per detik |
| **Web SPA** | Join, publish kamera/mic/layar, render layout dari metadata, UI admin | Menulis room metadata langsung (memang tidak bisa tanpa `roomAdmin`, `../spike/05-layout-sync.md`) |
| **src/shared** (lihat `02-stack.md`) | `LayoutState`, `parseLayout`, `swapSlots`, `setFocus`, konvensi nama track. Kode murni, dipakai server dan web. | Import SDK server atau DOM |

## Alur

### Join
1. User login (metode = keputusan terbuka, `04-risiko-keputusan.md` K2) → sesi cookie.
2. `POST /api/rooms/:id/token`. Server mengambil `identity = user.id` dari sesi dan `role` dari `room_members`.
   Body client **tidak** membawa role/identity, padahal spike `api.ts` menerimanya dari body. Ini harus diubah.
3. Server membalas `{token, url}`. TTL 2 jam (`JOIN_TOKEN_TTL_SECONDS`, `../spike/lk-bun/src/token.ts`).
4. Client: `new Room({ adaptiveStream: true, dynacast: true })` → `connect`. Saat connect, client membaca
   `room.metadata` → `parseLayout`. Late joiner langsung dapat layout (`../spike/05-layout-sync.md`).
5. Role dibaca dari participant metadata `{"role": ...}` (`token.ts`) dan `localParticipant.permissions.canPublish`.
   Viewer: tombol publish **disembunyikan**, karena penolakan server baru datang setelah timeout ~10 dtk
   (`../spike/03-token-elysia.md` temuan 2).

### Publish
- Kamera + mic: `setCameraEnabled` / `setMicrophoneEnabled`. Nama track diset sesuai konvensi di bawah.
- Tiap klik "Tambah layar": `getDisplayMedia` (1 klik = 1 picker, `../spike/02-research.md` §6) →
  `publishTrack(video, { source: ScreenShare, name: "screen-<n>", videoCodec: "vp8", simulcast: true,
  screenShareEncoding, screenShareSimulcastLayers })`. Audio layar, bila ada (hanya Chromium), dipublish
  sebagai `screen-<n>-audio`. **Jangan** pakai `setScreenShareEnabled`, karena hanya 1 share
  (`../spike/02-research.md` §1, `../spike/04-multi-screenshare.md`).
- Encoding layar: share pertama `h1080fps15`, share berikutnya `h720fps15`, ditambah layer `h360fps3`.
  `contentHint: "detail"`/`"text"`. Hindari VP9/AV1 (`../spike/02-research.md` §2). Belum diuji di browser,
  jadi dikunci di M2.
- Track `ended` (tombol "Stop sharing" browser) → `unpublishTrack`. Pola sudah ada di spike `web/app.ts`
  (diuji manual di M0).

### Layout (admin)
1. Admin drag/drop/resize di UI → state baru dihitung lokal dengan fungsi shared (`swapSlots`, `setFocus`, …).
2. Saat drop/mouseup (debounce, bukan per frame), client mengirim
   `PUT /api/rooms/:id/layout {baseVersion, layout}`.
3. Server:
   1. Cek role admin di `room_members`, jika gagal → 403.
   2. `parseLayout`, jika gagal → 400 dengan path field.
   3. Compare-and-set di SQLite:
      `UPDATE rooms SET layout_json=?, layout_version=layout_version+1 WHERE id=? AND layout_version=?`.
      Jika 0 baris berubah → 409, client reload layout. Ini menutup last-write-wins
      (`../spike/05-layout-sync.md` §Batas).
   4. `publishLayout` → `updateRoomMetadata`.
4. Semua client menerima `RoomMetadataChanged` → `parseLayout`. Client mengabaikan `version` yang lebih kecil
   (publish bisa tiba tidak berurutan) dan slot yang track-nya belum ada.
5. Saat room dibuat ulang (room kosong ditutup LiveKit), server menulis ulang `layout_json` dari SQLite ke
   metadata ketika token pertama diterbitkan. Mekanisme timeout room kosong perlu diverifikasi di M1.

Metadata room = satu objek JSON. Bila nanti ada state lain, pakai namespace `{layout, ...}`
(`../spike/05-layout-sync.md` §Batas). Batas kita 16 KiB, jauh di bawah batas LiveKit 512 KiB (`layout.ts`).

## Konvensi nama track (kontrak, ada di `src/shared`)

| Track | `source` | `name` |
|---|---|---|
| Kamera | camera | `camera` |
| Mikrofon | microphone | `mic` |
| Layar ke-n | screen_share | `screen-<n>` |
| Audio layar ke-n | screen_share_audio | `screen-<n>-audio` |

- `<n>` = integer mulai 1, **naik terus per koneksi dan tidak dipakai ulang**. Dengan begitu slot layout milik
  layar yang sudah berhenti tidak diam-diam terisi layar lain.
- Format `screen-N` / `screen-N-audio` sudah dipakai spike dan terbukti (`04`, `web/app.ts`). Format lain seperti
  `screen:<n>` tidak dipilih karena belum diuji.
- Referensi layout = `{identity, trackName}` (`layout.ts`), bukan `trackSid`. Alasannya, sid berubah tiap publish
  ulang. Karena itu `identity` wajib stabil = `user.id`.
- Label manusia ("layar kiri", "Build A") disimpan di participant attributes
  (`../spike/02-research.md` §4). Penulisnya server; ditunda sampai diminta.

## Model data SQLite (minimal)

```sql
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,                 -- juga identity LiveKit; cocok SAFE_ID_PATTERN
  name        TEXT NOT NULL,
  created_at  INTEGER NOT NULL
  -- kolom auth menyusul keputusan K2 (04-risiko-keputusan.md)
);
CREATE TABLE IF NOT EXISTS rooms (
  id              TEXT PRIMARY KEY,             -- nama room LiveKit; cocok SAFE_ID_PATTERN
  title           TEXT NOT NULL,
  created_by      TEXT NOT NULL REFERENCES users(id),
  layout_json     TEXT,                         -- salinan LayoutState terakhir (restore room)
  layout_version  INTEGER NOT NULL DEFAULT 0,   -- dipakai compare-and-set tulis layout
  created_at      INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS room_members (
  room_id  TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role     TEXT NOT NULL CHECK (role IN ('admin','participant','viewer')),
  PRIMARY KEY (room_id, user_id)
);
```

- **Tidak ada tabel `layout_templates`.** Template bawaan (side-by-side, grid, focus) adalah konstanta kode
  `LAYOUT_TEMPLATES` (`layout.ts`). Preset buatan user baru dibuat bila diminta (keputusan K7).
- Migrasi: file SQL bernomor (`migrations/0001_init.sql`), dijalankan saat start, idempotent (`IF NOT EXISTS`).
- Tidak memakai ORM. `bun:sqlite` dengan prepared statement sudah cukup untuk 3 tabel.

## Keamanan

1. **Token:** grant mengikuti role dari DB, bukan input client. Tidak ada `roomAdmin` di token browser mana pun,
   termasuk admin. Pemegang `roomAdmin` bisa memanggil Twirp `UpdateRoomMetadata` langsung (200) tanpa validasi
   kita (`../spike/05-layout-sync.md`). Perubahan wajib dari spike: hapus cabang `roomAdmin` di
   `grantsForRole` (`token.ts`).
2. **Grant per role:** viewer = subscribe saja. Participant/admin = `canPublishSources` camera, microphone,
   screen_share, screen_share_audio (`03`). `canPublishData` = false untuk semua sampai ada fitur yang butuh
   (preview drag). `canUpdateOwnMetadata` tidak diberikan (`../spike/02-research.md` §4).
3. **API secret LiveKit** hanya di server (env). `config.ts` spike punya default `devkey`/`secret` (test-only),
   jadi di produksi server **gagal start** bila env tidak ada.
4. **Validasi di boundary:** `room`/`identity` cocok `SAFE_ID_PATTERN`. Body layout melewati `parseLayout`
   (ukuran ≤16 KiB, ≤49 slot, field asing dibuang, duplikat ditolak). Elysia 422 → 400 (`03`).
5. **Moderasi** (kick, mute, cabut publish) lewat endpoint backend yang memanggil `RoomServiceClient` dengan
   API secret, setelah cek role admin.
6. **Transport:** HTTPS/WSS wajib, karena getDisplayMedia butuh secure context (`06`, `02` §6). Sertifikat dari
   CA tepercaya; self-signed tidak jalan (`01` §Deploy 3).
7. **Client tidak dipercaya:** client tetap `parseLayout` metadata, dan viewer yang mengakali UI tetap ditolak
   server (timeout).
