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
- **Versi rilis**: `package.json` belum punya `version` dan `CHANGELOG.md` belum punya entry versi; keduanya wajib
  sebelum deploy (aturan global Rule 5).

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
unset KEY SECRET
sudo nano /etc/zoomin/zoomin.env
```

Isi `/etc/zoomin/zoomin.env` (selain di atas):

| Var | Nilai produksi |
|---|---|
| `NODE_ENV` | `production` (juga diset unit) |
| `PORT` | `3000` |
| `DB_PATH` | diset unit: `/var/lib/zoomin/zoomin.sqlite` (hapus baris dari env file agar tidak bentrok) |
| `LIVEKIT_URL` | `ws://127.0.0.1:7880` (server-ke-server, tanpa lewat Caddy) |
| `PUBLIC_LIVEKIT_URL` | `wss://<LK_DOMAIN>` |
| `PUBLIC_APP_URL` | `https://<APP_DOMAIN>` |
| `SESSION_SECRET` | `openssl rand -base64 48` (≥ 32 char) |
| `ADMIN_PASSWORD` | password kuat |
| `TRUST_PROXY` | `true` (wajib di belakang Caddy; tanpa ini semua user berbagi IP proxy dan rate limit login mengunci semua orang) |
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

App `Bun.serve` saat ini listen di semua interface (belum ada opsi hostname), dan LiveKit 7880/5349 juga. Karena
`TRUST_PROXY=true` mempercayai `X-Forwarded-For`, firewall di atas **satu-satunya** penghalang akses langsung ke
3000. Cek dari luar: `curl -m 5 http://<ip-server>:3000/api/health` harus timeout.

## Deploy rilis app

Dari mesin dev (hanya file yang dibutuhkan runtime; `.env`, `data/`, `node_modules` tidak ikut):

```bash
VER=0.1.0   # = version di package.json / CHANGELOG
tar -czf zoomin-$VER.tgz package.json bun.lock bunfig.toml tsconfig.json migrations src
# salin ke server (scp/rsync), lalu di server:
sudo mkdir -p /opt/zoomin/releases/$VER && sudo tar -xzf zoomin-$VER.tgz -C /opt/zoomin/releases/$VER
cd /opt/zoomin/releases/$VER && sudo bun install --production --frozen-lockfile
[ -f /var/lib/zoomin/zoomin.sqlite ] && sudo -u zoomin /usr/local/bin/zoomin-backup-sqlite   # backup pra-deploy; deploy pertama belum ada DB
sudo ln -sfn /opt/zoomin/releases/$VER /opt/zoomin/current
sudo systemctl enable zoomin && sudo systemctl restart zoomin
journalctl -u zoomin -n 20   # "zoomin: http://localhost:3000/ (... env production)"
sudo systemctl reload caddy
```

Migrasi SQL jalan otomatis saat start (idempotent). Bundle SPA dibuat Bun saat start (production, chunk ber-hash,
tanpa inline script), jadi tidak ada langkah build terpisah.

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
5. **Port tertutup:** dari luar, `curl -m 5 http://<ip>:3000` dan `:7880` harus timeout.
6. **Header keamanan + CSP:** buka app di browser, konsol DevTools tidak boleh berisi pelanggaran CSP saat login,
   join, publish kamera, dan tambah layar. Bila ada, longgarkan direktif terkait di `Caddyfile` (blok
   `security_headers`) lalu `systemctl reload caddy`.

## Header keamanan (di Caddy, bukan app)

HSTS 1 tahun (tanpa `includeSubDomains`/`preload` agar tidak mengikat subdomain lain yang belum siap HTTPS),
`nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` (link undangan bertoken tidak bocor lewat Referer
ke origin lain), `X-Frame-Options: DENY` + `frame-ancestors 'none'`, `Permissions-Policy` yang hanya mengizinkan
kamera/mic/layar untuk origin sendiri, dan CSP: script hanya `'self'`, `connect-src` membuka `wss://` + `https://`
ke `LK_DOMAIN` saja. `style-src 'unsafe-inline'` diperlukan oleh tag `<style>` runtime (sonner/radix).
