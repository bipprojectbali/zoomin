# 02 — Riset: Multi Screen Share + Layout Admin di LiveKit

Tanggal riset: 2026-11-14. Versi yang dicek: `livekit-client` 2.24.0 (2026-11-12), `@livekit/components-react` 2.9.25 (2026-11-05), `livekit-server-sdk` 2.19.3 (2026-11-10), LiveKit server v1.13.11 (2026-10-25), Egress v1.15.0 (2026-10-06), Electrobun 2.0.6 (CEF 147.0.10 / Chromium 147).
Keyakinan: **Tinggi** = dicek langsung di source/docs resmi; **Sedang** = docs resmi + sumber pihak ketiga; **Rendah** = inferensi atau bukti tidak langsung.

## Ringkasan

| # | Topik | Kesimpulan singkat | Keyakinan |
|---|---|---|---|
| 1 | Multi screen_share per peserta | Bisa. Panggil `publishTrack` untuk tiap track dengan `name` unik. SDK hanya mencatat log info, tidak ada batas keras. | Tinggi |
| 2 | Codec/simulcast layar | VP8 + simulcast (default), atau H.264. Batasi resolusi/fps per share. Hindari VP9/AV1 SVC untuk layar. | Sedang |
| 3 | Subscribe adaptif | `adaptiveStream` + `dynacast` cocok untuk tile besar/kecil. `setVideoDimensions` berfungsi sebagai plafon. | Tinggi |
| 4 | Sinkron layout | Room metadata (512 KiB, hanya bisa ditulis server) jadi sumber kebenaran. Admin menulis lewat endpoint Bun. | Tinggi |
| 5 | components-react | Kompatibel dengan React 19 (`react >=18`). Pakai hooks (`useTracks`) dan `VideoTrack`; layout dibuat sendiri. | Tinggi |
| 6 | Browser | Bisa memanggil `getDisplayMedia` berulang (satu klik per layar), wajib HTTPS. Audio layar hanya di Chromium. | Sedang |
| 7 | Electrobun | Kamera/mic sudah ditangani. Untuk `getDisplayMedia` di CEF tidak ditemukan bukti bahwa ia bekerja. | Rendah |
| 8 | Skala | Satu room harus muat di satu node. Benchmark 150 pub × 150 sub 720p = 85% CPU di 16 core. Untuk internet perlu domain + TLS + TURN/TLS 443. | Tinggi |
| 9 | Drag & resize | `@dnd-kit/react` 0.5.3 untuk tukar slot, `react-resizable-panels` 4.22.1 (lewat shadcn Resizable) untuk resize. | Sedang |

---

## 1. Lebih dari satu `screen_share` per peserta

**Kesimpulan:** Bisa. `setScreenShareEnabled(true)` hanya mengelola **satu** share per source (memakai `getTrackPublication(source)`), jadi tidak bisa dipakai untuk multi-layar. Caranya: panggil `localParticipant.createScreenTracks({ audio, contentHint, resolution })` atau `getDisplayMedia` sendiri, lalu `publishTrack(track, { source: Track.Source.ScreenShare, name: 'screen-<uuid>' })` untuk tiap layar. Audio layar memakai `source: Track.Source.ScreenShareAudio` dengan nama pasangan yang sama.
- Di source `LocalParticipant.publish()` (main, v2.24.0), source yang sama hanya memicu `log.info("publishing a second track with the same source")`. Track tetap terbit dan tidak ada batas jumlah di SDK.
- Konsekuensinya, `participant.getTrackPublication(Track.Source.ScreenShare)` hanya mengembalikan satu publikasi. Untuk UI, iterasi `participant.trackPublications` atau `useTracks([Track.Source.ScreenShare])`, lalu identifikasi tiap share lewat `trackSid` atau `trackName`.
- Pasangan video↔audio tidak dihubungkan otomatis. Simpan mapping di nama track, misalnya `screen-<id>` dan `screen-<id>-audio`.
- Token bisa membatasi source lewat `canPublishSources: ["camera","microphone","screen_share","screen_share_audio"]`.
- Batas praktisnya ada di CPU encoder klien (tiap share punya encoder dan simulcast sendiri) dan di uplink. Tidak ada angka resmi.

**Keyakinan:** Tinggi untuk mekanismenya (dicek di source). Belum diuji runtime dengan lebih dari 3 share dari satu klien.

**Sumber:** [LocalParticipant.ts (main)](https://github.com/livekit/client-sdk-js/blob/main/src/room/participant/LocalParticipant.ts) · [Docs Screen sharing](https://docs.livekit.io/transport/media/screenshare/) · [Rooms/participants/tracks](https://docs.livekit.io/intro/basics/rooms-participants-tracks/) · [Token grants](https://docs.livekit.io/frontends/authentication/tokens/)

## 2. Simulcast & codec untuk layar

**Kesimpulan:** Pakai **VP8 (default) dengan simulcast**, `screenShareEncoding` sekitar `ScreenSharePresets.h1080fps15` (2,5 Mbps) atau `h720fps15` untuk share ke-2 dan seterusnya. Default `screenShareSimulcastLayers` hanya menambah satu layer ½ resolusi. Tambahkan layer `h360fps3` supaya tile kecil murah. H.264 layak bila perlu hardware encode (CPU rendah, banyak share). **Hindari VP9/AV1 untuk layar** di MVP.
- Preset resmi: `h360fps3` 200k, `h720fps5` 800k, `h720fps15` 1,5M, `h1080fps15` 2,5M, `h1080fps30` 5M, `original` 7M (`options.ts`).
- Untuk source ScreenShare SDK otomatis memakai `degradationPreference: 'maintain-resolution'`, artinya teks diprioritaskan tajam dan fps yang dikorbankan (`publishUtils.ts`).
- `contentHint`: `'detail'` atau `'text'` untuk dokumen/kode, `'motion'` untuk video. Ini opsi `ScreenShareCaptureOptions.contentHint`.
- Isu VP9: VP9/AV1 di LiveKit memakai SVC, jadi `screenShareSimulcastLayers` diabaikan. Ada laporan VP9 simulcast freeze saat ganti layer (livekit/livekit #4594), juga VP9 screen share turun ke sekitar 5 fps di jalur layar Chrome. Penghematan bitrate VP9/AV1 nyata (benchmark Hopp), tetapi CPU-nya lebih berat. Ini jelek untuk skenario banyak share.

**Keyakinan:** Sedang (preset dan degradation dicek di source; isu VP9 berasal dari laporan komunitas).

**Sumber:** [publishUtils.ts](https://github.com/livekit/client-sdk-js/blob/main/src/room/participant/publishUtils.ts) · [options.ts](https://github.com/livekit/client-sdk-js/blob/main/src/room/track/options.ts) · [KB: optimal video quality](https://kb.livekit.io/articles/3859313029-configuring-the-client-sdk-for-optimal-video-quality) · [TrackPublishOptions](https://docs.livekit.io/reference/client-sdk-js/interfaces/TrackPublishOptions.html) · [livekit #4594 VP9 freeze](https://github.com/livekit/livekit/issues/4594) · [Hopp: encoders compared](https://www.gethopp.app/blog/screensharing-encoders-compared)

## 3. Subscribe adaptif

**Kesimpulan:** Cocok. Aktifkan `new Room({ adaptiveStream: true, dynacast: true })`. SDK memantau ukuran dan visibilitas elemen `<video>` (wajib lewat `track.attach()`, yang sudah dilakukan `VideoTrack` di components-react) lalu meminta layer simulcast yang pas. Tile yang tersembunyi otomatis di-pause di server. Dynacast mematikan layer yang tak dipakai siapa pun di sisi publisher, sehingga CPU/uplink pemilik share hemat.
- `setVideoDimensions` tetap berfungsi saat adaptiveStream aktif: SDK meminta yang **lebih kecil** antara nilai manual dan ukuran elemen. Ini berguna sebagai plafon untuk thumbnail. `setVideoQuality` di-reset oleh `setVideoDimensions` (`RemoteTrackPublication.ts`).
- Untuk tile "fokus besar", biarkan adaptif. Untuk mode komparasi detail, admin bisa menaikkan preset publisher, bukan subscriber.

**Keyakinan:** Tinggi.

**Sumber:** [Docs Subscribing/adaptive stream](https://docs.livekit.io/transport/media/subscribe/) · [RemoteTrackPublication.ts](https://github.com/livekit/client-sdk-js/blob/main/src/room/track/RemoteTrackPublication.ts)

## 4. Sinkron layout admin

**Kesimpulan:** Pakai **room metadata** sebagai satu sumber kebenaran untuk layout, misalnya JSON `{template, slots:[{trackSid|trackName, ...}], sizes, version}`. Admin mengirim perubahan ke endpoint Bun, yang memverifikasi peran lalu memanggil `RoomServiceClient.updateRoomMetadata(room, json)`. Semua klien menerima `RoomEvent.RoomMetadataChanged`, termasuk peserta yang baru join (metadata ikut di state awal).

| Mekanisme | Siapa yang menulis | Batas | Late joiner | Cocok untuk |
|---|---|---|---|---|
| Room metadata | Hanya server API | 512 KiB | Ya | State layout (persist) |
| Participant attributes | Peserta sendiri (`canUpdateOwnMetadata`) atau server | 64 KiB total | Ya | Label share milik peserta (mis. "layar kiri") |
| Data packets | Siapa pun yang punya `canPublishData` | Reliable 15 KiB, lossy ~1300 B | **Tidak** | Preview drag real-time / efek sementara |

- Grants: `roomAdmin` untuk moderasi (mute/kick/UpdateParticipant via server), `canUpdateOwnMetadata` untuk mengubah metadata/attributes sendiri, `hidden` untuk participant tak terlihat (mis. bot rekaman). Docs memperingatkan: jika attributes dipakai sebagai izin, jangan beri `canUpdateOwnMetadata`/`roomAdmin` ke peserta biasa.
- Rekomendasi: peran admin disimpan di backend sendiri (atau di token metadata, read-only). Jangan izinkan klien menulis room metadata langsung, karena memang tidak bisa dari client SDK.
- Layout dengan resize bisa sering berubah. Debounce update metadata (mis. kirim saat drop/mouseup). Untuk preview saat drag, pakai data packet lossy bila diperlukan.

**Keyakinan:** Tinggi.

**Sumber:** [Room metadata](https://docs.livekit.io/transport/data/state/room-metadata/) · [Participant attributes](https://docs.livekit.io/transport/data/state/participant-attributes/) · [Data packets](https://docs.livekit.io/transport/data/packets/) · [Token grants](https://docs.livekit.io/frontends/authentication/tokens/)

## 5. `@livekit/components-react`

**Kesimpulan:** Versi 2.9.25 (2026-11-05) memiliki peer `react >=18`, `react-dom >=18`, `livekit-client ^2.20.1`, jadi **kompatibel dengan React 19**. Paket ini tidak bergantung pada Tailwind. Gaya default ada di `@livekit/components-styles` yang opsional, dan bisa dilewati lalu diganti komponen shadcn sendiri.
- Ekspor yang masih ada: `LiveKitRoom`, `SessionProvider`, `useTracks`, `VideoTrack`, `AudioTrack`, `RoomAudioRenderer`, `GridLayout`, `FocusLayout`, `FocusLayoutContainer`, `CarouselLayout`, `LayoutContextProvider`.
- `GridLayout`/`FocusLayout` adalah layout otomatis berbasis CSS dan tidak mendukung slot yang diatur admin. Untuk pembeda produk ini, **pakai `useTracks` + `VideoTrack` + grid buatan sendiri**. Komponen layout bawaan cukup sebagai fallback.
- LiveKit juga punya `@agents-ui` (registry shadcn, React 19 + Tailwind 4), tetapi fokusnya agent suara dan tidak relevan untuk layout.

**Keyakinan:** Tinggi (peerDeps dari npm registry, ekspor dari source main).

**Sumber:** [npm @livekit/components-react](https://www.npmjs.com/package/@livekit/components-react) · [components-js repo](https://github.com/livekit/components-js) · [layout/ source](https://github.com/livekit/components-js/tree/main/packages/react/src/components/layout) · [Agents UI shadcn](https://github.com/livekit/components-js/tree/main/packages/shadcn)

## 6. Browser: `getDisplayMedia` berulang

**Kesimpulan:** Multi-layar dari satu peserta = memanggil `getDisplayMedia` beberapa kali, **satu klik user (transient activation) dan satu picker per layar**. Izin tidak bisa dipersist. API khusus multi-capture (`getDisplayMediaSet`, `getAllScreensMedia`) masih draf WICG atau hanya untuk enterprise. **Wajib secure context (HTTPS, atau `localhost` saat dev)**. Desktop saja, mobile tidak didukung.

| | Chrome/Edge | Firefox | Safari 26 |
|---|---|---|---|
| Video layar/jendela/tab | Ya | Ya | Ya |
| Audio tab | Ya (pilih Tab + "Share tab audio") | Tidak | Tidak |
| Audio sistem | Windows/ChromeOS (`systemAudio`) | Tidak | Tidak |
| `CaptureController`, `preferCurrentTab`, `selfBrowserSurface`, `surfaceSwitching`, `monitorTypeSurfaces` | Ya (Chromium) | Tidak / diabaikan | Tidak / diabaikan |

- `CaptureController` (Chrome sekitar 109+) berguna untuk `setFocusBehavior('no-focus-change')` supaya tab yang di-share tidak merebut fokus ketika user menambah layar berikutnya.
- Panggilan berulang di satu halaman diakui spec W3C sebagai cara resmi multi-capture saat ini. Tidak ada batas yang terdokumentasi, tetapi UA boleh membatasi. Konkurensi di Firefox/Safari belum terverifikasi dari sumber resmi, jadi perlu diuji di spike.

**Keyakinan:** Sedang (audio dan HTTPS: tinggi via MDN/caniuse; perilaku multi-call per browser: belum ada sumber resmi spesifik).

**Sumber:** [MDN getDisplayMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia) · [caniuse audio capture](https://caniuse.com/mdn-api_mediadevices_getdisplaymedia_audio_capture_support) · [caniuse systemAudio](https://caniuse.com/mdn-api_mediadevices_getdisplaymedia_systemaudio_option) · [W3C issue #204 multi-capture](https://github.com/w3c/mediacapture-screen-share/issues/204) · [WICG Multicapture](https://wicg.github.io/multicapture/) · [WebKit Safari 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)

## 7. Electrobun (2.0.6) dan capture media

**Kesimpulan:** `getUserMedia` (kamera/mic) **didukung**. Renderer CEF meng-handle `OnRequestMediaAccessPermission` dengan dialog native Allow/Block yang di-cache per origin, dan origin `views://` otomatis diizinkan. WKWebView (mac) memakai `requestMediaCapturePermissionForOrigin`. Ada template resmi `photo-booth`. Untuk **`getDisplayMedia` di Electrobun: tidak ditemukan bukti bahwa ia bekerja.** Tidak ada issue, docs, atau contoh yang menyebutnya.
- Electrobun membuat browser CEF dengan `CEF_RUNTIME_STYLE_ALLOY`. Alloy tidak punya picker layar bawaan Chrome. Laporan upstream CEF #3667 (masih open) menyebut `getDisplayMedia` di CEF berujung `NotAllowedError` atau men-share semua layar tanpa picker.
- Handler permission di Electrobun meneruskan semua bit `requested_permissions` (`callback->Continue(requested_permissions)`), jadi izin desktop capture *mungkin* lolos. Dialog di macOS hanya bertuliskan "camera/microphone", dan TCC Screen Recording tetap harus diizinkan user.
- Implikasinya, desktop multi-share kemungkinan butuh picker native sendiri (enumerasi layar/jendela lalu media ID). Perlakukan ini sebagai risiko terbuka dan uji di spike terpisah sebelum berkomitmen ke Electrobun.

**Keyakinan:** Rendah untuk screen share (inferensi dari source), tinggi untuk kamera/mic.

**Sumber:** [electrobun nativeWrapper.mm (macOS)](https://github.com/blackboardsh/electrobun/blob/main/package/src/native/macos/nativeWrapper.mm) · [CEF.md (versi CEF)](https://github.com/blackboardsh/electrobun/blob/main/CEF.md) · [Issue #408 WKWebView permissions](https://github.com/blackboardsh/electrobun/issues/408) · [Issue #75 mic access](https://github.com/blackboardsh/electrobun/issues/75) · [photo-booth template](https://github.com/blackboardsh/electrobun/blob/main/templates/photo-booth/README.md) · [CEF #3667](https://github.com/chromiumembedded/cef/issues/3667)

## 8. Skala & produksi self-host

**Kesimpulan:** **Satu room harus muat di satu node.** Benchmark resmi di c2-standard-16 (16 core):

| Skenario | Pub | Sub | Bandwidth out | CPU |
|---|---|---|---|---|
| Audio besar | 10 | 3000 | 23 MBps | 80% |
| Meeting besar 720p simulcast | 150 | 150 | 93 MBps | 85% |
| Livestream 720p | 1 | 3000 | 531 MBps | 92% |

- Beban ditentukan jumlah track × subscriber. Untuk app ini, tiap share tambahan = satu track video lagi ke semua peserta, sehingga rumus kasarnya adalah (jumlah share + kamera) × (N−1) subscription. Maintainer mengakui angka ini bisa sudah tidak akurat (issue #3285: user hanya mencapai sekitar 1500 sub). Wajib `lk load-test` di hardware sendiri.
- Internet/produksi: domain + sertifikat TLS untuk signal (7880 di belakang LB/reverse proxy TLS), UDP 50000–60000, TCP 7881, **TURN bawaan** dengan domain dan sertifikat terpisah (`turn.domain`, `tls_port: 443` atau 5349, `udp_port: 3478`/443) untuk jaringan korporat. Set `rtc.use_external_ip: true`.
- Redis hanya wajib untuk multi-node (routing room antar node). Single node tidak membutuhkannya. Egress (rekaman, v1.15.0) dan Ingress opsional; keduanya butuh Redis dan berjalan sebagai service terpisah.

**Keyakinan:** Tinggi (angka dari docs resmi; kecukupan untuk workload multi-share belum diukur).

**Sumber:** [Benchmarking](https://docs.livekit.io/transport/self-hosting/benchmark/) · [Self-hosting overview](https://docs.livekit.io/transport/self-hosting/) · [Deployment](https://docs.livekit.io/transport/self-hosting/deployment/) · [Ports & firewall](https://docs.livekit.io/transport/self-hosting/ports-firewall/) · [livekit #3285](https://github.com/livekit/livekit/issues/3285) · [livekit #3041](https://github.com/livekit/livekit/issues/3041)

## 9. Drag-drop & resize (React 19)

**Kesimpulan, satu rekomendasi:** **`@dnd-kit/react` 0.5.3** (2026-10-31, peer React ^18 || ^19) untuk tukar slot, ditambah **`react-resizable-panels` 4.22.1** (2026-11-13, peer React ^18 || ^19) lewat komponen shadcn `Resizable` untuk resize. Template (berdampingan/grid/fokus) dipetakan ke struktur `Group`/`Panel` bersarang, dan tiap panel menjadi droppable slot.

| Paket | Versi / rilis | Status | Catatan |
|---|---|---|---|
| `@dnd-kit/core` + `sortable` | 6.3.1 / 10.0.0 (Des 2024) | Legacy, docs diarsipkan Feb 2026 | Jangan dipakai untuk kode baru |
| `@dnd-kit/react` | 0.5.3 (Okt 2026) | Aktif, masih 0.x (API bisa berubah) | Pengganti resmi, dibangun di atas `@dnd-kit/dom` |
| `react-resizable-panels` | 4.22.1 (Nov 2026) | Sangat aktif; v4 ganti API (`Group`/`Separator`/`orientation`) | Dipakai shadcn Resizable versi terbaru; ada `Grid` dan `Workspace` (tab drag) |
| `react-grid-layout` | 2.3.0 (Okt 2026) | Aktif | Drag+resize dalam satu paket, tetapi model koordinat grid lebih cocok untuk dashboard bebas daripada template slot |

- Catatan: `Workspace` di react-resizable-panels 4.20+ sudah punya drag tab dan dock. Fitur ini menarik, tetapi sangat baru dan cepat berubah. Mulai dengan dnd-kit, lalu evaluasi ulang bila swap slot ternyata cukup dilayani Workspace.
- Pin versi `@dnd-kit/react` secara eksak karena masih 0.x.

**Keyakinan:** Sedang (versi/peer dari npm registry; kecocokan arsitektur adalah penilaian).

**Sumber:** [npm @dnd-kit/react](https://www.npmjs.com/package/@dnd-kit/react) · [dnd-kit releases](https://github.com/clauderic/dnd-kit/releases) · [react-resizable-panels CHANGELOG](https://github.com/bvaughn/react-resizable-panels/blob/main/CHANGELOG.md) · [shadcn Resizable](https://ui.shadcn.com/docs/components/radix/resizable) · [shadcn #9136 (v4 break)](https://github.com/shadcn-ui/ui/issues/9136) · [npm react-grid-layout](https://www.npmjs.com/package/react-grid-layout)

---

## Risiko terbuka untuk spike berikutnya
1. Uji 3 atau lebih share dari satu klien Chrome (CPU encoder, perilaku `RoomEvent.TrackPublished`) dan concurrency multi-call di Firefox/Safari.
2. Screen share di Electrobun/CEF Alloy. Jika gagal, desktop butuh picker native, atau pertimbangkan Electron (punya `setDisplayMediaRequestHandler`).
