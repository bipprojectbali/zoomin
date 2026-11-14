# Bug app dari e2e

Ditemukan suite Playwright (`bun run test:e2e`). Test repro ditandai `test.fail()` + `// BUG(e2e): E2E-xx`;
begitu bug diperbaiki test itu jadi "unexpectedly passed" → hapus `test.fail()`.

## E2E-01 — Dialog yang dibuka ulang cepat tertutup overlay-nya sendiri (tidak bisa diklik)

- **Test:** `e2e/dialog.spec.ts` › "dialog konfirmasi Keluar dibuka ulang cepat tetap bisa diklik"
- **Dampak:** sedang. Konfirmasi Keluar (room) dan konfirmasi Logout tamu (lobby) tampil redup dan semua tombolnya
  tidak bisa diklik; hanya Escape yang menutupnya. Terjadi pada pemakaian wajar: klik Batal lalu langsung klik
  tombol pemicu lagi. Sempat bikin `lobby.spec.ts` & `session.spec.ts` flaky (timeout 60 dtk) sebelum test-nya
  menunggu animasi tutup selesai.
- **Langkah reproduksi:**
  1. Masuk room, klik `leave-room` → dialog "Keluar dari room?" muncul.
  2. Klik "Batal".
  3. 160-190 ms kemudian klik `leave-room` lagi.
  4. Dialog muncul tapi lebih gelap; klik "Keluar"/"Batal" tidak berpengaruh.
- **Ekspektasi:** dialog yang terbuka selalu berada di atas overlay dan bisa diklik.
- **Aktual:** `document.elementFromPoint` di tengah konten mengenai `[data-slot="alert-dialog-overlay"]`. Playwright:
  `<div data-state="open" data-slot="alert-dialog-overlay" …> intercepts pointer events`. Terukur stabil: jeda
  160-190 ms → macet di setiap percobaan; <150 ms klik mengenai overlay lama (tidak membuka); ≥200 ms normal.
- **Dugaan akar:** `src/web/components/ui/alert-dialog.tsx` (pola sama di `dialog.tsx`). Overlay dan konten adalah
  saudara di portal `body` dengan `z-50` yang sama, jadi urutan tumpuk ditentukan urutan DOM. Animasi keluar overlay
  (default tw-animate ±150 ms) lebih pendek daripada konten (`duration-200`). Dibuka ulang di jendela 150-200 ms:
  overlay lama sudah unmount, konten lama masih ter-mount (Radix Presence) lalu dipakai ulang, sedangkan overlay
  baru di-append **setelah** konten → overlay di atas konten. Arah perbaikan: konten z-index lebih tinggi dari
  overlay (mis. overlay `z-50`, konten `z-[51]`) atau samakan durasi animasi overlay & konten.
  `sheet.tsx` (panel peserta) diuji dengan cara sama dan **tidak** terdampak.
- **Bukti:** jalankan test tanpa `test.fail()` → pesan berisi daftar jeda yang macet (mis. `[160, 165, …, 195]`),
  trace & screenshot di `e2e/.artifacts/results/dialog-dialog-konfirmasi-*/` (folder artefak di-reset tiap run).

## Catatan (bukan bug app, tidak di-`test.fail`)

- **Bentrok `data-testid="stage"`** (sudah beres): panel Fokus kini ber-id `focus-main`/`focus-strip`, jadi
  `data-testid="stage"` tunggal dan `stage()` di `fixtures.ts` cukup `getByTestId("stage")`.
- **Peserta yang keluar sangat cepat tidak memicu toast:** bila tamu keluar sebelum LiveKit menyiarkannya ke peserta
  lain (~<1 dtk setelah connect), admin tidak pernah menerima `ParticipantConnected`/`Disconnected`, jadi tak ada
  toast "bergabung"/"keluar". Perilaku LiveKit, wajar.
- **Menu Radix dibuka ulang saat masih animasi tutup diabaikan** (`screen-list`): klik pemicu ~200 ms setelah
  Escape tidak membuka menu. Kosmetik; test menunggu menu benar-benar tertutup.
