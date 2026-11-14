# 10 — UI & README dalam English (spec terkunci 2026-11-15)

Permintaan user 2026-11-15: README dan app memakai English sesuai standar industri; Bahasa Indonesia **tidak
diperlukan** ("bahasa indonesia tidak diperlukan karena bahasa inggris sudah menjadi standar industri"). Mengikat
worker. Branch `feature/i18n-en` (dari `feature/invite-multiselect`).

## Keputusan

| # | Keputusan |
|---|---|
| L1 | UI **hanya English**. Tidak ada modul i18n, pemilih bahasa, atau dependency baru: teks di `*.labels.ts` cukup diterjemahkan di tempat (nama export & struktur key tetap, agar komponen tidak berubah). |
| L2 | Teks UI literal yang masih tersebar di komponen (lobby, pages, landing, login, dll.) diterjemahkan; bila >1–2 string di satu komponen, pindahkan ke `*.labels.ts` domainnya (aturan proyek). Termasuk `error.message.ts`, `role.label.ts`, `role.global.label.ts`, toast, `aria-label`, `title`, placeholder, `document.title`. |
| L3 | `src/web/index.html`: `lang="en"`, meta SEO/OG/Twitter English. Cek teks Indonesia di server yang sampai ke user (`seo.serve.ts`, pesan `error` API) → English. |
| L4 | Gaya: English ringkas, sentence case ("Create room", "Invite people"), istilah konsisten: room, host, participant, viewer, invite link, private/public/password room, expires, active/inactive. Format tanggal/angka: locale `en-US` (atau `undefined` → tetap ok) — ganti `"id-ID"` bila ada. |
| L5 | `README.md` ditulis ulang dalam English (isi teknis sama), dipecah bila > 20.000 karakter (referensi API → `docs/api.md`). Entri `CHANGELOG.md` `[Unreleased]` dalam English (entri lama boleh tetap). Dokumen internal (`CLAUDE.md`, `RND/**`, `deploy/README.md`) dan teks CLI tetap — di luar scope, dicatat. |
| L6 | Test: unit test label/komponen yang mencocokkan teks Indonesia diupdate; e2e mencocokkan teks English. |

## Kepemilikan file (gelombang 1 paralel)

- **wkr-en-core**: `src/web/index.html`, `src/web/error.message.ts` (+test), `role.label.ts`, `role.global.label.ts`,
  `src/web/app/**`, `src/web/settings/**`, `src/web/pages/{SettingsPage,NotFoundPage,LoginPage}*`, `src/web/main.tsx`,
  `src/web/*.ts` lain di root web, `src/web/components/**`, `src/server/**` (hanya teks yang tampil ke user).
- **wkr-en-rooms**: `src/web/room/**`, `room-settings/**`, `room-password/**`, `invite-picker/**`, `prejoin/**`,
  `stage/**`, `lobby/**`, `src/web/pages/{RoomPage,InvitePage,LobbyPage,AppPage}*`.
- **wkr-en-admin**: `src/web/admin/**`, `src/web/dev/**`, `src/web/landing/**`, `src/web/pages/{AdminPage,DevPage,LandingPage}*`.
- **wkr-en-docs**: `README.md`, `docs/**`, `CHANGELOG.md`.
- Gelombang 2: **wkr-en-e2e**: `e2e/**`.
