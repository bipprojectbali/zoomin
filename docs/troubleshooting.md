# Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Blocked: Host header does not match the dev server` when opened via a domain/tunnel | The Bun dev server (`bun run dev`) rejects hosts other than localhost | Use production mode: `bun run build && bun run start` (or the binary) |
| Copying the invite link fails, camera/screen unavailable | Opened at `http://0.0.0.0:3000` or a LAN IP, which is not a secure context | Open `http://localhost:3000`, or use HTTPS ([README: Local HTTPS](../README.md#local-https-testing-from-other-devices) / tunnel) |
| "Failed to connect to the media server" toast/banner | The browser cannot reach LiveKit | Check that `PUBLIC_LIVEKIT_URL` is reachable from the client (`wss://`, not `ws://127.0.0.1`) and the VPS media ports are open |
| `POST /api/rooms/:id/token` returns 500, `syncRoomLayout` fails in the log | `LIVEKIT_URL` or key/secret do not match the LiveKit server | Align `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` with the LiveKit server, then restart the app |
| `M_ID` error from `chrome-extension://...` in the console | A browser extension, not the app | Ignore it, or test in a profile/incognito window without extensions |
| Google shows `Error 400: redirect_uri_mismatch` | `BETTER_AUTH_URL`/`PUBLIC_APP_URL` differ from the origin the browser opened, or `<BETTER_AUTH_URL>/api/auth/callback/google` is not registered on the OAuth client | Open the app exactly at `PUBLIC_APP_URL` (locally `http://localhost:3000`), register the origin + redirect URI in Google Cloud Console, restart the app |
| Sign-in button says Google sign-in is not configured | `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` empty (dev) | Set both in `.env` ([README: Google sign-in setup](../README.md#google-sign-in-setup)), restart the app |
| Sign-in rejected: email domain not allowed | A super admin restricted email domains in `/dev` → Settings | Sign in with an allowed domain, or ask a super admin to add yours (super admins can always sign in) |
| "Your account has been banned" | The account was banned from `/admin` | Ask an admin to unban it; emergency on the server: `zoomin user unban <email>` |
| Google sign-in fails for some accounts ("access blocked"/not registered) | Consent screen is still "Testing" and the account is not a test user | Add the account as a test user, or "Publish app" on the OAuth consent screen |
| Blank page, console shows a `.js` chunk 404 after `bun run build` | The open tab still references chunks from the previous build, which the new build removed | Reload the page; locally use `bun run dev` |
| LiveKit log warns about a small UDP receive buffer | Host kernel limit `net.core.rmem_max` | Optional: raise `net.core.rmem_max` via sysctl on the VPS host |
