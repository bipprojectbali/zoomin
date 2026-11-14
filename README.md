# zoomin

Self-hosted meeting rooms built on LiveKit. A single participant can share **several screens at once** (plus camera
and microphone), and the room host controls a stage layout (side-by-side, grid, focus; swap slots, resize) that every
viewer sees identically. Sign-in is with a Google account (Better Auth). Backend: Bun + Elysia + SQLite. Frontend: a
React SPA bundled by Bun.

## Accounts and roles

- **Google sign-in** is the only way in (no password login). Any Google account can register unless a super admin
  restricts email domains in `/dev`. Banned accounts cannot sign in.
- **Profile** (`/settings`): change your display name, use your Google photo, view and revoke sign-in sessions on
  other devices, delete your own account. The profile photo appears on avatar tiles and in the participant list.
- **Two layers of roles.** Global (account) roles: `user` · `admin` · `super_admin`. Room roles: `host` ·
  `participant` · `viewer` (from the invite link; `host` was previously named `admin`).
  - `user`: can only join rooms they are invited to.
  - `admin`: creates rooms (the creator becomes host), joins any room as host, and in `/admin` can ban/unban, revoke
    sessions, or delete `user` accounts, and delete rooms.
  - `super_admin`: everything an admin can do plus `/dev` (promote/demote admins, system health, audit log, allowed
    email domains, configuration summary). **Granted only through the `SUPER_ADMIN_EMAILS` env var**, synced on every
    sign-in; it cannot be granted through the UI. Nobody can ban or delete themselves.
- **Room types: public, private, password.** Public rooms (default): anyone signed in who holds an invite link can
  join. Private rooms: only members invited by email. Password rooms: anyone who knows the room ID or holds an invite
  link can join with the password and then becomes a member. The room host (or admin+) manages the room in the
  **Room settings** dialog: title, type, password, members (invite by email; an email without an account becomes a
  pending invitation that is claimed automatically on first sign-in), active/inactive (deactivating disconnects all
  participants), expiry (no limit by default, max 365 days; expired rooms are closed automatically within 60 seconds),
  and room deletion.
- **Pages**: `/` public landing, `/login`, `/app` lobby, `/rooms/:roomId`, `/invite/:invite`, `/settings`, `/admin`
  (admin+), `/dev` (super_admin). Admin/dev actions are recorded in the audit log.

## Prerequisites

- **Bun 1.4.2**
- **LiveKit server** (tested with 1.13.11). For local development run `livekit-server --dev` (test-only credentials
  `devkey`/`secret`, URL `ws://127.0.0.1:7880`). There is no official macOS binary; how to build and run it is in
  [`RND/spike/01-livekit-server.md`](RND/spike/01-livekit-server.md).

## Local quick start

```bash
bun install

# LiveKit dev server (pick one), credentials devkey/secret at ws://127.0.0.1:7880
RND/spike/.bin/livekit-server --dev                                  # source-built binary (see RND/spike/01)
docker run --rm -p 7880:7880 -p 7881:7881 -p 7882:7882/udp livekit/livekit-server:v1.13.11 --dev --bind 0.0.0.0 --node-ip 127.0.0.1

cp .env.example .env          # or: bun src/server/main.ts env > .env  (binary: zoomin env > .env)
# set GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET (see "Google sign-in setup") and SUPER_ADMIN_EMAILS=<your Google email>
bun run dev                   # http://localhost:3000
```

Open **`http://localhost:3000`** (not `http://0.0.0.0:3000` or a LAN IP: those are not secure contexts, so camera,
screen share and copy-link fail, and their origin is not registered with Google), then sign in with Google. Emails
listed in `SUPER_ADMIN_EMAILS` become super_admin automatically; promote other admins from `/dev`. Without Google
credentials the app still runs, but the sign-in button reports that Google sign-in is not configured.

## Configuration

In development every variable has a default (matching LiveKit `--dev`). With `NODE_ENV=production`,
`LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `BETTER_AUTH_SECRET` (at least 32 characters), `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET` are required; the server refuses to start if any is empty. Every variable is documented in
`.env.example` (identical to the output of `zoomin env`; as a table: `zoomin --docs env`).

| Var | Default | Purpose |
|---|---|---|
| `NODE_ENV` | `development` | `production` enforces required secrets and serves the built SPA. The binary runs as production when unset. |
| `PORT` | `3000` | HTTP(S) listen port (`-p/--port` overrides). |
| `HOST` | `0.0.0.0` | Listen interface. Behind a reverse proxy use `127.0.0.1` so the app port is not exposed directly. |
| `DB_PATH` | `./data/zoomin.sqlite` | SQLite file; directory created automatically (`--db` overrides). |
| `TRUST_PROXY` | `false` | `true` only if the app is reachable **only** through a reverse proxy/tunnel: the client IP for rate limiting is taken from `X-Forwarded-For`. |
| `PUBLIC_APP_URL` | `http://localhost:3000` | Base URL as users open it; used for invite links. No trailing slash. |
| `LIVEKIT_URL` | `ws://127.0.0.1:7880` | LiveKit URL used by the server (server-to-server API and `/livekit` proxy target). |
| `PUBLIC_LIVEKIT_URL` | = `LIVEKIT_URL` | LiveKit URL sent to the browser; must be a publicly reachable `wss://` URL in production. |
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | `devkey` / `secret` in dev | Must match the key pair configured on the LiveKit server. |
| `BETTER_AUTH_SECRET` | dev key | Signs session cookies, OAuth state and invite links. Changing it signs everyone out and invalidates old invite links. |
| `BETTER_AUTH_URL` | = `PUBLIC_APP_URL` | Base URL for the OAuth callback. Must match the origin the browser opens. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | empty | Google OAuth client. Empty in dev = Google sign-in not configured. |
| `SUPER_ADMIN_EMAILS` | empty | Comma-separated super_admin emails, synced on every sign-in. Empty = no super_admin (`/dev` locked). |
| `ZOOMIN_TEST_AUTH` | empty | `1` enables the test-only login `POST /api/test/login`; always ignored in production. |
| `TLS_CERT_PATH` / `TLS_KEY_PATH` | empty | Serve HTTPS directly from the app (see "Local HTTPS"). Set both or neither. Behind a proxy, leave empty. |
| `WEB_DIST_DIR` | `dist/web` | Built SPA directory served in production (the binary uses its embedded SPA). |

### Google sign-in setup

Full steps are in `.env.example` section 4. In short, create an OAuth client of type **Web application** in the
Google Cloud Console with:

- Authorized JavaScript origins: `PUBLIC_APP_URL` (locally `http://localhost:3000`).
- Authorized redirect URI: `<BETTER_AUTH_URL>/api/auth/callback/google` (`BETTER_AUTH_URL` defaults to
  `PUBLIC_APP_URL`; locally `http://localhost:3000/api/auth/callback/google`).
- A consent screen in "Testing" status only accepts accounts registered as test users (max 100); click "Publish app"
  to let other accounts sign in.

Copy the client ID/secret into `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, generate `BETTER_AUTH_SECRET` with
`openssl rand -base64 48`, and set `SUPER_ADMIN_EMAILS` (comma-separated).

## Running

```bash
bun run dev     # hot reload, http://localhost:3000
bun run build   # build the production SPA into dist/web (required before start)
bun run start   # production mode, serves dist/web
```

Production mode refuses to start if `dist/web/index.html` is missing (the location can be changed with
`WEB_DIST_DIR`). `bun run build` emits minified, hashed assets split per page (`scripts/build.web.ts`); sourcemaps are
generated separately and not served. SPA files are resolved per request, so running `bun run build` while the
server is up takes effect without a restart (tabs still on the old build need a reload). For local work use
`bun run dev`.

### Single binary

`zoomin` can be compiled into a single executable (`bun build --compile`) that bundles the Bun runtime, the server,
the SPA (prebuilt `dist/web`, minified + Tailwind) and the SQL migrations. At runtime it needs no Bun, `dist/`,
`migrations/` or `node_modules`.

```bash
bun run build:binary       # host target → bin/zoomin-<os>-<arch>
bun run build:binary:all   # linux-x64, linux-arm64, darwin-arm64, darwin-x64, windows-x64
bun scripts/build.binary.ts --target bun-linux-x64-musl --target bun-linux-arm64   # specific targets
```

Usage:

```bash
zoomin --help              # commands and options (-p/--port, -H/--host, --db, --env-file); zoomin -v = version
zoomin --docs              # full documentation; topics: usage, env, deploy, api, readme, list
zoomin env > .env          # example .env, then fill in the secrets
zoomin check               # validate configuration without starting; secrets are only shown as set/empty
zoomin migrate             # apply migrations and exit
zoomin healthcheck         # check /api/health of the local server, exit 0/1 (used by the container healthcheck)
zoomin                     # run the server (= zoomin serve)
```

Emergency account access (directly against the DB on the server, e.g. when no super_admin can sign in):

```bash
zoomin user list                                  # email, role, ban status
zoomin user promote ana@example.com --role admin  # or --role user to demote; super_admin only via env
zoomin user unban ana@example.com
```

From source: `bun src/server/main.ts user list` (same `--db`/`--env-file` options as other commands).

The binary runs with `NODE_ENV=production` unless `NODE_ENV` is set explicitly, so production secrets are required
(`zoomin check` reports what is missing). A `.env` in the working directory is loaded automatically. `--env-file` only
fills variables not already set in the process environment; `--port/--host/--db` flags override both. Size is roughly
90-110 MB per target (mostly the Bun runtime).

### Local HTTPS (testing from other devices)

Camera, microphone and screen share require a secure context. `localhost` is exempt, but access from another device
(e.g. via a Tailscale IP) needs HTTPS. Set both `TLS_CERT_PATH` and `TLS_KEY_PATH` (PEM files) in `.env`:

```bash
# Option 1: Tailscale certificate (MagicDNS + HTTPS must be enabled on the tailnet)
tailscale cert <host>.<tailnet>.ts.net   # produces <host>.<tailnet>.ts.net.crt and .key
# Option 2: mkcert (install it yourself); the local CA must be trusted on the test device
mkcert -install && mkcert <host> <ip>
```

Then open `https://<host>:3000` and set `PUBLIC_APP_URL` to that address so invite links are correct. Setting only
one of the two variables, or pointing at a missing file, makes the server fail to start.

## Proven deployment architecture

Tested 2026-11-14 from other devices: the app runs on one machine (Mac/server, no public IP) behind a Cloudflare
Tunnel; LiveKit 1.13.11 runs on a VPS as a Portainer stack behind Traefik. Behind the tunnel the app runs in
production mode (`bun run build && bun run start`, or the binary), not `bun run dev`.

```
app (HTTPS)       browser ──▶ Cloudflare ──▶ Cloudflare Tunnel ──▶ zoomin :3000 (Mac/server)
signaling (wss)   browser ──▶ Cloudflare ──▶ Traefik (lk.example.com) ──▶ LiveKit :7880 (VPS, not published)
media (WebRTC)    browser ──────────────────▶ VPS public IP 7882/udp (primary), 7881/tcp (fallback)
token/API         zoomin ──▶ LIVEKIT_URL (wss://lk.example.com)
```

Cloudflare does not forward raw UDP/TCP, so media always goes straight to the VPS IP. The media ports are published by
Docker and allowed through ufw; TURN is disabled, so clients on networks that only allow port 443 cannot send media.
Steps, tests and firewall notes: [`deploy/README.md`](deploy/README.md) §LiveKit via Portainer, stack
[`deploy/livekit-compose.yml`](deploy/livekit-compose.yml).

### Browser-to-LiveKit connection: two options

**A. LiveKit subdomain (recommended, proven).** The browser talks to LiveKit directly through Traefik:

```bash
PUBLIC_APP_URL=https://app.example.com
PUBLIC_LIVEKIT_URL=wss://lk.example.com   # used by the browser
LIVEKIT_URL=wss://lk.example.com          # used by the server (tokens, layout sync)
LIVEKIT_API_KEY / LIVEKIT_API_SECRET      # same as the LiveKit stack env
```

**B. Same-origin `/livekit` proxy.** The app proxies LiveKit signaling at the `/livekit` path (WebSocket + HTTP
`GET`/`HEAD`, prefix stripped, forwarded to `LIVEKIT_URL`; active in dev, `bun run start` and the binary). Useful when
there is no subdomain for LiveKit and a single app hostname is all you have:

```bash
PUBLIC_APP_URL=https://app.example.com
PUBLIC_LIVEKIT_URL=wss://app.example.com/livekit   # signaling through the app
LIVEKIT_URL=ws://127.0.0.1:7880                     # or a remote LiveKit, e.g. wss://lk.example.com
```

The proxy only carries signaling. WebRTC media still flows directly from the browser to LiveKit, so LiveKit's media
ports (`rtc.tcp_port` / `rtc.udp_port` / `rtc.port_range_*`) and the IP it advertises must be reachable from client
devices. The app session cookie is not forwarded to LiveKit, and the token (`access_token`) is not logged.

## Usage flow

1. An admin (global role) creates a room in the `/app` lobby (ID + title) and becomes its host.
2. The host creates invite links per role (`host` / `participant` / `viewer`), valid for 72 hours by default, max
   720. Links can also be created inside the room with the **Invite** button. Alternatively (and the only way for
   private rooms), the host invites by email in Room settings › Members.
3. The guest opens the link, sees the room title and role, signs in with Google if needed, then checks camera and
   microphone on the pre-join screen before entering. Name and photo come from the profile.
4. Participants turn on camera/microphone and press "Add screen" repeatedly to share several screens.
5. The host picks a template, swaps slots (drag and drop) and resizes panels. Every viewer, including late joiners,
   sees the same layout.

Viewers only watch: they get no camera/microphone/screen buttons, and the server rejects publishing from a viewer
token.

## API

All endpoints are JSON under `/api`, authenticated by the Better Auth session cookie (Google sign-in). Errors have the
shape `{ error, code?, path? }` with a stable `code`. The full endpoint reference, access rules and rate limits are in
[`docs/api.md`](docs/api.md); the type contract is [`src/shared/api.types.ts`](src/shared/api.types.ts).

## Testing

```bash
bun test            # unit + integration
bun run typecheck
bun run test:e2e    # browser tests (Playwright, Chromium with fake camera/mic/screen)
```

Integration tests (`test/*.integration.test.ts`) and e2e need a LiveKit dev server at `ws://127.0.0.1:7880` with
`devkey`/`secret` (see Local quick start); a `.env` that points at another LiveKit makes the integration tests fail.
Without LiveKit (CI): `ZOOMIN_SKIP_LIVEKIT_TESTS=1 bun test` skips tests that need a real LiveKit (counted as `skip`).

E2e starts two app instances with temporary databases: dev mode on port 3101 and production mode on port 3102 (the
SPA is built into a temporary folder via `WEB_DIST_DIR`, not `dist/web`). E2e never calls Google: login uses the
test-only `POST /api/test/login` endpoint, which is enabled only when `ZOOMIN_TEST_AUTH=1` and not in production (the
`prod` project proves it returns 404). E2e servers run with `bun --no-env-file` and every variable is set explicitly
in `playwright.config.ts`, so a developer's `.env` is never read. Install the browser once with
`bunx --bun playwright install chromium`. Reports and traces go to `e2e/.artifacts/`; bugs found by e2e are tracked in
`e2e/BUGS.md`.

Post-deploy smoke test: `SMOKE_URL=https://<domain> bun test test/smoke.prod.test.ts`.

## Troubleshooting

Common symptoms, causes and fixes (secure context, LiveKit connectivity, Google OAuth `redirect_uri_mismatch`,
banned accounts, stale SPA chunks): [`docs/troubleshooting.md`](docs/troubleshooting.md).

## Deploy

All deployment guides live in [`deploy/README.md`](deploy/README.md). Release versions follow `version` in
`package.json` and [`CHANGELOG.md`](CHANGELOG.md).

- **Docker image (GHCR) + Portainer.** Every push to `main` (and `v*` tags) runs the tests in GitHub Actions
  (`.github/workflows/docker.yml`) and publishes `ghcr.io/bipprojectbali/zoomin` (tags `latest`, `sha-<commit>`,
  version). Deploy it as a Portainer stack from [`compose.yml`](compose.yml): Traefik in front (network `public-net`,
  app port not published), SQLite in the `zoomin-data` volume, stack env from `deploy/zoomin-stack.env.example`.
  Roll back by setting `ZOOMIN_TAG` (e.g. `sha-<7 chars>` or a release version) and redeploying. Steps:
  [`deploy/README.md`](deploy/README.md) §App via Portainer (image GHCR).
- **LiveKit as a Portainer stack** on a VPS (the proven setup, see Proven deployment architecture).
- **A full Linux server**: Caddy + LiveKit + systemd + SQLite backups + rollback.

## Project layout

```
src/cli/      binary CLI (serve, migrate, check, healthcheck, user, env, docs)
src/server/   Elysia API, auth (Better Auth + Google, roles, invites), admin/dev, rooms, LiveKit tokens, layout
src/shared/   API contract, layout model, track naming convention (screen-<n>)
src/web/      React SPA: pages/, landing/, app/, lobby/, prejoin/, room/ (media + multi-screen), stage/ (layout + host
              editing), settings/ (profile), admin/, dev/
scripts/      production SPA build + single binary
migrations/   SQLite migrations
test/         integration tests against LiveKit dev + production smoke test
e2e/          Playwright browser tests
deploy/       production deployment artifacts
docs/         reference docs (API, troubleshooting)
RND/          plans (plan/), spikes, and QA (qa/)
```

## Known limitations

- Screen sharing works only in desktop browsers. Screen audio only in Chromium.
- Invite links are multi-use until they expire and **cannot be revoked**.
- Google is the only sign-in method: if Google or the OAuth client has problems nobody can sign in (existing sessions
  stay valid). Emergency role/ban changes: `zoomin user` on the server.
- Automated browser tests (Playwright + production-mode QA) use fake media. Testing on real devices with the screen
  picker and OS permissions, and on mobile networks or with UDP blocked, has not been done yet; the manual checklist
  is in `RND/spike/06-browser-manual.md`. Release status: [`RND/qa/00-status-rilis.md`](RND/qa/00-status-rilis.md).
- Of the `deploy/` artifacts, only the LiveKit Portainer stack has been run on the VPS; the Caddy + systemd path has
  not. TURN is disabled in that stack, so networks that only allow port 443 cannot send media.
- No chat, raise hand, reactions, speaker selection, or theme toggle yet (the theme follows the OS).
- Local HTTPS: a self-signed certificate (or an untrusted mkcert CA) makes browsers block or warn. LiveKit must also be
  reached via `wss://` from other devices, while `livekit-server --dev` only speaks `ws://`; for multi-device testing
  see [`RND/spike/01-livekit-server.md`](RND/spike/01-livekit-server.md) §Deploy.

## Plans

Architecture, stack, milestones, and risks/decisions: [`RND/plan/`](RND/plan/).
