# Spike 03 — Token LiveKit per role + API Elysia

## Tujuan
Membuktikan bahwa backend Bun bisa menerbitkan token join LiveKit dengan grant berbeda per role
(admin / participant / viewer), melayaninya lewat `POST /token` (Elysia), dan bahwa server LiveKit
nyata menegakkan grant tersebut (viewer tidak bisa publish).

## Desain role → grant
File: `lk-bun/src/token.ts` (`createJoinToken`, `grantsForRole`), `lk-bun/src/api.ts`.

| Grant | viewer | participant | admin |
|---|---|---|---|
| `roomJoin` + `room` | ✅ | ✅ | ✅ |
| `canSubscribe` | ✅ | ✅ | ✅ |
| `canPublish` | ❌ (`false`) | ✅ | ✅ |
| `canPublishData` | ❌ (`false`) | ✅ | ✅ |
| `canPublishSources` | – | camera, microphone, screen_share, screen_share_audio | sama |
| `roomAdmin` | – | – | ✅ |

- TTL: konstanta `JOIN_TOKEN_TTL_SECONDS` = 2 jam.
- Metadata participant berisi `{"role": "..."}` supaya client/admin bisa membaca role tanpa decode grant.
- Validasi: `room` & `identity` harus cocok `SAFE_ID_PATTERN` = `^[A-Za-z0-9_-]{1,64}$`. Pola yang sama dipakai
  di skema `t.Object` Elysia (satu sumber), dan juga dicek ulang di `createJoinToken` (bila dipanggil langsung).
- API: `POST /token` body `{room, identity, name?, role}` → `{token, url}`; `app` diekspor tanpa listen,
  `listen` hanya saat `import.meta.main` (port dari `PORT`, default 3000).

## Hasil test
Perintah: `bun test src/token.test.ts src/api.test.ts` dan `bun run typecheck` (LiveKit dev server di `ws://127.0.0.1:7880`).

```
src/token.test.ts:
viewer publish ditolak setelah 10004ms: Error: room error engine: internal error: track publication timed out, no response received from the server

 16 pass
 0 fail
 35 expect() calls
Ran 16 tests across 2 files. [10.66s]

$ bunx tsc --noEmit        (tanpa error)
```

Cakupan:
- Unit: JWT di-decode dengan `TokenVerifier`, cek grant per role, TTL, metadata, dan 4 input invalid ditolak.
- API: `app.handle(new Request(...))` → 200 + token valid; 4 body invalid → 400.
- Integrasi: `Room` dari `@livekit/rtc-node` connect dengan token participant & viewer ke room acak `it-xxxxxxxx`;
  participant berhasil publish track audio (`AudioSource` → `LocalAudioTrack`, sid `TR_...`), viewer gagal. Disconnect di `afterAll`.

## Temuan / keanehan
1. **Elysia mengembalikan 422 untuk error validasi**, bukan 400. Perlu `onError` yang memetakan `code === "VALIDATION"` ke `status(400, ...)`.
2. **Viewer publish tidak ditolak secara eksplisit** — server tidak mengirim error; rtc-node menunggu sampai timeout internal
   ~10 detik lalu melempar `track publication timed out`. Artinya penegakan grant bekerja, tapi UX client harus
   mencegah tombol publish untuk viewer (baca `permissions.canPublish` di sisi client) alih-alih mengandalkan error server.
   Test viewer diberi timeout 15 dtk karena ini.
3. Di JWT, `canPublishSources` diserialisasi sebagai string (`"camera"`, `"screen_share"`, ...) walaupun di SDK bertipe enum
   `TrackSource`; tipe `ClaimGrants` tetap menyatakan enum, jadi test perlu cast ke `string[]`.
4. Saat proses test selesai, rtc-node mencetak `error calling callback status: Closing` dan log debug JSON (`"level":20`).
   Hanya noise shutdown native binding; tidak memengaruhi hasil.
5. `roomAdmin` hanya membuka hak admin di Server API (mis. `RoomServiceClient` update permission/kick dengan token admin);
   mengatur layout admin tetap butuh mekanisme sendiri (metadata room / data message).

## Kesimpulan
**Berhasil.** Token per role, endpoint Elysia, dan penegakan grant oleh server LiveKit nyata terbukti di Bun 1.4.2.
Catatan utama untuk lanjutan: petakan 422→400 di Elysia, dan jangan andalkan error server untuk viewer publish (timeout 10 dtk).
