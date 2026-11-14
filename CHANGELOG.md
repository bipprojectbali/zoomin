# Changelog

Format mengikuti [Keep a Changelog](https://keepachangelog.com/). Belum ada versi yang dirilis atau dideploy
(`package.json` belum punya field `version`).

## [Unreleased]

### Added

- Login admin dengan password dari env, lalu lobby berisi daftar room (ter-paginate) dan form buat room.
- Link undangan per room dan per peran (admin, participant, viewer) dengan masa berlaku (default 72 jam, maks
  720 jam). Tamu cukup mengisi nama untuk masuk.
- Halaman room dengan kamera dan mic. Viewer tidak mendapat kontrol publish.
- "Tambah layar": satu peserta bisa membagikan beberapa layar sekaligus, termasuk audio layar di Chromium.
  Tiap layar bisa dihentikan sendiri.
- Panggung dengan template side-by-side, grid, dan focus. Admin room bisa menukar slot dengan drag-drop dan
  me-resize panel; semua penonton, termasuk yang join belakangan, melihat layout yang sama.
- Layout tersimpan dan dipulihkan saat room dibuka ulang. Perubahan bersamaan dari dua admin tidak saling
  menimpa diam-diam (konflik ditolak).
