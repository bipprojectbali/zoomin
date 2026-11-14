# 02 — Stack Terkunci

Aturan versi: versi yang **terverifikasi** di spike ditulis apa adanya. Versi bertanda *(verifikasi M1)* belum
dicek di spike mana pun, jadi harus dicek di registry sebelum install (aturan global Rule 20) lalu dicatat di
sini. Pin memakai `^`, kecuali paket 0.x yang dipin exact.

## Tabel stack

| Lapisan | Pilihan | Versi | Alasan | Alternatif ditolak |
|---|---|---|---|---|
| Runtime | **Bun** | 1.4.2 | Wajib dari user. rtc-node, Elysia, dan bun:test terbukti jalan di sini (`../spike/00-ringkasan.md`) | Node (bukan main stack) |
| Bahasa | **TypeScript** | 7.0.2 | Wajib. Typecheck spike bersih (`lk-bun/package.json`) | – |
| SFU | **LiveKit server** self-hosted | 1.13.11 | Disetujui user, menggantikan go2rtc. Multi share terbukti (`../spike/04-multi-screenshare.md`) | go2rtc (bukan SFU konferensi), mediasoup (harus bangun signaling/room sendiri) |
| SDK server | **livekit-server-sdk** | 2.19.3 | Token, `RoomServiceClient`, `updateRoomMetadata` (`03`, `05`) | – |
| SDK browser | **livekit-client** | 2.24.0 | `publishTrack` manual untuk multi share, adaptiveStream/dynacast (`02-research.md` §1, §3) | – |
| HTTP API | **Elysia** | 1.4.32 | Validasi `t.Object` + `app.handle` untuk test tanpa port terbukti (`03`). Catatan: 422 → 400 lewat `onError`. | Hono (setara, tanpa alasan pindah), `Bun.serve` polos (validasi manual) |
| DB | **SQLite via `bun:sqlite`** | bawaan Bun | 3 tabel, satu server, tanpa service tambahan. CAS layout cukup dengan satu `UPDATE ... WHERE version=?` | Postgres (overkill untuk single node), ORM Drizzle/Prisma (3 tabel tidak butuh) |
| UI | **React** | 19 *(verifikasi M1)* | components-react peer `react >=18`, kompatibel React 19 (`02-research.md` §5) | – |
| Komponen | **shadcn/ui** + Tailwind | *(verifikasi M1)* | Rekomendasi user. Kode disalin ke repo, bukan dependency runtime. Resizable dari shadcn memakai react-resizable-panels v4 (`02` §9) | Mantine (dependency runtime besar) |
| Media React | **@livekit/components-react** | 2.9.25 | Hanya `useTracks`, `VideoTrack`, `AudioTrack`/`RoomAudioRenderer`. Layout dibuat sendiri karena `GridLayout`/`FocusLayout` tidak mendukung slot admin (`02` §5) | `@livekit/components-styles` (tidak dipakai), `@agents-ui` (fokus agent suara) |
| Drag-drop | **@dnd-kit/react** | **0.5.3 exact** | Pengganti resmi dnd-kit, peer React 19. Masih 0.x, jadi dipin (`02` §9) | `@dnd-kit/core` (legacy, docs diarsip), react-grid-layout (model koordinat dashboard, bukan slot) |
| Resize | **react-resizable-panels** | ^4.22.1 | Dipakai shadcn Resizable. `Group`/`Panel` bersarang memetakan template (`02` §9) | `Workspace` bawaan (terlalu baru, dievaluasi ulang nanti) |
| Router | **React Router** (declarative) | *(verifikasi M1)* | Rekomendasi user. Hanya ~3 rute (login, lobby, room), jadi tidak perlu type-safe search params atau loader. | TanStack Router (unggul di rute kompleks, yang tidak kita punya). Lihat keputusan K4. |
| Bundler web | **Bun HTML import** (`Bun.serve` routes / `bun build`) | bawaan Bun | Sudah dipakai spike `dev-web.ts` (`import index from "../web/index.html"`). Tanpa Vite. | Vite (tambah toolchain kedua) |
| Test | **bun test** | bawaan | 56 test spike. rtc-node dipakai sebagai klien bot untuk test integrasi media (`04`, `05`) | Vitest/Jest |
| Test bot media | **@livekit/rtc-node** | 1.2.2 (devDependency) | Membuktikan publish/subscribe nyata tanpa browser (`04`) | Playwright (hanya untuk uji UI bila diminta, aturan global Rule 1) |
| Reverse proxy/TLS | **Caddy** | *(verifikasi M4)* | Disarankan docs LiveKit dan generator `livekit/generate` (`01` §Deploy 3, 8) | Nginx (konfigurasi TLS manual) |
| Load test | **LiveKit CLI `lk load-test`** | `2.19.4` (rilis 2026-11-10, binary resmi darwin-arm64; `spike/07-load-test.md`) | Alat resmi (`02` §8) | Skrip rtc-node sendiri (cadangan) |
| Desktop | **Ditunda** | – | Disetujui user: web dulu. Electrobun/CEF tanpa bukti screen share (`02` §7) | Lihat M5 di `03-milestone.md` |

Tidak dipakai sekarang (YAGNI): Redis (hanya untuk multi-node, `01` §6), Egress/Ingress (butuh Redis + service
terpisah, `02` §8), Eden treaty (tipe request cukup dari `src/shared`). Masing-masing ditambah kalau
kebutuhannya muncul.

## Struktur repo: satu paket, bukan monorepo

Keputusan: **satu `package.json`** dengan tiga folder. Bun workspaces belum dipakai.

```
zoomin/
├── package.json            # satu manifest; scripts: dev, build, start, test, typecheck
├── tsconfig.json
├── migrations/
│   └── 0001_init.sql
├── src/
│   ├── shared/             # murni, tanpa DOM/SDK server: dipakai server & web
│   │   ├── layout.model.ts     # LayoutState, parseLayout, swapSlots, setFocus (dari spike layout.ts)
│   │   └── track.naming.ts     # konvensi camera/mic/screen-<n>/screen-<n>-audio
│   ├── server/
│   │   ├── main.ts             # Bun.serve: SPA + Elysia API
│   │   ├── config.ts           # env; gagal start di production bila secret kosong
│   │   ├── db.ts               # bun:sqlite + runner migrasi
│   │   ├── token.service.ts    # grant per role, TANPA roomAdmin
│   │   ├── layout.service.ts   # CAS SQLite + updateRoomMetadata
│   │   ├── auth.*.ts           # tergantung keputusan K2
│   │   └── *.route.ts          # rooms, token, layout, moderation
│   └── web/
│       ├── index.html
│       ├── main.tsx            # router
│       ├── room/               # koneksi, publish, kontrol
│       ├── stage/              # render layout, tile, admin drag/resize
│       └── components/ui/      # shadcn (generated)
└── test/                   # *.test.ts yang butuh LiveKit nyata (integrasi)
```

Alasan satu paket:
- `src/shared` bisa langsung diimport server dan web tanpa linking workspace. `parseLayout` memang dipakai di
  kedua sisi (`05` §Rekomendasi 1 dan 4).
- Ada satu `bun test` dan satu `tsc --noEmit`, sama seperti spike.
- Bun HTML import di `Bun.serve` mem-bundle SPA dari proses yang sama (pola `dev-web.ts`). Cara memasang
  Elysia di samping routes HTML (`fetch: app.fetch` atau mount) **perlu diverifikasi di M1**. Bila bentrok,
  jalankan SPA build statis dari Elysia.
- Pecah ke workspaces (`apps/server`, `apps/web`, `apps/desktop`, `packages/shared`) **hanya bila M5 desktop
  jalan** atau dependency web dan server mulai saling mengganggu.

Batas file mengikuti aturan global Rule 8: route ≤150, service ≤300, test ≤400 baris. Nama file `[domain].[layer]`.

## Port dari spike → produk

| Spike | Produk | Perubahan |
|---|---|---|
| `lk-bun/src/layout.ts` | `src/shared/layout.model.ts` + `src/server/layout.service.ts` | Pisahkan fungsi murni dari `publishLayout`. Tambah ukuran panel untuk resize (M3). |
| `lk-bun/src/token.ts` | `src/server/token.service.ts` | Hapus `roomAdmin`. `canPublishData` = false. Role dari DB. |
| `lk-bun/src/api.ts` | `src/server/token.route.ts` | Body tanpa `role`/`identity`; keduanya dari sesi. Mapping 422→400 dipertahankan. |
| `lk-bun/src/config.ts` | `src/server/config.ts` | Default `devkey`/`secret` hanya saat `NODE_ENV !== "production"`. |
| `lk-bun/src/synthetic-media.ts` | `test/synthetic-media.ts` | Utility test (fixture), dipakai test integrasi. |
| `lk-bun/web/*` | dibuang | Bertanda `SPIKE: jangan merge`. Logika publish layar ditulis ulang di `src/web/room/`. |
