# 07 — Load test kasar dengan `lk load-test`

Tujuan: angka kapasitas kasar di laptop dev untuk skenario "banyak screen share dalam satu room".
Ini bukti awal, **bukan** angka produksi.

## Lingkungan

- Mesin: Apple M1, 8 core, 8 GB RAM, macOS (Darwin 24.5.0).
- Server: `livekit-server` v1.13.11 `--dev --bind 0.0.0.0` (PID dari `.run/livekit.pid`), tidak di-restart selama test.
- CLI: `lk` **v2.19.4** (rilis terbaru per GitHub API, terbit 2026-11-10). Binary resmi
  `lk_2.19.4_darwin_arm64.tar.gz`, SHA-256 cocok dengan `checksums.txt` rilis
  (`0732343947a08c1cb495bf7a5c4a0dab2cc2caecd1f67d9eba3fdf01ae3f2cee`). Lokasi: `.bin/lk`.
- Mesin tidak "bersih": Brave, tailscaled (~30% CPU), Orca, dll. ikut jalan. CPU idle mesin saat diam sudah
  berfluktuasi 40–75%, jadi angka CPU mesin cukup berisik.

## Perintah

```bash
export LK_NO_SKILLS_PROMPT=1
.bin/lk load-test --dev --url ws://127.0.0.1:7880 --room lt-<nama> \
  --video-publishers <P> --subscribers <S> \
  --video-resolution high --layout 4x4 --duration 45s --num-per-second 10
```

- Simulcast aktif (default; tidak memakai `--no-simulcast`). Codec tidak diset, jadi h264 dan vp8 dipakai campur.
- `--layout 4x4`: tiap subscriber berlangganan sampai 16 track (semua screen share terlihat, tile kecil).
  Layout `speaker` juga dicoba, tetapi hanya berlangganan 6 track per subscriber (120/160 dan 180/480 track),
  sehingga tidak mewakili skenario kita. Hasilnya dicantumkan sebagai pembanding saja.
- `ws://127.0.0.1:7880` langsung berhasil; tidak perlu IP LAN.
- Sampling setiap ~3 detik: `ps -o %cpu=,rss= -p <pid livekit>`, CPU idle mesin dari `top -l 1`, dan CPU proses `lk`.
  `%cpu` dari `ps` adalah persen **satu core** (100% = 1 core penuh; maksimum mesin 800%). Rata-rata
  mengabaikan dua sampel pertama (fase join).

## Hasil

| Skenario | Pub × Sub | Track subscribed | Bitrate total (rata-rata/sub) | Packet loss | CPU livekit avg / max | RSS livekit max | CPU idle mesin avg | CPU `lk` avg |
|---|---|---|---|---|---|---|---|---|
| a (baseline) | 4 × 10 | 40/40 | 12.1 Mbps (1.2) | 0 (0%) | 12% / 36% | 101 MB | 66% | 9% |
| b | 8 × 20 | 160/160 | 39.8 Mbps (2.0) | 0 (0%) | 35% / 75% | 283 MB | 66% | 22% |
| d (tambahan) | 12 × 24 | 288/288 | 69.0 Mbps (2.9) | 365 (0.08%) | 49% / 116% | 241 MB | 37% | 47% |
| c | 16 × 30 | 480/480 | 77.3 Mbps (2.6) | 42 130 (**7.5%**) | 69% / 225% | 356 MB | 42% | 64% |
| c (ulang) | 16 × 30 | 480/480 | 80.1 Mbps (2.7) | 28 018 (**5.0%**) | 67% / 214% | 234 MB | 42% | 60% |

Pembanding layout `speaker` (6 track per subscriber):

| Pub × Sub | Track subscribed | Bitrate total | Packet loss | CPU livekit avg / max |
|---|---|---|---|---|
| 8 × 20 | 120/160 | 63.3 Mbps (3.2/sub) | 0 (0%) | 47% / 58% |
| 16 × 30 | 180/480 | 92.6 Mbps (3.1/sub) | 305 (0.06%) | 57% / 95% |

Catatan:
- Skenario a memakai `--layout 4x4` juga; dengan 4 track per subscriber, layout tidak membatasi.
- Pada 4x4 tiap track hanya ~150–380 kbps di sisi subscriber: SFU mengirim layer simulcast rendah/menengah
  untuk tile kecil. Ini sesuai desain "tile kecil", tetapi tile besar (layer tinggi) belum diuji dengan proporsi
  yang sama dengan layout admin kita.
- Tidak ada error koneksi di semua skenario. Log server berisi WARN `error reading data channel` (saat tester
  disconnect di akhir) dan beberapa `could not get packet from bucket` / `too much ext packets` (indikasi
  buffer/NACK di beban tinggi).
- Server tetap hidup setelah semua test (RSS ~260 MB setelah test terakhir, CPU kembali 0%).

Kenaikan dihentikan di 16 × 30 karena packet loss 5–7.5% (konsisten di dua percobaan).

## Batasan

- **Satu mesin menjalankan semuanya**: publisher simulasi, subscriber simulasi, dan server. Proses `lk` sendiri
  memakan 60%+ core di skenario c, dan semua lalu lintas lewat loopback. Packet loss di c kemungkinan sebagian
  besar datang dari kontensi CPU/scheduler di mesin ini, bukan batas SFU. Angka ini **meremehkan** kapasitas
  server di mesin khusus.
- **Localhost**: tanpa latensi, jitter, atau batas bandwidth jaringan nyata. Di jaringan nyata, bandwidth uplink
  server (80 Mbps keluar pada skenario c) dan downlink penonton lebih cepat menjadi batas.
- **Bukan browser**: tester `lk` tidak men-decode video. Biaya decode 8–16 stream di browser penonton (terutama
  laptop murah/HP) tidak tercakup, dan kemungkinan menjadi batas pertama untuk banyak screen share.
- Video sintetis, bukan konten screen share sungguhan (teks/slide dengan motion rendah dan resolusi tinggi).
  Profil bitrate screen share nyata berbeda.
- Durasi 45 detik per skenario, mesin berisik (aplikasi lain jalan), dan n=1–2 per skenario.

## Kesimpulan

- Di M1 laptop ini, **8 screen share + 20 penonton** (160 track) bersih: loss 0%, livekit ~35% satu core,
  RSS < 300 MB.
- **12 × 24** (288 track) masih layak: loss 0.08%.
- **16 × 30** (480 track) mulai rusak: loss 5–7.5%, livekit memuncak ~2 core, mesin ~58% terpakai bersama
  load generator. Titik jenuh mesin ini (server + generator bersama) ada di antara 12 × 24 dan 16 × 30.
- Biaya SFU naik kira-kira linear terhadap jumlah track yang di-forward (pub × sub); 480 track ≈ 0.7 core
  rata-rata. CPU server bukan masalah utama di skala satu room; jaringan dan decode di klien lebih mungkin
  jadi batas.

## Rekomendasi load test di server produksi

1. Jalankan `lk load-test` dari **mesin terpisah** (idealnya 2+ mesin generator di jaringan berbeda), arahkan ke
   server produksi dengan config YAML (bukan `--dev`), lewat TLS/domain yang sama dengan klien.
2. Ulangi matriks 8×20, 12×24, 16×30, lalu naik (16×50, 24×50) sampai loss > 1% atau CPU server > 80% dari total.
   Pantau CPU/RAM server, bandwidth NIC keluar, dan metrik Prometheus LiveKit (`prometheus_port`).
3. Uji codec tetap (`--video-codec vp8` dan `h264` terpisah) dan durasi lebih lama (10–15 menit) untuk melihat
   kebocoran memori.
4. Tambahkan uji manual di browser: 8–16 screen share sungguhan ke 2–3 perangkat penonton kelas rendah untuk
   mengukur CPU decode dan frame drop. Ini yang paling mungkin membatasi fitur multi-screen-share.
5. Uji layout admin yang sebenarnya (1–2 tile besar di layer tinggi + sisanya kecil): `lk load-test` hanya punya
   preset `speaker`/`3x3`/`4x4`/`5x5`, jadi proporsi ini perlu klien uji sendiri atau test di browser.
