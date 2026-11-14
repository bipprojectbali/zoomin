# Deploy produksi (M4)

Artefak untuk satu server Linux: Caddy (TLS + reverse proxy + SNI ke TURN) → app Bun `:3000` dan livekit-server
`:7880`, SQLite di `/var/lib/zoomin`. Belum pernah dijalankan di server; semua langkah di bawah manual.

| File | Tujuan di server |
|---|---|
| `domains.env.example` | `/etc/zoomin/domains.env` (domain, bukan secret) |
| `Caddyfile.example` | `/etc/caddy/Caddyfile` |
| `livekit.yaml.example` | `/etc/livekit/livekit.yaml` (di-render dengan `envsubst`) |
| `livekit.service`, `zoomin.service` | `/etc/systemd/system/` |
| `backup-sqlite.sh` | `/usr/local/bin/zoomin-backup-sqlite` |
| `../.env.example` | dasar `/etc/zoomin/zoomin.env` (secret app) |
| `livekit-compose.yml`, `livekit-stack.env.example` | stack Portainer LiveKit (alternatif, lihat bagian Portainer) |
| `../compose.yml`, `zoomin-stack.env.example` | stack Portainer app dari image GHCR (lihat bagian App via Portainer) |

Versi yang diverifikasi (2026-11-14): livekit-server **1.13.11** (rilis terbaru, 25 Okt; `livekit.yaml.example`
di-parse oleh binary 1.13.11, log `turn.externalTLS: true, turn.proxyProtocol: true`), Caddy **2.11.9** (5 Nov)
+ `github.com/mholt/caddy-l4`, Bun **1.4.2**.

## Keputusan yang harus diambil dulu

- **K1 (akses internet)** menentukan `LK_USE_EXTERNAL_IP` dan cara terbit sertifikat.
  - (b) Server/VPS ber-IP publik: `LK_USE_EXTERNAL_IP=true`, DNS A ketiga domain → IP publik, Let's Encrypt
    HTTP-01 lewat port 80. Artefak ini default ke skenario ini.
  - (a) Semua klien di tailnet (100.64.0.8): `LK_USE_EXTERNAL_IP=false`. Let's Encrypt **tidak bisa** menjangkau
    100.64.x lewat HTTP-01, jadi butuh DNS-01 (Caddy + plugin DNS provider, mis. `--with github.com/caddy-dns/<provider>`
    dan `tls { dns <provider> ... }` per site) atau `tailscale cert` (hanya satu nama `*.ts.net`, tidak cukup untuk
    3 subdomain tanpa ubah desain). TURN/TLS biasanya tidak diperlukan di tailnet; bila dimatikan
    (`turn.enabled: false`), hapus blok `servers` + site TURN di Caddyfile dan pakai Caddy standar (tanpa l4).
- **K3 (domain)**: isi `APP_DOMAIN`, `LK_DOMAIN`, `TURN_DOMAIN`. TURN wajib domain terpisah (SNI).
- **Versi rilis**: `package.json` `version` = `0.1.0` dan `CHANGELOG.md` punya entri `[0.1.0]`. Rilis berikutnya
  wajib menaikkan keduanya sebelum deploy (aturan global Rule 5).

## Kenapa Caddy butuh plugin layer4

LiveKit selalu mengiklankan `turns:<TURN_DOMAIN>:443` ke klien (`pkg/service/roommanager.go` v1.13.11), sedangkan
443 juga dipakai HTTPS. Caddy + caddy-l4 membaca SNI di listener 443: SNI TURN → terminate TLS (sertifikat dikelola
Caddy) → TCP polos + header PROXY v2 ke `127.0.0.1:5349`; sisanya ke HTTPS biasa. `turn.proxy_protocol: true`
membuat TURN melihat IP klien asli, bukan 127.0.0.1 (Firefox menolak alamat loopback). Ini meniru setup resmi
`livekit/generate` (image `livekit/caddyl4`), tapi dengan Caddyfile dan tanpa Docker.

## Instalasi awal (sekali)

```bash
# User sistem
sudo useradd --system --home /nonexistent --shell /usr/sbin/nologin zoomin
sudo useradd --system --home /nonexistent --shell /usr/sbin/nologin livekit
sudo mkdir -p /etc/zoomin /etc/livekit /opt/zoomin/releases /var/backups/zoomin
sudo chown zoomin:zoomin /var/backups/zoomin && sudo chmod 700 /var/backups/zoomin
sudo apt install -y sqlite3 gettext-base   # sqlite3 untuk backup, envsubst untuk render config

# Bun (versi sama dengan lokal), dipasang global di /usr/local/bin
curl -fsSL https://bun.sh/install | sudo BUN_INSTALL=/usr/local bash -s "bun-v1.4.2"

# livekit-server: binary resmi, simpan per versi agar rollback = ganti symlink
V=1.13.11; ARCH=amd64   # atau arm64
curl -fsSLO https://github.com/livekit/livekit/releases/download/v$V/livekit_${V}_linux_${ARCH}.tar.gz
sudo mkdir -p /opt/livekit/$V && sudo tar -xzf livekit_${V}_linux_${ARCH}.tar.gz -C /opt/livekit/$V
sudo ln -sfn /opt/livekit/$V/livekit-server /usr/local/bin/livekit-server
```

### Caddy dengan caddy-l4

Pasang paket Debian resmi Caddy (memberi user `caddy`, unit `caddy.service`, auto-start), lalu ganti binary-nya
dengan build ber-plugin memakai pola resmi `dpkg-divert` (https://caddyserver.com/docs/build):

```bash
# Di mesin dengan Go: xcaddy build v2.11.9 --with github.com/mholt/caddy-l4
#   (atau unduh build kustom dari https://caddyserver.com/download dengan modul mholt/caddy-l4)
sudo dpkg-divert --divert /usr/bin/caddy.default --rename /usr/bin/caddy
sudo mv ./caddy /usr/bin/caddy.custom
sudo update-alternatives --install /usr/bin/caddy caddy /usr/bin/caddy.default 10
sudo update-alternatives --install /usr/bin/caddy caddy /usr/bin/caddy.custom 50
caddy list-modules | grep layer4   # harus muncul
```

Domain untuk Caddyfile dari env:

```bash
sudo cp deploy/domains.env.example /etc/zoomin/domains.env && sudo nano /etc/zoomin/domains.env
sudo mkdir -p /etc/systemd/system/caddy.service.d
printf '[Service]\nEnvironmentFile=/etc/zoomin/domains.env\n' | sudo tee /etc/systemd/system/caddy.service.d/zoomin.conf
sudo cp deploy/Caddyfile.example /etc/caddy/Caddyfile
sudo bash -c 'set -a; . /etc/zoomin/domains.env; caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile'
```

### Secret (jangan dicetak ke terminal/log)

```bash
# API key LiveKit: key_file dibaca livekit, nilai yang sama masuk env app.
KEY="API$(openssl rand -hex 6)"; SECRET="$(openssl rand -base64 36 | tr -d '/+=')"
printf '%s: %s\n' "$KEY" "$SECRET" | sudo tee /etc/livekit/keys.yaml >/dev/null
sudo chown root:livekit /etc/livekit/keys.yaml && sudo chmod 640 /etc/livekit/keys.yaml  # others harus 0

sudo cp .env.example /etc/zoomin/zoomin.env && sudo chown root:zoomin /etc/zoomin/zoomin.env && sudo chmod 640 /etc/zoomin/zoomin.env
sudo sed -i "s|^LIVEKIT_API_KEY=.*|LIVEKIT_API_KEY=$KEY|; s|^LIVEKIT_API_SECRET=.*|LIVEKIT_API_SECRET=$SECRET|" /etc/zoomin/zoomin.env
# Kunci Better Auth (sesi, state OAuth, tanda tangan undangan). Mengganti nilainya nanti = semua user ter-logout
# dan semua link undangan lama tidak berlaku.
AUTH="$(openssl rand -base64 48 | tr -d '/+=')"
sudo sed -i "s|^BETTER_AUTH_SECRET=.*|BETTER_AUTH_SECRET=$AUTH|" /etc/zoomin/zoomin.env
unset KEY SECRET AUTH
sudo nano /etc/zoomin/zoomin.env   # isi GOOGLE_CLIENT_ID/SECRET, SUPER_ADMIN_EMAILS, URL (tabel di bawah)
```

### OAuth client Google

Login hanya lewat Google, jadi app produksi butuh OAuth client sendiri (langkah lengkap: `.env.example` bagian 4):

1. console.cloud.google.com → APIs & Services → **OAuth consent screen**: nama app, email kontak; scope default
   (email, profile, openid).
2. **Credentials → Create credentials → OAuth client ID**, tipe **Web application**:
   - Authorized JavaScript origins: `https://<APP_DOMAIN>` (= `PUBLIC_APP_URL`).
   - Authorized redirect URIs: `https://<APP_DOMAIN>/api/auth/callback/google` (= `<BETTER_AUTH_URL>/api/auth/callback/google`).
3. Salin Client ID + secret ke `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` di `/etc/zoomin/zoomin.env` (lewat `nano`,
   jangan di command line yang tersimpan di history).
4. Consent screen berstatus "Testing" hanya menerima akun test user (maks 100). Untuk tamu umum tekan
   **Publish app**.

Origin atau redirect URI yang tidak persis sama dengan URL yang dibuka browser → Google menolak dengan
`redirect_uri_mismatch`.

Isi `/etc/zoomin/zoomin.env` (selain di atas). `EnvironmentFile` menimpa `Environment=` di unit, jadi var yang
"diset unit" **harus dihapus** dari env file (salinan `.env.example` berisi `NODE_ENV=development`, `HOST=0.0.0.0`,
`TRUST_PROXY=false`):

| Var | Nilai produksi |
|---|---|
| `NODE_ENV` | diset unit: `production` (hapus baris dari env file) |
| `PORT` | `3000` |
| `HOST` | diset unit: `127.0.0.1` (hapus baris dari env file) |
| `DB_PATH` | diset unit: `/var/lib/zoomin/zoomin.sqlite` (hapus baris dari env file agar tidak bentrok) |
| `LIVEKIT_URL` | `ws://127.0.0.1:7880` (server-ke-server, tanpa lewat Caddy) |
| `PUBLIC_LIVEKIT_URL` | `wss://<LK_DOMAIN>` |
| `PUBLIC_APP_URL` | `https://<APP_DOMAIN>` |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 48` (≥ 32 char; diisi langkah di atas) |
| `BETTER_AUTH_URL` | kosong (ikut `PUBLIC_APP_URL`), atau `https://<APP_DOMAIN>` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | dari OAuth client Google (§OAuth client Google) |
| `SUPER_ADMIN_EMAILS` | email Google pengelola, dipisah koma (satu-satunya cara menjadi super_admin) |
| `ZOOMIN_TEST_AUTH` | kosong (diabaikan di production; jangan diisi) |
| `WEB_DIST_DIR` | kosong (default `dist/web` di folder rilis) |
| `TRUST_PROXY` | diset unit: `true` (hapus baris dari env file; wajib di belakang Caddy, tanpa ini semua user berbagi IP proxy dan rate limit login/undangan mengunci semua orang) |
| `TLS_CERT_PATH`/`TLS_KEY_PATH` | kosong (TLS di Caddy) |

### LiveKit config + unit

```bash
sudo bash -c 'set -a; . /etc/zoomin/domains.env; envsubst < deploy/livekit.yaml.example > /etc/livekit/livekit.yaml'
sudo cp deploy/livekit.service deploy/zoomin.service /etc/systemd/system/
sudo install -m 755 deploy/backup-sqlite.sh /usr/local/bin/zoomin-backup-sqlite
sudo systemctl daemon-reload
sudo systemctl enable --now livekit
journalctl -u livekit -n 20   # cari "Starting TURN server ... turn.proxyProtocol: true" dan "starting LiveKit server"
```

## Firewall (ufw)

| Port | Proto | Buka? | Untuk |
|---|---|---|---|
| 22 | TCP | ya (batasi ke IP admin/tailnet) | SSH |
| 80 | TCP | ya | ACME HTTP-01 + redirect ke HTTPS |
| 443 | TCP | ya | HTTPS app, wss LiveKit, TURN/TLS (SNI) |
| 443 | UDP | opsional | HTTP/3 Caddy |
| 7881 | TCP | ya | ICE/TCP |
| 3478 | UDP | ya | TURN/UDP + STUN |
| 50000–60000 | UDP | ya | ICE/UDP media |
| 3000, 7880, 5349 | TCP | **tidak** | app, signaling LiveKit, TURN plaintext: hanya loopback/Caddy |

```bash
sudo ufw default deny incoming && sudo ufw default allow outgoing
sudo ufw allow 22/tcp        # atau: sudo ufw allow in on tailscale0 to any port 22
sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw allow 443/udp
sudo ufw allow 7881/tcp && sudo ufw allow 3478/udp && sudo ufw allow 50000:60000/udp
sudo ufw enable && sudo ufw status verbose
```

App listen di `HOST` (default config `0.0.0.0`; unit produksi `127.0.0.1`), jadi 3000 hanya terjangkau dari
loopback/Caddy. Karena `TRUST_PROXY=true` mempercayai `X-Forwarded-For`, jangan ubah `HOST` ke interface publik.
LiveKit 7880/5349 tetap listen di semua interface; untuk itu firewall di atas penghalangnya. Cek dari luar:
`curl -m 5 http://<ip-server>:3000/api/health` harus gagal (connection refused/timeout).

## Deploy rilis app

Dari mesin dev (hanya file yang dibutuhkan runtime; `.env`, `data/`, `node_modules` tidak ikut):

```bash
VER=0.1.0   # = version di package.json / CHANGELOG
bun install --frozen-lockfile && bun run build   # → dist/web (SPA prebuild; wajib, server produksi menolak start tanpanya)
tar -czf zoomin-$VER.tgz --exclude='*.map' package.json bun.lock bunfig.toml tsconfig.json migrations src dist
# salin ke server (scp/rsync), lalu di server:
sudo mkdir -p /opt/zoomin/releases/$VER && sudo tar -xzf zoomin-$VER.tgz -C /opt/zoomin/releases/$VER
cd /opt/zoomin/releases/$VER && sudo bun install --production --frozen-lockfile
[ -f /var/lib/zoomin/zoomin.sqlite ] && sudo -u zoomin /usr/local/bin/zoomin-backup-sqlite   # backup pra-deploy; deploy pertama belum ada DB
sudo ln -sfn /opt/zoomin/releases/$VER /opt/zoomin/current
sudo systemctl enable zoomin && sudo systemctl restart zoomin
journalctl -u zoomin -n 20   # "zoomin: http://127.0.0.1:3000/ (... env production)"
sudo systemctl reload caddy
```

Setelah start pertama, login dengan akun di `SUPER_ADMIN_EMAILS` lalu angkat admin dari `/dev`. Jalan darurat akun
di server (langsung ke DB; `--db` perlu karena `DB_PATH` diset di unit, bukan di env file):

```bash
cd /opt/zoomin/current
sudo -u zoomin bun src/server/main.ts user list --env-file /etc/zoomin/zoomin.env --db /var/lib/zoomin/zoomin.sqlite
sudo -u zoomin bun src/server/main.ts user promote <email> --role admin --env-file /etc/zoomin/zoomin.env --db /var/lib/zoomin/zoomin.sqlite
sudo -u zoomin bun src/server/main.ts user unban <email> --env-file /etc/zoomin/zoomin.env --db /var/lib/zoomin/zoomin.sqlite
# binary: sudo -u zoomin /opt/zoomin/current/zoomin user list --env-file /etc/zoomin/zoomin.env --db /var/lib/zoomin/zoomin.sqlite
```

**Upgrade dari 0.1.0 (login password → Google):** hapus `ADMIN_PASSWORD` dan `SESSION_SECRET` dari
`/etc/zoomin/zoomin.env`, isi variabel login di tabel atas, dan siapkan OAuth client Google sebelum restart (tanpa
`BETTER_AUTH_SECRET`/`GOOGLE_CLIENT_*` server gagal start). Migrasi 0002 menghapus akun lama: semua sesi dan link
undangan lama tidak berlaku, room + layout tetap ada tapi anggotanya perlu diundang ulang. Backup DB dulu (langkah di
atas) agar rollback ke 0.1.0 tetap mungkin.

Migrasi SQL jalan otomatis saat start (idempotent). SPA disajikan dari `dist/web` hasil `bun run build`
(`scripts/build.web.ts`: code splitting, minify, Tailwind, nama file ber-hash). Sourcemap `*.map` dibuat external
(tanpa komentar `sourceMappingURL`), tetap di `dist/web` lokal untuk debugging, di-exclude dari tarball rilis, dan
server tidak pernah merutekannya (404). Asset ber-hash dikirim
dengan `Cache-Control: public, max-age=31536000, immutable`, `index.html` dengan `no-cache`; kompresi oleh Caddy
`encode`. Tanpa `dist/web/index.html`, `NODE_ENV=production` gagal start dengan pesan "jalankan `bun run build`".
Build dilakukan di mesin dev agar server tidak perlu menjalankan bundler; `bun run dev` tetap memakai HTML import + HMR.

## Opsi: deploy via single binary

Alternatif tarball di atas: satu file executable, server tidak perlu Bun maupun `bun install`. Migrasi dan SPA ikut
tertanam, jadi rollback = ganti symlink binary.

```bash
VER=0.1.0
bun install --frozen-lockfile && bun scripts/build.binary.ts --target bun-linux-x64   # atau bun-linux-arm64
# salin bin/zoomin-linux-x64 ke server, lalu di server:
sudo install -D -m 0755 zoomin-linux-x64 /opt/zoomin/releases/$VER/zoomin
sudo -u zoomin /opt/zoomin/releases/$VER/zoomin check --env-file /etc/zoomin/zoomin.env   # nilai secret tidak dicetak
sudo ln -sfn /opt/zoomin/releases/$VER /opt/zoomin/current
```

Ubah unit `zoomin.service` (drop-in `sudo systemctl edit zoomin`):

```ini
[Service]
ExecStart=
ExecStart=/opt/zoomin/current/zoomin serve
```

`Environment=`/`EnvironmentFile=` di unit tetap berlaku (binary otomatis `NODE_ENV=production`).
`BUN_RUNTIME_TRANSPILER_CACHE_PATH` tidak lagi diperlukan dan `dist/web` tidak perlu ada di server. Migrasi tetap
jalan otomatis saat start; `zoomin migrate --db /var/lib/zoomin/zoomin.sqlite` bisa dipakai untuk menjalankannya
terpisah (sesudah backup).

## LiveKit via Portainer

Alternatif `livekit.service` + Caddy untuk VPS yang sudah memakai Portainer + Traefik: `livekit-compose.yml` (image
`livekit/livekit-server:v1.13.11`, network `public-net`, config lewat env `LIVEKIT_CONFIG`).

- Signaling `wss://lk.wibudev.com` (env stack `LIVEKIT_HOST`): Cloudflare → Traefik (`websecure`, `letsencrypt`)
  → container `:7880`. Port 7880 tidak di-publish. Tanpa basic auth (klien LiveKit tidak bisa) dan tanpa rate
  limit Traefik (reconnect klien sering terjadi); akses dijaga token JWT.
- Media langsung ke IP publik asli VPS (Cloudflare tidak meneruskan UDP/TCP mentah): `7882/udp` (semua media UDP
  lewat satu port, UDP mux `rtc.udp_port`) dan `7881/tcp` (ICE/TCP cadangan). IP publik dicari via STUN
  (`use_external_ip: true`) lalu diiklankan ke klien.
- TURN mati. Klien di jaringan yang hanya membuka 443 (korporat/hotel ketat) bisa tersambung signaling tapi gagal
  media. Butuh itu → pakai setup Caddy + caddy-l4 di atas dengan domain TURN.

Langkah:

1. Pastikan DNS `lk.wibudev.com` (atau nilai `LIVEKIT_HOST`) mengarah ke VPS; wildcard `*.wibudev.com` di Cloudflare
   sudah mencakupnya.
2. Portainer > Stacks > Add stack > Web editor: tempel `livekit-compose.yml`. Environment variables: isi dari
   `livekit-stack.env.example` (`LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`; `LIVEKIT_HOST` opsional). Deploy.
   Variabel kunci kosong → stack ditolak (`required variable ... is missing a value`).
3. Firewall: `ports:` Docker (7881/tcp, 7882/udp) dibuka lewat iptables Docker dan **melewati ufw**, jadi
   `ufw status` tidak menampilkannya. Informasikan ke pengelola server. Menutup port = stop stack (Portainer >
   Stacks > livekit > Stop). Firewall/security group di level provider (bila ada) tetap harus mengizinkan keduanya.
4. Uji:
   - `curl -I https://lk.wibudev.com` → `HTTP/2 200`, body `curl https://lk.wibudev.com` → `OK`. Beberapa detik pertama setelah start
     wajar `406` "Not Ready"; `404` dari Traefik = router/label belum terbaca.
   - `docker logs livekit` (Portainer > Containers > livekit > Logs): `found external IP via STUN` dengan IP publik
     VPS, lalu `starting LiveKit server` dengan `"rtc.portUDP": {"Start":7882,...}` dan `nodeIP` = IP publik.
     Baris `could not validate external IP` aman diabaikan bila `nodeIP` sudah benar (LiveKit tetap memakai IP
     hasil STUN).
   - Dari mesin luar: `nc -vz <IP-VPS> 7881` (TCP harus `succeeded`). UDP tidak bisa dipastikan dengan `nc`
     (tanpa balasan); uji nyata = gabung room dari dua perangkat di jaringan berbeda, lalu cek
     `chrome://webrtc-internals` → candidate pair terpilih memakai `<IP-VPS>:7882` udp.
   - API: `RND/spike/.bin/lk room list --url https://lk.wibudev.com --api-key "$LIVEKIT_API_KEY" --api-secret "$LIVEKIT_API_SECRET"`
     (ambil dari env, jangan tulis secret di command line yang tersimpan di history).
5. `.env` zoomin: `LIVEKIT_URL=wss://lk.wibudev.com`, `PUBLIC_LIVEKIT_URL=wss://lk.wibudev.com`,
   `LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET` sama dengan env stack. Proxy `/livekit` di app tidak diperlukan untuk desain
   ini (tetap tersedia).

IP hasil STUN salah (mis. VPS punya beberapa IP publik): di `LIVEKIT_CONFIG` ganti `use_external_ip: false` dan
tambahkan `node_ip: <IP publik VPS>` di bawah `rtc:`. Keduanya harus diubah bersama: selama `use_external_ip: true`,
`node_ip` ditimpa hasil STUN; sebaliknya `use_external_ip: false` tanpa `node_ip` mengiklankan IP bridge 172.x.
Jangan tambahkan `port_range_start/end`: bila diisi, LiveKit memakai range itu dan `udp_port` diabaikan.

## App via Portainer (image GHCR)

Workflow `.github/workflows/docker.yml` jalan pada push ke `main`, tag `v*`, dan manual (workflow_dispatch): job `test`
(typecheck + `bun test`, test yang butuh LiveKit dilewati lewat `ZOOMIN_SKIP_LIVEKIT_TESTS=1`) lalu job `image`
membangun `Dockerfile` (linux/amd64) dan push ke `ghcr.io/bipprojectbali/zoomin`. Tag: `latest` (main), `sha-<7 char>`
(tiap build), `<versi>` + `<major>.<minor>` (tag `v<versi>`). Image berisi single binary di distroless (user nonroot
65532), DB di volume `/data`, `HEALTHCHECK` lewat `zoomin healthcheck`. Stack: [`compose.yml`](../compose.yml) di root
repo (router Traefik `zoomin`, network `public-net`, sama dengan stack LiveKit).

1. **Registry.** Setelah build pertama, package muncul di GitHub (profil/org > Packages > `zoomin`). Pilih salah satu:
   - Public: Package settings > Change visibility > Public. Portainer bisa pull tanpa login.
   - Private: buat PAT (classic) dengan scope `read:packages` saja, lalu Portainer > Registries > Add registry > Custom:
     URL `ghcr.io`, username GitHub, password = PAT.
2. **Google Console.** Di OAuth client: Authorized JavaScript origins `https://zoomin.wibudev.com`, Authorized redirect
   URIs `https://zoomin.wibudev.com/api/auth/callback/google`.
3. **DNS.** `zoomin.wibudev.com` mengarah ke VPS (proxied Cloudflare seperti `lk.wibudev.com`).
4. **Stack.** Portainer > Stacks > Add stack > Web editor: tempel isi `compose.yml` (atau Repository: repo ini, path
   `compose.yml`). Environment variables: isi dari `deploy/zoomin-stack.env.example` (wajib: `BETTER_AUTH_SECRET`,
   `GOOGLE_CLIENT_ID/SECRET`, `LIVEKIT_API_KEY/SECRET` sama dengan stack LiveKit; dianjurkan `SUPER_ADMIN_EMAILS`).
   Deploy. Default `LIVEKIT_URL=ws://livekit:7880` memakai container LiveKit lewat `public-net`; bila LiveKit tidak
   di host/network yang sama isi `wss://lk.wibudev.com`.
5. **Cek.** Container `healthy` di Portainer, lalu `SMOKE_URL=https://zoomin.wibudev.com bun test test/smoke.prod.test.ts`
   dari mesin dev, login Google, buat room. Migrasi SQLite jalan otomatis saat start.
6. **Update.** Stack > Update the stack > "Re-pull image and redeploy". Otomatis: aktifkan webhook stack (Portainer
   Business, atau GitOps updates), simpan URL-nya sebagai secret repo `PORTAINER_WEBHOOK_URL`; job `image` memanggilnya
   setelah push dari `main` (dilewati bila secret kosong).
7. **Rollback.** Set `ZOOMIN_TAG=sha-<7 char>` (lihat daftar tag di halaman package) lalu update stack. Migrasi hanya
   maju: bila rilis baru menambah migrasi, kembalikan juga DB dari backup (stop stack, salin file, hapus `-wal`/`-shm`).
8. **CLI darurat.** `docker exec zoomin zoomin user list`, `docker exec zoomin zoomin user promote <email> --role admin`.

**Backup volume.** Image distroless tidak punya `sqlite3`; jalankan `backup-sqlite.sh` di host terhadap file di volume
(nama volume = `<nama stack>_zoomin-data`, butuh paket `sqlite3` di host):

```bash
DB="$(docker volume inspect -f '{{ .Mountpoint }}' zoomin_zoomin-data)/zoomin.sqlite"
sudo ./deploy/backup-sqlite.sh "$DB" /var/backups/zoomin 14
```

## Backup SQLite

`backup-sqlite.sh` memakai `sqlite3 .backup` (aman saat app jalan dengan WAL), `PRAGMA integrity_check` pada hasil,
lalu menyimpan 14 file terbaru (argumen ke-3 / `BACKUP_KEEP`).

```bash
echo '15 2 * * * zoomin /usr/local/bin/zoomin-backup-sqlite >> /var/backups/zoomin/backup.log 2>&1' | sudo tee /etc/cron.d/zoomin-backup
```

Salin `/var/backups/zoomin` ke mesin lain secara berkala; backup di disk yang sama tidak melindungi dari disk rusak.

## Rollback

- **App:** `sudo ln -sfn /opt/zoomin/releases/<versi-lama> /opt/zoomin/current && sudo systemctl restart zoomin`.
  Migrasi hanya maju. Bila rilis baru menambah migrasi, kembalikan juga DB:
  `sudo systemctl stop zoomin && sudo -u zoomin cp /var/backups/zoomin/<backup-pra-deploy>.sqlite /var/lib/zoomin/zoomin.sqlite && sudo rm -f /var/lib/zoomin/zoomin.sqlite-wal /var/lib/zoomin/zoomin.sqlite-shm && sudo systemctl start zoomin`.
- **LiveKit:** `sudo ln -sfn /opt/livekit/<versi-lama>/livekit-server /usr/local/bin/livekit-server && sudo systemctl restart livekit`.
  Restart memutus semua room aktif; klien reconnect, layout dipulihkan dari SQLite.
- **Caddy:** `sudo update-alternatives --set caddy /usr/bin/caddy.default` hanya bila TURN/TLS dimatikan
  (binary default tidak punya layer4 dan akan menolak Caddyfile ini).

## Verifikasi

1. **Smoke test** dari mesin dev: `SMOKE_URL=https://<APP_DOMAIN> bun test test/smoke.prod.test.ts`
   (`/` 200 + header keamanan, `/api/health` 200, `/api/me` 401, token tanpa sesi 401).
2. **TLS + wss LiveKit:** `curl -s https://<LK_DOMAIN>` → `OK`; sertifikat valid dari CA publik.
3. **Sertifikat TURN di 443:**
   `openssl s_client -connect <TURN_DOMAIN>:443 -servername <TURN_DOMAIN> </dev/null 2>/dev/null | openssl x509 -noout -subject -issuer -dates`
   → subject = TURN_DOMAIN. Bandingkan dengan `-servername <APP_DOMAIN>`: dua sertifikat berbeda = SNI routing jalan.
4. **Media lewat TURN/TLS 443:** di klien, blokir UDP keluar (mis. jaringan korporat, atau firewall OS untuk
   UDP selain DNS) dan blokir TCP 7881. Join room di Chrome, buka `chrome://webrtc-internals`: candidate pair
   terpilih harus `relay` dengan `relayProtocol: tls`, url `turns:<TURN_DOMAIN>:443`. Di server,
   `journalctl -u livekit | grep -i turn` menampilkan alokasi dengan IP klien asli (bukan 127.0.0.1).
5. **Port tertutup:** dari luar, `curl -m 5 http://<ip>:3000` dan `:7880` harus gagal (refused/timeout).
6. **Header keamanan + CSP:** buka app di browser, konsol DevTools tidak boleh berisi pelanggaran CSP saat login,
   join, publish kamera, dan tambah layar. Bila ada, longgarkan direktif terkait di `Caddyfile` (blok
   `security_headers`) lalu `systemctl reload caddy`.

## Header keamanan (di Caddy, bukan app)

HSTS 1 tahun (tanpa `includeSubDomains`/`preload` agar tidak mengikat subdomain lain yang belum siap HTTPS),
`nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` (link undangan bertoken tidak bocor lewat Referer
ke origin lain), `X-Frame-Options: DENY` + `frame-ancestors 'none'`, `Permissions-Policy` yang hanya mengizinkan
kamera/mic/layar untuk origin sendiri, dan CSP: script hanya `'self'`, `connect-src` membuka `wss://` + `https://`
ke `LK_DOMAIN` saja. `style-src 'unsafe-inline'` diperlukan oleh tag `<style>` runtime (sonner/radix).
