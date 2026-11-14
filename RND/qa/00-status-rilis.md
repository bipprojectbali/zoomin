# 00 — Status rilis 0.1.0

Tanggal: 2026-11-14 · Branch: `feature/prod-ready` · Status: **siap dideploy, belum dideploy** (deploy butuh perintah
user). Sumber: `01-ux-audit.md`, `02-ux-recheck.md`, `e2e/BUGS.md`, commit `0735bca`..`25bc5aa`.

## Bukti

| Cek | Hasil |
|---|---|
| `bun test` | 330+ pass, 0 fail (unit + integrasi dengan LiveKit dev) |
| `bun run typecheck` | bersih |
| `bun run test:e2e` | 28/28, stabil (Playwright Chromium, kamera/mic/layar palsu) |
| `bun run build` | sukses; JS login/lobby 130 KB gzip (sebelumnya satu bundle 403 KB gzip) |
| QA mode produksi | ego-browser + Playwright, `02-ux-recheck.md` |
| CSP dari `deploy/Caddyfile.example` | 0 pelanggaran |

## Temuan audit 01 & 02

Legenda: ✅ beres · ⏸ sengaja ditunda. P0: tidak ada di kedua audit.

### P1

| ID | Ringkas | Status |
|---|---|---|
| UX-01 | Pre-join | ✅ |
| UX-02 | Control bar standar + Keluar merah | ✅ |
| UX-03 | Indikator mic mati / bicara | ✅ |
| UX-04 + QA-01 | Daftar peserta; tile avatar untuk peserta tanpa kamera | ✅ |
| UX-05 | Toast masuk/keluar/share | ✅ |
| UX-06 | Slot mati: nama, hapus dari layout | ✅ |
| UX-07 | Error berbahasa Indonesia | ✅ |
| UX-08 | Undangan saat sudah bersesi | ✅ |
| UX-09 | Izin kamera/mic ditolak, perangkat sibuk | ✅ (diuji dengan stub; izin OS asli belum) |
| UX-10 | Audio diblokir autoplay | ✅ (kode; pre-join jadi gesture) |
| UX-11 | Status reconnect/putus | ✅ |
| UX-12 | Perbesar / layar penuh lokal | ✅ |
| UX-13 | Undang dari room + judul di header | ✅ |
| BUG-03 | Kontrol aktif setelah putus | ✅ |
| QA-02 | Layar sendiri dirender sebagai cermin | ✅ |

### P2

| ID | Ringkas | Status |
|---|---|---|
| UX-14..UX-28 | Shortcut, mirror + "(Anda)", a11y tile/splitter, fokus ring, label layar, default layout, mobile, overlay admin, lobby, format undangan, halaman error/login/keluar, avatar, menu perangkat | ✅ |
| BUG-01 | Validasi ID room di browser | ✅ |
| BUG-02 | 404 kosong | ✅ |
| E2E-01 | Dialog dibuka ulang cepat tidak bisa diklik | ✅ (`test.fail` sudah dihapus) |
| QA-03 | Slot yatim: nama, avatar "PK", fokus nyangkut | ✅ |
| QA-04 | Avatar tile kecil dobel nama | ✅ |
| QA-05 | Putus jaringan tanpa tanda 15 dtk / reconnect 2 menit | ✅ banner instan, menyerah setelah ±45 dtk. Stage sengaja tidak diredupkan (D6) |
| QA-06 | Kontras merah dark mode | ✅ AA di kedua tema |
| QA-07 | Konsistensi bahasa & label | ✅ |
| QA-08 | "Layout otomatis" untuk semua orang | ✅ hanya admin |
| QA-09 | Pre-join tanpa jalan kembali | ✅ untuk pengguna bersesi; tamu tanpa sesi sengaja tanpa tombol (D8) |

### P3

| ID | Ringkas | Status |
|---|---|---|
| UX-29 | Ingat preferensi perangkat | ✅ |
| QA-10 | Noise konsol produksi | ✅ |
| QA-11 | Teks rate limit tanpa lama tunggu | ✅ |
| QA-12 | Bundle tunggal 1,38 MB | ✅ code splitting |
| QA-13 | Peringatan sesi di `/` | ✅ |
| QA-14 | Copy sesi ganda | ✅ |
| QA-15 | Panel undangan selalu terbuka; "Admin / Admin" | ✅ |
| QA-16 | Urutan Tab stage sebelum kontrol | ⏸ shortcut ⌘/Ctrl+D/E menutup sebagian |
| QA-17 | ID room kosong tidak kembali ke otomatis | ✅ |
| QA-18 | `data-testid="stage"` ganda | ✅ |

## Sengaja ditunda (bukan 0.1.0)

- Chat, angkat tangan, reaksi (UX-31).
- Toggle tema; tema mengikuti OS (UX-30).
- Daftar dan pencabutan link undangan (R18; butuh tabel `invites`).
- Pilihan speaker di pre-join (D9); di dalam room sudah ada.
- Single binary (`bun build --compile`); rilis memakai tarball + `bun install --production`.
- Skip-link ke kontrol (QA-16).
- Desktop app (M5).

## Butuh tangan user

1. **Uji perangkat nyata**: picker layar asli (tab/jendela/seluruh layar, centang audio), izin OS (macOS Screen
   Recording, kamera/mic), Chrome + Edge + Firefox + Safari. Checklist `RND/spike/06-browser-manual.md`.
2. **Jaringan**: HP via data seluler, laptop di jaringan lain, dan jaringan yang memblokir UDP (media harus lewat
   TURN/TLS 443, `deploy/README.md` §Verifikasi 4).
3. **Keputusan domain final (K3)** dan konfirmasi K1 (default publik, D1 di `RND/plan/04-risiko-keputusan.md`).
4. **Perintah deploy** dan isi secret di server (`/etc/zoomin/zoomin.env`, `/etc/livekit/keys.yaml`).
5. Load test produksi dari mesin terpisah + uji decode di perangkat kelas rendah (kriteria M0/M4).

## Checklist pre-deploy (Rule 6)

| # | Item | Status | Catatan |
|---|---|---|---|
| 1 | Test | ✅ | `bun test` 330+ pass 0 fail; e2e 28/28 |
| 2 | Type check | ✅ | `bun run typecheck` bersih |
| 3 | Lint | N/A | Belum ada linter di project (tidak ada script `lint` / config ESLint/Biome). Typecheck strict jadi pengganti sementara |
| 4 | Build | ✅ | `bun run build` → `dist/web`; produksi menolak start tanpa build |
| 5 | Migrasi tanpa gap | ✅ | Satu migrasi `migrations/0001_init.sql`, idempotent, jalan otomatis saat start; deploy pertama tanpa DB lama |
| 6 | Credential leak | ✅ | `.env.example` tanpa nilai secret; password e2e ditandai test-only; secret produksi dibuat di server (`deploy/README.md` §Secret). Ulangi scan sebelum `git push` |
| 7 | CHANGELOG | ✅ | `## [0.1.0] - 2026-11-14`, sama dengan `version` di `package.json` |
| 8 | Breaking change / rollback | ✅ | Rilis pertama, tidak ada breaking change. Rollback: symlink rilis lama + backup SQLite pra-deploy, LiveKit per versi (`deploy/README.md` §Rollback) |

Item 1–8 tidak ada ❌. Deploy tetap menunggu perintah user dan butir "Butuh tangan user" 3–4.
