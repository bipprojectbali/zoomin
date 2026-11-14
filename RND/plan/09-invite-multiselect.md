# 09 — Pemilih undangan multi-select (dropdown + checkbox) (spec terkunci 2026-11-15)

Permintaan user 2026-11-15 (screenshot form "Buat room baru" mode Private): input email jadi dropdown yang bisa dicari
dan ber-checkbox, bisa centang beberapa user sekaligus, bisa input manual bila tidak ada, email manual tersimpan dan
bisa dihapus. Mengganti perilaku dropdown P2 di `07-invite-picker.md`; P1, P3, P5, P6 tetap. Mengikat worker.

## Keputusan

| # | Keputusan |
|---|---|
| M1 | Dropdown terbuka saat input fokus/diklik **tanpa perlu mengetik**: menampilkan daftar akun terdaftar (urut nama) + email manual tersimpan (M4). Mengetik = memfilter (server untuk akun, lokal untuk email manual). |
| M2 | Tiap baris punya **checkbox** (`Checkbox` shadcn yang sudah ada, `role="option"` + `aria-selected`/`aria-checked` sesuai pola listbox multi `aria-multiselectable="true"`). Klik baris / Space / Enter = toggle centang; dropdown **tetap terbuka** setelah toggle (multi-select). Tercentang = ada di `value` (chip peran di bawah tetap, P3). Hapus centang = hapus dari `value`. Akun yang sudah tercentang tetap tampil (tercentang), bukan disembunyikan. Email sesi sendiri tidak tampil. |
| M3 | Teks berbentuk email valid yang tidak cocok dengan baris mana pun → baris "Tambah <email>" (ikon Mail). Memilihnya: email masuk daftar manual tersimpan (M4) **dan** langsung tercentang; input dikosongkan. Tempel banyak email (P2) tetap: semua valid → manual tersimpan + tercentang, tidak valid → chip bertanda seperti sekarang. |
| M4 | Email manual **tersimpan di `localStorage`** per user (`zoomin.invite.manual.<userId>`, array email ter-normalisasi, maks 50, terbaru di atas), dibaca/ditulis dalam `try/catch` (gagal = daftar kosong, fitur tetap jalan). Ditampilkan di dropdown dengan label kecil "Manual" + tombol hapus (ikon X, `aria-label` "Hapus <email> dari daftar"). Hapus = keluar dari daftar tersimpan **dan** dari `value` bila tercentang. Akun terdaftar tidak bisa dihapus dari dropdown (hanya dicentang/tidak). Email manual yang ternyata akun terdaftar (muncul di hasil server) → tampil satu kali sebagai akun. |
| M5 | Server: `GET /api/users/search` menerima `q` **opsional/kosong** (0–100 karakter setelah trim; kosong = semua akun non-banned urut nama). `USER_SEARCH_MIN` dihapus (filter mulai dari 1 huruf). `USER_SEARCH_MAX_RESULTS` naik 10 → 50, default limit 20. Akses, rate limit (30/menit), tanpa log/audit tetap (P4). Tanpa cursor — sengaja: daftar dropdown, bukan list admin; user mencari bila tak terlihat (catat di komentar). |
| M6 | Escape menutup dropdown saja (guard `onEscapeKeyDown` dialog yang ada tetap berlaku); klik di luar menutup. Backspace pada input kosong tetap menghapus chip terakhir. Placeholder: "Pilih atau cari orang, atau ketik email". |

## Kepemilikan file

- **wkr-ms-server**: `src/shared/api.types.ts` (konstanta saja), `src/server/users.search.route.ts`,
  `users.search.repository.ts`, `users.search.route.test.ts`, README §API (baris endpoint ini saja), CHANGELOG
  `[Unreleased]`.
- **wkr-ms-web**: `src/web/invite-picker/**` (boleh file baru mis. `invite.manual.store.ts` + test,
  `InviteOption.tsx`), `src/web/api.client.ts` (bila `searchUsers` perlu `q` kosong/limit), unit test web.
  Tidak menyentuh CreateRoomForm/MembersTab kecuali props picker berubah (hindari).
- **wkr-ms-e2e** (setelah keduanya): `e2e/invite-picker.spec.ts` (+ spec lain yang memakai picker bila rusak).
