# 06 — Uji Manual Browser: Multi Screen Share

Tujuan: membuktikan di browser nyata bahwa **satu peserta** bisa menekan "Tambah layar" berkali-kali
(`getDisplayMedia` berulang), mem-publish **beberapa screen share sekaligus** plus kamera & mic,
dan peserta lain melihat semuanya.

Kode: `lk-bun/src/dev-web.ts` (server), `lk-bun/web/index.html`, `lk-bun/web/app.ts`, `lk-bun/web/app.css`.

## Cara menjalankan

1. Jalankan LiveKit server lokal (mode dev): `livekit-server --dev` (default `ws://127.0.0.1:7880`, key `devkey`/`secret`).
   Untuk server lain set `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`.
2. Jalankan halaman uji:
   ```bash
   cd lk-bun
   bun src/dev-web.ts          # default http://localhost:5173, ganti dengan PORT=xxxx
   ```
3. Buka `http://localhost:5173` di dua tab/browser. Isi room yang sama dan nama berbeda (huruf/angka/`_`/`-`), klik **Join**.

Catatan secure context: `getDisplayMedia`/`getUserMedia` hanya jalan di secure context. `localhost` dianggap
secure, jadi cukup HTTP. **Dari device lain** (HP, laptop lain via IP LAN) wajib HTTPS — mis. lewat
reverse proxy/tunnel ber-TLS (Caddy, `cloudflared`, ngrok) — dan `LIVEKIT_URL` juga harus `wss://` yang bisa dijangkau device tersebut.

Fitur halaman: tombol Kamera/Mic (toggle), **Tambah layar** (tiap klik = `getDisplayMedia({video:true, audio:true})`
baru, publish sebagai `screen-N` source `screen_share`, audio-nya `screen-N-audio` source `screen_share_audio`),
daftar track lokal dengan tombol stop, grid track remote berlabel `identity (nama) / trackName [source] WxH`.
`adaptiveStream` & `dynacast` aktif. Error tampil merah di atas halaman (dan di console).

## Checklist uji manual

Isi kolom **Hasil** dengan ✅ / ❌ + catatan singkat. A = peserta publisher, B = penonton.

| # | Langkah | Yang diharapkan | Hasil |
|---|---------|-----------------|-------|
| 1 | A dan B join room sama (2 tab / 2 browser) | Status menunjukkan `remote=1` di kedua sisi, tanpa error | |
| 2 | A klik **Kamera** | B melihat tile `A / ... [camera]` dengan resolusi > 0 | |
| 3 | A klik **Mic**, bicara | B mendengar suara A; tile `[microphone]` muncul | |
| 4 | Cek echo: A & B di satu ruangan/tanpa headset | Catat ada/tidaknya echo/feedback (echoCancellation default browser) | |
| 5 | A klik **Tambah layar**, pilih layar/jendela 1 (centang "share audio" bila ada) | B melihat tile `screen-1 [screen_share]` (+ `screen-1-audio` bila audio dipilih) | |
| 6 | A klik **Tambah layar** lagi, pilih jendela/tab 2 | B melihat `screen-2` **bersamaan** dengan `screen-1` | |
| 7 | A klik **Tambah layar** ketiga kali, pilih jendela/tab 3 | B melihat 3 screen share + kamera sekaligus; daftar lokal A berisi semua track | |
| 8 | A klik **stop** pada `screen-2` di daftar lokal | Tile `screen-2` hilang di B; `screen-1` & `screen-3` tetap jalan | |
| 9 | A klik "Stop sharing" bawaan browser pada `screen-1` | Event `ended` → `screen-1` (dan audionya) unpublish, hilang di B | |
| 10 | A batalkan dialog `getDisplayMedia` (Cancel) | Error `NotAllowedError` tampil di UI, track lain tidak terganggu | |
| 11 | B juga **Tambah layar** 2x | A melihat screen share B; dua arah jalan | |
| 12 | A klik **Keluar** | Semua tile A hilang di B | |

### Matriks browser

Ulangi minimal langkah 1, 5, 6, 7, 8, 9 per browser (sebagai A/publisher; B boleh Chrome).

| Browser (versi) | OS | Multi screen (5-7) | Audio layar | Stop/ended (8-9) | Catatan |
|-----------------|----|--------------------|-------------|------------------|---------|
| Chrome | | | | | |
| Edge | | | | | |
| Firefox | | | | | Audio layar umumnya tidak didukung |
| Safari | | | | | Audio layar umumnya tidak didukung; cek dialog picker berulang |

## Yang perlu dicatat

| Item | Cara ukur | Nilai |
|------|-----------|-------|
| CPU publisher (1 / 2 / 3 layar + kamera) | Activity Monitor / Task Manager, proses browser tab A | |
| CPU penonton | idem, tab B | |
| Resolusi diterima per screen share | Label `WxH` di tile B (berubah dengan adaptiveStream sesuai ukuran tile) | |
| Resolusi kamera diterima | Label tile kamera di B | |
| Delay kasar layar | Share jendela berisi stopwatch (mis. `time.is`), bandingkan dengan aslinya di A | |
| Delay kasar audio/video kamera | Tepuk tangan di depan kamera, bandingkan di B | |
| Error/peringatan console | DevTools Console di A & B | |
