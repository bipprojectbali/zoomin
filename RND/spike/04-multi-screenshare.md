# Spike 04 — Multi Screen Share (LiveKit)

## Pertanyaan
Bisakah satu participant mem-publish ≥2 video track ber-source `SCREEN_SHARE` + 1 `CAMERA` + 1 `MICROPHONE` sekaligus, dan participant lain menerima semuanya dengan source & nama track yang benar, serta frame benar-benar mengalir? Juga: skenario A vs B (dua peserta berbeda masing-masing share 1 layar) diterima peserta ketiga.

## Metode
- Server: LiveKit dev server lokal `ws://127.0.0.1:7880` (devkey/secret).
- Runtime: Bun 1.4.2, `@livekit/rtc-node` 1.2.2 (publisher & subscriber), `livekit-server-sdk` 2.19.3 (`AccessToken`). Room nama acak per test (`multishare-<uuid>`).
- Media sintetis (`lk-bun/src/synthetic-media.ts`): `VideoSource` 640x360, frame RGBA warna solid berbeda per track, 15 fps via `setInterval`; audio sinus 440 Hz 48 kHz mono via `AudioSource`.
- Publish: `TrackPublishOptions({ source, simulcast })`. Subscriber `autoSubscribe: true`, `dynacast: false`, listener `TrackSubscribed` dipasang sebelum `connect`.
- Verifikasi: nama & `source` publikasi, identity pengirim, `VideoStream` per track video harus menerima ≥20 frame dalam 10 dtk, dan warna piksel tengah frame yang diterima cocok dengan warna track asal (toleransi ±40 per kanal). Langkah ini membuktikan frame mengalir dan tiap track membawa isinya sendiri tanpa tertukar. Mic dicek lewat `AudioStream` (≥1 frame).
- Test: `lk-bun/src/multishare.test.ts`, dijalankan dengan `bun test src/multishare.test.ts`.

## Hasil (output nyata)
```
[1-peserta] mic audio frame: done=false samples=480
[1-peserta] screen-1 source=SOURCE_SCREENSHARE simulcasted=true  pubDim=640x360 frames=20 recv=640x360 rgb=254,1,1   firstFrame=3ms
[1-peserta] screen-2 source=SOURCE_SCREENSHARE simulcasted=false pubDim=640x360 frames=20 recv=640x360 rgb=0,254,1   firstFrame=139ms
[1-peserta] screen-3 source=SOURCE_SCREENSHARE simulcasted=true  pubDim=640x360 frames=20 recv=640x360 rgb=0,0,251   firstFrame=205ms
[1-peserta] camera   source=SOURCE_CAMERA      simulcasted=true  pubDim=640x360 frames=20 recv=640x360 rgb=255,255,1 firstFrame=71ms
[A-vs-B] user-a/screen-a frames=20 recv=640x360 rgb=254,2,252 firstFrame=156ms
[A-vs-B] user-b/screen-b frames=20 recv=640x360 rgb=0,255,252 firstFrame=134ms
 2 pass, 0 fail, 26 expect() calls, 14.28s
```
`bun run typecheck` lulus. Test lulus pada percobaan pertama dan sekali lagi saat dijalankan ulang.

- 1 peserta, 5 track sekaligus (3 screen share + camera + mic): kelimanya diterima dengan nama dan `source` yang benar, dan semuanya dari identity `presenter`.
- Tiap track video mengirim 20/20 frame pada 640x360 dengan warna yang cocok, jadi isi track tidak tertukar.
- Simulcast pada screen share bisa diaktifkan: opsi `simulcast: true` diterima, dan subscriber melihat `simulcasted=true`. Track tanpa simulcast terlihat `false`. Pada 640x360 subscriber tetap menerima resolusi penuh di kedua mode.
- A vs B: viewer ketiga menerima `screen-a` dari `user-a` dan `screen-b` dari `user-b`. Kedua track membawa frame dengan warna yang benar.
- "firstFrame" adalah waktu dari pembuatan `VideoStream` sampai frame pertama, bukan latency glass-to-glass. Nilainya 3–205 ms di localhost.

## Batas yang ditemukan
- LiveKit tidak membatasi jumlah track `SCREEN_SHARE` per participant. Nama track (`screen-1`, `screen-2`, …) jadi satu-satunya pembeda antar layar, jadi app perlu konvensi penamaan sendiri, atau memakai `stream`/metadata.
- Log `error calling callback status: Closing` muncul saat teardown, setelah test selesai. Asalnya dari native FFI ketika room disconnect, dan log ini tidak memengaruhi hasil.
- Resolusi kecil (640x360) dan fps rendah (15). Perilaku layer simulcast pada resolusi layar sungguhan (1080p/4K) belum diukur.

## Kesimpulan
**Ya, bisa.** Satu participant dapat mem-publish 3 screen share + camera + mic bersamaan lewat rtc-node. Subscriber menerima semuanya dengan nama dan `source` yang benar, dan frame tiap layar mengalir terpisah tanpa tertukar. Skenario A vs B dari dua peserta juga jalan. Di level server/SFU, LiveKit tidak menghalangi fitur pembeda "banyak screen share bersamaan".

## Yang TIDAK terbukti
- Perilaku browser: `getDisplayMedia` berulang untuk beberapa layar, `livekit-client` `setScreenShareEnabled` (yang hanya mengelola 1 screen share per participant, sehingga layar tambahan kemungkinan harus lewat `publishTrack` manual dengan `source: ScreenShare`), dan izin OS. Ini diuji manual oleh worker lain.
- Beban & bandwidth nyata: banyak layar resolusi tinggi, banyak subscriber, jaringan non-localhost, CPU encoder.
- Latency end-to-end yang akurat, karena timestamp tidak disisipkan ke dalam frame.
- Pemilihan layer simulcast/adaptive stream saat subscriber meminta kualitas rendah, dan perilaku dynacast (test ini mematikan dynacast).
