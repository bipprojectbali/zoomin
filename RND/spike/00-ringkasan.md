# 00 — Ringkasan Spike (per 2026-11-14)

Status kode spike `lk-bun/`: `bun test` **56 pass, 0 fail, 8 file** (dijalankan ulang 2026-11-14, LiveKit dev
server lokal aktif). `bun run typecheck` bersih. Runtime Bun 1.4.2.

Catatan: temuan spike ini sudah dipakai di implementasi M1–M3 (branch `feature/m1-m3-core`), termasuk penghapusan `roomAdmin` dan role dari DB.

Legenda: ✅ terbukti runtime · 📚 terbukti lewat riset docs/source (belum runtime) · ⏳ belum diuji · ❌ gagal/tidak terbukti.

## Tabel spike

| # | Pertanyaan | Hasil | Bukti |
|---|---|---|---|
| 01 | Bisakah livekit-server dijalankan lokal, dan apa syarat produksi? | ✅ v1.13.11 jalan (`--dev`, port 7880/7881/7882). **Tidak ada binary macOS resmi**, jadi dibuild dari source (Go ≥1.26, CGO aktif). Produksi pakai binary Linux resmi atau Docker. | `01-livekit-server.md` |
| 02 | Riset: multi share, codec, adaptive, layout sync, komponen React, browser, Electrobun, skala, drag/resize | 📚 Semua topik terjawab, dengan tingkat keyakinan per topik | `02-research.md` |
| 03 | Bisakah backend Bun/Elysia menerbitkan token per role, dan apakah server menegakkan grant? | ✅ `POST /token`, 16 test. Viewer publish **ditolak lewat timeout ~10 dtk**, tanpa error cepat. Elysia mengembalikan 422 untuk validasi, jadi dipetakan ke 400. | `03-token-elysia.md`, `lk-bun/src/token.ts`, `api.ts` |
| 04 | Bisakah 1 peserta publish ≥2 screen share + kamera + mic, dan apakah A vs B diterima peserta ketiga? | ✅ 3 screen + camera + mic dari 1 peserta, frame mengalir tanpa tertukar (cek warna piksel). A vs B jalan. Pembeda antar layar hanya **nama track**. | `04-multi-screenshare.md`, `lk-bun/src/multishare.test.ts` |
| 05 | Apakah room metadata cocok jadi sumber kebenaran layout? | ✅ Median ~1 ms (lokal), late joiner langsung dapat, non-admin 401. **Token `roomAdmin` bisa menulis metadata mentah (200).** Last-write-wins. | `05-layout-sync.md`, `lk-bun/src/layout.ts` |
| 06 | Apakah multi screen share jalan di browser nyata (getDisplayMedia berulang, stop/ended, audio layar, CPU)? | ⏳ Halaman uji + checklist siap, **belum dijalankan user** | `06-browser-manual.md`, `lk-bun/src/dev-web.ts`, `lk-bun/web/` |
| 07 | Berapa kapasitas kasar SFU untuk banyak screen share dalam satu room? | ✅ dengan catatan. `lk` v2.19.4, layout 4x4, simulcast. 8 pub×20 sub (160 track) loss 0%, 12×24 0.08%, 16×30 loss 5–7.5%. **Lokal: M1 laptop, server + generator di satu mesin, loopback, tanpa decode browser.** Angka meremehkan server khusus, bukan angka produksi. | `07-load-test.md` |

## Versi terverifikasi

| Paket | Versi | Status | Sumber |
|---|---|---|---|
| livekit-server | 1.13.11 | runtime ✅ | 01 |
| livekit-server-sdk | 2.19.3 | runtime ✅ | 03, 04, 05 |
| @livekit/rtc-node | 1.2.2 (di Bun 1.4.2) | runtime ✅ (hanya test) | 03, 04, 05 |
| elysia | 1.4.32 | runtime ✅ | 03 |
| lk (LiveKit CLI) | 2.19.4 | runtime ✅ (`.bin/lk`, SHA-256 cocok) | 07 |
| livekit-client | 2.24.0 | dipakai halaman uji, belum diuji manual ⏳ | 06 |
| typescript | 7.0.2 | typecheck ✅ | `lk-bun/package.json` |
| @livekit/components-react | 2.9.25 | riset 📚 | 02 §5 |
| @dnd-kit/react | 0.5.3 (0.x, pin exact) | riset 📚 | 02 §9 |
| react-resizable-panels | 4.22.1 | riset 📚 | 02 §9 |
| Electrobun | 2.0.6 (CEF 147) | riset 📚, screen share ❌ tidak terbukti | 02 §7 |

## Kesimpulan

1. **LiveKit self-hosted memenuhi pembeda produk di level SFU.** Satu peserta bisa membawa beberapa layar, beberapa
   peserta bisa share bersamaan, dan server tidak membatasi jumlah track screen share (04; 02 §1).
2. **Layout terpusat lewat room metadata layak.** Cepat dan persisten selama room hidup, dan hanya bisa ditulis
   lewat server API (05).
3. **Backend Bun + Elysia + livekit-server-sdk cukup** untuk token dan kontrol room (03, 05).
4. **Spike memuat dua keputusan keamanan yang tidak boleh terbawa ke produk:**
   - `token.ts` memberi `roomAdmin` ke admin. Ini harus dihapus, karena token itu bisa menulis room metadata
     tanpa validasi (05).
   - `api.ts` menerima `role` dari body request. Di produk, role harus diambil dari DB/sesi backend.
     Inferensi dari kode `api.ts`.
5. **Viewer:** UI wajib menyembunyikan kontrol publish. Jangan menunggu error server, karena error baru muncul
   setelah timeout ~10 dtk (03).
6. **Browser:** multi share = panggil `getDisplayMedia` berulang lewat `publishTrack` manual.
   `setScreenShareEnabled` hanya mengelola 1 share (02 §1, 04).

## Yang belum terbukti

| Item | Kenapa penting | Rencana | Sumber |
|---|---|---|---|
| getDisplayMedia berulang di Chrome/Edge/Firefox/Safari, stop/ended, audio layar | Inti produk ada di browser, sedangkan 04 hanya membuktikan rtc-node | M0: checklist 06 | 06, 02 §6 |
| CPU encoder klien untuk 2–3 layar resolusi nyata + kamera | Batas praktis ada di encoder dan uplink, dan belum ada angka resmi | M0: catat CPU per jumlah layar (tabel di 06) | 02 §1, 04 |
| Kapasitas server produksi untuk workload multi share | 07 hanya lokal (satu mesin, loopback); bandwidth NIC/uplink nyata belum diukur | M0/M4: `lk load-test` dari mesin terpisah ke server produksi (rekomendasi 07) | 07, 02 §8 |
| Decode 8–16 stream di browser penonton | Tester `lk` tidak men-decode; kemungkinan batas pertama multi share | M0/M4: uji manual di 2–3 perangkat kelas rendah | 07 §Batasan |
| Tile besar di layer simulcast tertinggi (layout admin) | 07 hanya 4x4 (tile kecil, ~150–380 kbps/track) | M3/M4: klien uji atau browser | 07 |
| Codec VP8 + simulcast + layer h360fps3 + contentHint di browser | Halaman uji 06 belum mengatur encoding/simulcast layer | M2 | 02 §2 |
| Simulcast/dynacast pada resolusi layar 1080p/4K | 04 hanya menguji 640x360 15 fps dengan dynacast mati | M0/M2 | 04 |
| Latency glass-to-glass | 04/05 hanya mengukur di localhost, tanpa timestamp di frame | M0: stopwatch manual (06) | 04, 05 |
| Akses dari internet ke server di IP Tailscale 100.64.0.8 | IP CGNAT/Tailscale tidak bisa dijangkau klien di luar tailnet | Keputusan terbuka, lihat `../plan/04-risiko-keputusan.md` | 01 §Deploy |
| Screen share di Electrobun (CEF Alloy) | Tidak ada picker. CEF #3667 masih open. | M5, cadangan Electron | 02 §7 |
| >3 share dari satu klien | Hanya 3 yang diuji | M0 | 02 §1, 04 |
