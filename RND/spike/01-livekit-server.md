# 01 — LiveKit Server lokal (spike)

## Versi

- **livekit-server 1.13.11**, rilis stabil terbaru per 2026-11-14 (rilis 2026-10-25). Diverifikasi lewat
  `https://api.github.com/repos/livekit/livekit/releases/latest`.
- **Catatan:** rilis resmi GitHub **tidak menyertakan binary macOS**. Asetnya hanya linux amd64/arm64/armv7 dan
  windows amd64/arm64, dan begitu juga di 15 rilis terakhir. Karena itu binary di-*build* dari tarball source
  resmi tag `v1.13.11`:

  ```bash
  cd RND/spike/.bin/src
  curl -sSLO https://github.com/livekit/livekit/archive/refs/tags/v1.13.11.tar.gz
  tar xzf v1.13.11.tar.gz && cd livekit-1.13.11
  go build -o ../../livekit-server ./cmd/server   # butuh Go >= 1.26 dan CGO aktif (default)
  ```

  Dengan `CGO_ENABLED=0` build gagal, karena `go-osstat/cpu` di darwin butuh cgo. Modul Go terunduh ke
  module cache user (`~/go/pkg/mod`).
- Binary: `RND/spike/.bin/livekit-server` (darwin/arm64, ~79 MB).

## Menjalankan / menghentikan

Dari `RND/spike/`:

```bash
# start (dev mode, background)
nohup .bin/livekit-server --dev --bind 0.0.0.0 > .run/livekit.log 2>&1 &
echo $! > .run/livekit.pid

# status
ps -p "$(cat .run/livekit.pid)"
curl -s http://127.0.0.1:7880/        # -> "OK"

# stop
kill "$(cat .run/livekit.pid)" && rm .run/livekit.pid
```

Mode `--dev` memakai kredensial **test-only** `devkey` / `secret`. URL untuk klien: `ws://127.0.0.1:7880`.

## Port

| Port | Protokol | Fungsi |
| --- | --- | --- |
| 7880 | TCP | HTTP API + WebSocket signaling |
| 7881 | TCP | ICE/TCP (fallback media bila UDP gagal) |
| 7882 | UDP | ICE/UDP mux (seluruh media lewat satu port di mode dev) |

Di mode dev, UDP 7882 hanya di-bind ke IP interface (LAN/Tailscale), **bukan** ke 127.0.0.1, dan `nodeIP`
yang diumumkan adalah IP Tailscale (100.64.0.1). Browser di mesin yang sama tetap bisa terhubung lewat
host candidate IP LAN. Kalau media tidak mengalir, ini yang pertama dicek.

## Hasil verifikasi (2026-11-14)

```
$ ps -p 79894 -o pid,command
  PID COMMAND
79894 .bin/livekit-server --dev --bind 0.0.0.0

$ curl -s -w ' HTTP %{http_code}\n' http://127.0.0.1:7880/
OK HTTP 200

$ lsof -nP -p 79894 -a -i
UDP 100.64.0.1:7882, UDP 192.168.1.112:7882, ... (IP interface lain)
TCP *:7881 (LISTEN)
TCP *:7880 (LISTEN)
```

Log (`.run/livekit.log`) tidak memuat ERROR/WARN/FATAL/PANIC:

```
INFO  starting in development mode
INFO  no keys provided, using placeholder keys {"API Key": "devkey", "API Secret": "secret"}
INFO  using single-node routing
INFO  starting LiveKit server {"portHttp": 7880, "version": "1.13.11", "bindAddresses": ["0.0.0.0"],
      "rtc.portTCP": 7881, "rtc.portUDP": {"Start":7882,"End":0}}
```

## Deploy ke server 100.64.0.8 (BELUM dilakukan)

Langkah yang dibutuhkan untuk produksi, diringkas dari docs resmi:

1. **Binary/kontainer:** server Linux bisa memakai binary rilis resmi `livekit_1.13.11_linux_amd64.tar.gz` /
   `linux_arm64`, atau image Docker `livekit/livekit-server` dengan host networking (direkomendasikan untuk
   performa).
2. **Config YAML, bukan `--dev`:** jalankan dengan `--config livekit.yaml` atau env `LIVEKIT_CONFIG`. Kerangka
   minimal:

   ```yaml
   port: 7880
   log_level: info
   rtc:
     tcp_port: 7881
     port_range_start: 50000
     port_range_end: 60000
     use_external_ip: true        # cari IP publik lewat STUN; set false bila hanya di jaringan privat/Tailscale
   keys:
     <API_KEY>: <API_SECRET>      # generate baru, simpan di secret store, jangan commit
   # redis:
   #   address: redis-host:6379   # wajib bila multi-node
   # turn:
   #   enabled: true
   #   domain: turn.<domain>
   #   tls_port: 5349             # 443 bila tanpa load balancer
   #   udp_port: 3478
   #   cert_file: /path/turn.crt
   #   key_file: /path/turn.key
   ```

   Referensi semua key: `config-sample.yaml` di repo.
3. **TLS/domain:** butuh domain (mis. `wss://livekit.<domain>`) dengan sertifikat dari CA tepercaya, karena
   self-signed tidak jalan. TLS di-terminate di reverse proxy/LB (mis. Caddy) di depan port 7880. TURN butuh
   domain dan sertifikat sendiri, yang di-terminate LiveKit sendiri.
   - 100.64.0.8 adalah IP CGNAT/Tailscale. Kalau semua klien ada di tailnet, pertimbangkan sertifikat
     Tailscale (`tailscale cert`) daripada domain publik. Ini perlu diputuskan.
4. **Firewall/port:** buka 7881/TCP, 50000–60000/UDP (tiap participant memakai dua port), 3478/UDP (TURN/UDP),
   443/TCP (HTTPS + TURN/TLS), dan 80/TCP (penerbitan sertifikat). Port 7880 **tidak** perlu dibuka langsung,
   cukup lewat proxy.
5. **TURN:** aktifkan embedded TURN (TLS di 443/5349) untuk klien di balik firewall korporat/VPN yang
   memblokir UDP.
6. **Redis (multi-node):** dengan Redis terkonfigurasi, LiveKit otomatis masuk mode distributed (data room dan
   message bus di Redis). Satu room harus muat di satu node. `SIGTERM` membuat node masuk *draining*: room
   lama jalan terus, room baru ditolak. Untuk satu server cukup single-node tanpa Redis.
7. **Kapasitas:** dibatasi CPU dan bandwidth. Pilih instance compute-optimized. Multi screen-share bersamaan
   memakan bandwidth besar, jadi perlu benchmark sebelum menentukan ukuran server.
8. **Jalan pintas resmi:** `docker run --rm -it -v$PWD:/output livekit/generate` menghasilkan `livekit.yaml`,
   `caddy.yaml`, `redis.conf`, `docker-compose.yaml`, dan init script (systemd `livekit-docker`).

### Sumber

- https://docs.livekit.io/transport/self-hosting/deployment.md
- https://docs.livekit.io/transport/self-hosting/ports-firewall.md
- https://docs.livekit.io/transport/self-hosting/vm.md
- https://docs.livekit.io/transport/self-hosting/distributed.md
- https://github.com/livekit/livekit/blob/master/config-sample.yaml
- https://github.com/livekit/livekit/releases/tag/v1.13.11
