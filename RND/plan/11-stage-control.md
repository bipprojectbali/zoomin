# 11 — Stage control: Host only / Request / Open + custom grid (spec terkunci 2026-11-15)

Disetujui user 2026-11-15 ("ya sebar agent untuk mengerjakan semuanya" = ikut semua saran). Mengikat worker.
Branch `feature/stage-control`. Pola industri: tampilan lokal ("Focus for me", selalu bebas) vs panggung bersama
(diatur kebijakan room), kebijakan berbagi ala Zoom, request/approve ala Teams, kanvas bersama dengan CAS ala Miro.

## Keputusan

| # | Keputusan |
|---|---|
| S1 | `StageMode = "host" \| "request" \| "open"` per room, kolom `rooms.stage_mode` (default `host`). Dipilih saat buat room (`CreateRoomBody.stageMode?`), diubah pengelola (R3: host room / admin+ global, via `canManageRoom`) kapan saja lewat `PUT /api/rooms/:roomId/stage-mode { mode }` (juga `UpdateRoomBody.stageMode?`). Ganti mode **tidak** mengubah layout yang tampil. Audit `room.stage_mode` `{ from, to }`. `RoomSummary.stageMode`. |
| S2 | Siaran: room metadata LiveKit menjadi **envelope** `{ "stageMode": StageMode, "layout": LayoutState \| null }` (modul baru `src/shared/stage.model.ts`: `parseRoomStage(json) → { stageMode, layout }`, `serializeRoomStage`). Kompat mundur: JSON lama berbentuk `LayoutState` (punya `template`) → `{ stageMode: "host", layout }`. Kosong → `{ host, null }`. Batas ukuran tetap `LAYOUT_MAX_BYTES`. `putLayout`, `syncRoomLayout`, dan ganti mode selalu mempublikasikan envelope dari SQLite (sumber kebenaran). `LayoutResponse` + `stageMode`. |
| S3 | Izin `PUT /layout` (server, bukan hanya UI): pengelola selalu boleh; mode `open` → juga anggota room ber-peran `participant`; `viewer` tidak pernah. Ditolak → 403 `stage_locked` (kode baru). CAS versi tetap (409 `layout_conflict`). Perubahan tetap mencatat `updatedBy`. |
| S4 | **Request** (mode `request`): `POST /api/rooms/:roomId/stage-requests { trackName, action: "show" \| "focus" }` — pemanggil participant (bukan viewer, bukan wajib non-pengelola), `trackName` harus nama track screen-share (`parseTrackName` kind `screen`) milik identity pemanggil (identity = user.id; tidak bisa meminta untuk track orang lain). Mode bukan `request` → 409 `stage_mode_mismatch`. Satu request pending per user per room (request baru menggantikan yang lama). Rate limit 5/menit per `userId:roomId` → 429. TTL 60 s (`STAGE_REQUEST_TTL_MS`). Store **in-memory** (`Map` per room; ponytail: hilang saat restart, cukup untuk permintaan berumur 60 s — komentar `ponytail:`), purge lazy saat akses. `GET .../stage-requests` (pengelola) → `{ items: StageRequest[] }` pending saja. `POST .../stage-requests/:id/approve` & `.../deny` (pengelola) → 204; `DELETE .../stage-requests/:id` (pemilik) → 204. Tidak ditemukan/kedaluwarsa → 404 `stage_request_not_found`. Audit `room.stage_request` `{ action, decision }` hanya untuk approve/deny (aksi pengelola). |
| S5 | Notifikasi realtime lewat `RoomServiceClient.sendData` (reliable, topic `zoomin.stage`), payload JSON `StageEvent`: `{ type: "request.created" \| "request.resolved", request: StageRequest }` dengan `request.status` `pending \| approved \| denied \| canceled \| expired`. Dikirim ke semua peserta room (ponytail: tanpa filter identity pengelola; isi tidak sensitif — siapa meminta tampil; UI hanya menampilkan ke pengelola + pemilik request). Gagal kirim (room LiveKit belum ada) = warn, bukan error. Klien juga `GET` saat join/reconnect sebagai sumber kebenaran. |
| S6 | **Approve diterapkan oleh klien pengelola**: UI pengelola menghitung layout berikutnya dari layout efektif (fungsi murni: `show` = taruh track di layout bila belum ada, `focus` = `setFocus` setelah ditaruh), `PUT /layout` (CAS; konflik → reload lalu ulangi sekali), lalu `POST approve`. Server tidak menghitung layout (layout otomatis hanya diketahui klien). Deny/approve/cancel/expire → event `request.resolved`; pemohon mendapat toast hasil. |
| S7 | UI mode: pemilih **"Stage control"** (Host only / Request / Open) untuk pengelola di room (komponen di bar kontrol/header room) + di tab Umum dialog Pengaturan room + opsi di form Buat room (default Host only). Semua peserta melihat badge mode saat ini. Mode `request`: tile screen-share milik sendiri punya aksi menu "Request to show" / "Request full stage" + status pending (bisa dibatalkan). Pengelola: toast dengan Approve/Deny + panel antrean (`stage-requests` drawer/popover, badge jumlah). Mode `open`: participant mendapat kontrol edit stage yang sama dengan host (toolbar template, drag, resize, menu tile). "Focus for me" (perbesar lokal) tetap untuk semua di semua mode. |
| S8 | **Custom grid** (fase 3): template baru `custom-grid` di `LAYOUT_TEMPLATES` dengan `grid: { cols, rows }` (masing-masing 1–7, `cols*rows ≤ LAYOUT_MAX_SLOTS`), `slots.length === cols*rows`, slot boleh kosong: `trackRef: null` (HANYA di custom-grid; template lain tetap wajib trackRef). Tanpa `panelSizes` (sel sama besar; ponytail). Fungsi murni baru (file `src/shared/layout.grid.ts`): `toCustomGrid(state, by)` (dari template lain: grid terkecil yang memuat semua slot, sisa sel kosong), `placeInCell(state, index, ref, by)` (pindah bila track sudah di sel lain), `clearCell`, `addRow`, `addColumn`, `removeRow(index)`, `removeColumn(index)` (hanya bila sel di baris/kolom itu kosong, selain itu `LayoutValidationError`). `setTemplate(…, "custom-grid")` memakai `toCustomGrid`; keluar dari custom-grid membuang sel kosong. Duplikasi trackRef tetap dilarang. UI: sel kosong = drop target bertanda "Drop a screen here", toolbar custom-grid: +/− baris & kolom; berlaku untuk siapa pun yang boleh edit (S3). |
| S8a | (Revisi worker grid, diterima) Bentuk data custom-grid: `LayoutSlot` tidak berubah; `LayoutState.grid?: { cols, rows, cells: GridCell[] }` dengan `GridCell = { trackRef: TrackRef \| null }` (row-major), wajib hanya untuk `custom-grid`; `slots` tetap berisi sel terisi sesuai urutan sel. Operasi di `src/shared/layout.grid.ts`; `placeInCell` ke sel terisi = tukar. |
| S10 | **Konten vs orang** (standar Zoom/Meet/Teams): panggung bersama = **konten** (track screen-share). Kamera/avatar dirender di **strip orang** (filmstrip) terpisah, dengan indikator bicara. Layout otomatis (tanpa layout bersama) hanya berisi screen-share. Pengelola (atau siapa pun yang boleh edit, S3) tetap boleh menaruh kamera ke panggung secara eksplisit ("Spotlight on stage"); kamera di panggung tidak tampil ganda di strip. Bila tidak ada screen-share sama sekali dan layout bersama kosong, view Auto menampilkan gallery kamera. Layout bersama lama yang memuat kamera tetap valid (dirender di panggung). |
| S11 | **Menu "View" per orang** (lokal, `localStorage` `zoomin.view` dalam try/catch, default Auto; tidak memengaruhi orang lain): **Auto** (ada konten → panggung + strip; tidak ada → gallery), **Gallery** (semua kamera tiled), **Speaker** (pembicara aktif besar + strip), **Content only** (panggung tanpa strip). Posisi strip: **Right / Bottom / Hidden** (lokal juga). Mobile: strip bawah default. |
| S12 | **Follow host** (lokal, default on): on = panggung mengikuti layout bersama. Off = peserta bebas memperbesar/menata panggung untuk dirinya sendiri (generalisasi "Focus for me"; hanya state lokal, tidak PUT). Saat off tampil chip "Viewing your own layout · Follow host" untuk kembali dengan satu klik. Bila layout bersama berubah saat off, chip menandai "Host layout changed". |
| S9 | Semua teks UI English di `*.labels.ts`; kode error baru di `ApiErrorCode` + `error.message.ts`; `data-testid` untuk elemen e2e. Batas file proyek berlaku. |

## Kontrak tipe (`src/shared/api.types.ts`, ditulis wkr-stage-server PERTAMA)

```ts
export type StageMode = "host" | "request" | "open";
export const STAGE_MODES: readonly StageMode[];
export type StageRequestAction = "show" | "focus";
export type StageRequestStatus = "pending" | "approved" | "denied" | "canceled" | "expired";
export type StageRequest = { id: string; roomId: string; userId: string; userName: string; trackName: string;
  action: StageRequestAction; status: StageRequestStatus; createdAt: number; expiresAt: number };
export type CreateStageRequestBody = { trackName: string; action: StageRequestAction };
export type SetStageModeBody = { mode: StageMode };
export type StageEvent = { type: "request.created" | "request.resolved"; request: StageRequest };
export const STAGE_EVENT_TOPIC = "zoomin.stage"; export const STAGE_REQUEST_TTL_MS = 60_000;
// LayoutResponse + stageMode; RoomSummary + stageMode; CreateRoomBody/UpdateRoomBody + stageMode?
// ApiErrorCode + "stage_locked" | "stage_mode_mismatch" | "stage_request_not_found"
// AuditAction + "room.stage_mode" | "room.stage_request"
```

Migrasi `migrations/0006_stage_mode.sql`: `ALTER TABLE rooms ADD COLUMN stage_mode TEXT NOT NULL DEFAULT 'host' CHECK (stage_mode IN ('host','request','open'));` (komentar alasan; data lama = host).

## Kepemilikan file

Gelombang 1 (paralel):
- **wkr-stage-server**: `src/shared/api.types.ts`, `src/shared/stage.model.ts` (+test), `migrations/0006_stage_mode.sql`
  + `db.ts`, `src/server/layout.service.ts`, `layout.route.ts`, `room.access.ts` (helper izin edit stage bila perlu),
  `rooms.repository.ts`, `rooms.route.ts`, `rooms.manage.route.ts`, `token.route.ts` (bila memanggil syncRoomLayout),
  baru: `stage.mode.route.ts`, `stage.requests.store.ts`, `stage.requests.route.ts`, `stage.notify.ts`, mount di
  `api.ts`; `src/web/error.message.ts` (kode baru), `src/web/dev/dev.labels.ts` (label audit), test server,
  `docs/api.md`.
- **wkr-stage-grid**: `src/shared/layout.model.ts`, baru `src/shared/layout.grid.ts` (+test), test model. Tidak
  menyentuh api.types.

Gelombang 2 (paralel, setelah gelombang 1):
- **wkr-stage-web-control**: `src/web/api.client.ts`, `src/web/stage/layout.sync.ts` + `layout.sync.logic.ts`
  (+test; baca envelope → `{ layout, stageMode }`), `src/web/pages/RoomPage.tsx`, `src/web/room/**`,
  `src/web/room-settings/**`, `src/web/lobby/**`, folder baru `src/web/stage-control/**` (pemilih mode, badge,
  hook data channel `useStageEvents`, hook/panel request, logika approve murni `stage.request.apply.ts` + test).
- **wkr-stage-web-grid**: `src/web/stage/**` selain file layout.sync milik control. Wajib menyediakan kontrak
  integrasi: `Stage` prop baru `tileActions?: (ref: TrackRef, isOwn: boolean) => TileMenuItem[]` (item menu
  tambahan per tile, dipakai control untuk "Request to show") dan tetap `editable`/`onCommit`; render
  `custom-grid` + sel kosong + toolbar baris/kolom; aksi edit grid lewat fungsi `layout.grid.ts`. Juga S10–S12:
  pemisahan panggung konten vs strip orang, menu View + posisi strip (komponen `ViewMenu` diekspor dari
  `src/web/stage/` agar control worker cukup menaruhnya di ControlBar/header — kontrak: `<ViewMenu />` tanpa prop,
  state lewat hook `useViewPrefs()` di `src/web/stage/view.prefs.ts`), Follow host (state lokal di Stage).

Gelombang 3: **wkr-stage-e2e** (`e2e/stage-control.spec.ts`, perbaikan e2e lain yang terdampak) lalu
**wkr-stage-docs** (`README.md` §fitur, `CHANGELOG.md` `[Unreleased]`, `CLAUDE.md` aturan stage, `RND/plan/04`
keputusan 11-S1..S9).
