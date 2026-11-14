# Spike 05 — Sinkronisasi Layout lewat Room Metadata

## Pertanyaan

1. Apakah room metadata LiveKit cocok jadi sumber kebenaran state layout (template, slot, ukuran) yang disiarkan admin ke semua penonton?
2. Seberapa cepat sampai ke klien?
3. Bagaimana mencegah non-admin mengubahnya?

## Desain

- `lk-bun/src/layout.ts`
  - `LayoutState { version, template: "side-by-side"|"grid"|"focus", slots[{ trackRef:{identity, trackName}, size?: "small"|"medium"|"large" }], updatedBy, updatedAt }`.
  - Fungsi murni: `parseLayout` (validasi ketat, error menyebut path field, mis. `slots[0].trackRef.identity`; field asing dibuang; trackRef duplikat ditolak), `swapSlots(state,i,j,by)` (tukar track, ukuran tetap di posisi slot), `setFocus(state,ref,by)` (template `focus`: track itu ke slot 0 `large`, sisanya `small`), `serializeLayout`. Setiap mutasi menaikkan `version`.
  - `publishLayout(roomService, room, state)` → `RoomServiceClient.updateRoomMetadata` (server-side, butuh API secret).
  - Batas: docs resmi "Room metadata is limited to 512 KiB" (`LIVEKIT_METADATA_MAX_BYTES`). Kita pakai `LAYOUT_MAX_BYTES = 16 KiB` dan `LAYOUT_MAX_SLOTS = 49`; grid 49 slot ≈ 3–4 KiB.
- Alur: UI admin (drag-drop) → endpoint backend kita (cek role admin) → `publishLayout` → LiveKit → event `RoomMetadataChanged` di semua klien; klien baru membaca `room.metadata` saat connect.

## Hasil (LiveKit dev server lokal, ws://127.0.0.1:7880, Bun 1.4.2, rtc-node 1.2.2)

`bun test src/layout.test.ts src/layout-sync.test.ts` → **27 pass, 0 fail**; `bun run typecheck` bersih.

```
[metadata] n=10 min=0.5ms median=0.8ms max=1.6ms     (run lain: median 1.4ms, max 4.7ms)
[twirp non-admin] status=401 body={"code":"unauthenticated","msg":"permissions denied"}
[twirp roomAdmin] status=200
[publishData] n=5 min=0.5ms median=0.7ms max=1.0ms   (run lain: median 3.7ms, max 10.1ms)
```

- Latency metadata diukur dari sebelum `updateRoomMetadata` dipanggil sampai event diterima klien rtc-node; kedua klien menerima JSON identik dan `parseLayout` hasilnya `toEqual` state yang dikirim.
- Klien yang join belakangan (`carol`) langsung punya layout terkini di `room.metadata` tanpa event/request tambahan. Ini keunggulan utama dibanding data message.
- Non-admin: rtc-node **tidak punya API untuk mengubah room metadata** (hanya `localParticipant.updateMetadata` untuk metadata participant sendiri). Satu-satunya jalur bagi pemegang token adalah memanggil Twirp `RoomService/UpdateRoomMetadata` dengan JWT-nya sendiri → **401 permissions denied** tanpa grant `roomAdmin`; metadata room tidak berubah.
- Temuan penting: token dengan grant `roomAdmin` **bisa** mengubah metadata langsung via Twirp (200). Jadi siapa pun yang memegang token itu (termasuk browser admin) bisa menulis apa saja, tanpa validasi kita.
- Angka ini localhost (tanpa jaringan nyata). Di produksi tambahkan RTT klien↔SFU + RTT backend↔LiveKit; tetap jauh di bawah ambang terasa untuk ganti layout.
- Catatan: saat teardown, rtc-node mencetak `error calling callback status: Closing` dari native layer; tidak memengaruhi hasil.

## Batas

- **Last-writer-wins.** `updateRoomMetadata` tidak punya compare-and-set; dua admin yang menulis bersamaan saling timpa. `version` hanya membantu klien mengabaikan update usang, tidak mencegah konflik. Kalau multi-admin penting: serialisasi tulis di backend (lock per room / cek `version` sebelum publish).
- Satu field metadata untuk satu room: kalau nanti ada state lain (mis. status rekaman), pakai satu objek JSON ber-namespace (`{ layout: ..., ... }`) atau pindahkan sebagian ke participant attributes, agar tidak saling timpa.
- Klien tetap wajib `parseLayout` dan mengabaikan slot yang track-nya belum/tidak ada (participant keluar), metadata hanya menyimpan referensi.
- Butuh panggilan server (HTTP) per perubahan, jadi untuk drag yang di-preview live per frame kurang cocok; cukup kirim saat drop.

## Pembanding: data message (`publishData`)

Latency setara (sub-ms s/d ~10 ms di lokal), tapi: tidak persisten (klien yang join belakangan tidak dapat state), siapa pun dengan `canPublishData` bisa mengirim (otorisasi harus dicek di tiap klien via identity pengirim, mudah salah), dan reliable message bisa hilang saat reconnect. Cocok hanya untuk sinyal sementara (mis. preview saat admin sedang drag), bukan sumber kebenaran.

## Kesimpulan

**Ya, room metadata cocok sebagai sumber kebenaran layout.** Persisten, tersiar ke semua klien dalam ~1 ms (lokal), klien baru langsung dapat state terkini, dan klien biasa tidak bisa mengubahnya (401).

## Rekomendasi untuk rencana

1. Simpan layout di room metadata; tulis **hanya dari backend** (endpoint admin yang memvalidasi role + `parseLayout` + `publishLayout`).
2. **Jangan beri grant `roomAdmin` di token browser**, termasuk admin, karena token itu bisa menulis metadata mentah tanpa validasi. Peran admin cukup dicek di backend app.
3. Serialisasi tulis per room di backend (cek `version`) bila multi-admin.
4. Klien: baca `room.metadata` saat connect, dengarkan `RoomMetadataChanged`, abaikan `version` yang lebih kecil.
5. Opsional nanti: `publishData` topic `layout-preview` untuk preview drag live; commit final tetap lewat metadata.
