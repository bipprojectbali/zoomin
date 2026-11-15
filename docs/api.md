# zoomin HTTP API

All endpoints return JSON under `/api`. The session is a Better Auth cookie (Google sign-in). Type contract:
[`src/shared/api.types.ts`](../src/shared/api.types.ts).

## Errors and auth

Errors are returned as `{ error, code?, path? }`. `code` is stable and meant for the UI to translate (e.g.
`room_not_found`, `invite_invalid`, `rate_limited`, `banned`, `insufficient_role`, `cannot_modify_self`); `path`
points at the offending field on validation errors (400).

- No session → 401 `unauthorized`.
- Banned account → 403 `banned`.
- Insufficient role → 403 `insufficient_role`.
- Invite acceptance is rate limited per IP; over the limit → `429` with a `Retry-After` header.

Better Auth is mounted at `/api/auth/*` (e.g. `POST /api/auth/sign-in/social` starts Google sign-in, callback
`/api/auth/callback/google`, `POST /api/auth/sign-out`). The Better Auth admin plugin endpoints `/api/auth/admin/*` are
deliberately blocked (404); admin actions go through `/api/admin/*` and `/api/dev/*`.

## Endpoints

| Method | Path | Access / body | Response |
|---|---|---|---|
| GET | `/api/health` | public | `{ ok: true }` |
| GET | `/api/me` | session | `{ user }` (`SessionUser`) \| 401 \| 403 `banned` |
| PATCH | `/api/me` | session, `{ name?, image? }` (name 1-60 chars; `image` is an https URL, or `null` = Google photo) | `{ user }` |
| DELETE | `/api/me` | session (not super_admin) | 204 (deletes own account) |
| GET | `/api/me/sessions` | session | `{ items }` (sign-in sessions, `current` flag) |
| DELETE | `/api/me/sessions` · `/api/me/sessions/:id` | session | 204 (revoke all other sessions / one session) |
| GET | `/api/rooms?limit=&cursor=` | session | `{ items, nextCursor }` (user: rooms they belong to; admin+: all; limit default 20, max 100) |
| POST | `/api/rooms` | admin+, `{ id, title, visibility?, password?, expiresAt?, members?, stageMode? }` | `RoomSummary`; the creator becomes host. `visibility: "password"` requires a `password` of 6–64 characters (stored as a hash, never returned). `members` (`[{ email, role }]`, max 100) are created in the same request (existing account → member, otherwise → pending invitation; one failure = room is not created) \| 400 `email_domain_not_allowed` (`path` `/members/<i>/email`) \| 403 `insufficient_role` |
| GET | `/api/users/search?q=&limit=` | admin+ / host of at least one room | `{ items: [{ id, name, email, image }] }` (`q` optional, 0–100 chars, matches name/email; empty = all, sorted by name; banned accounts excluded; limit default 20, max 50, no cursor) \| 403 `insufficient_role` \| 429 `rate_limited` (30/min per user) |
| GET | `/api/rooms/:roomId` | member / admin+ | `RoomSummary` \| 401 \| 403 \| 404 |
| PATCH | `/api/rooms/:roomId` | room host / admin+, `{ title?, visibility?, password?, enabled?, expiresAt?, stageMode? }` | `RoomSummary` (`enabled: false` disconnects all participants; `password` sets/changes the password of a `password` room; switching to `public`/`private` removes the password) |
| POST | `/api/rooms/:roomId/join` | session, `{ password }` | `{ roomId, role }` (`password` rooms; caller becomes a `participant` member) \| 403 `password_invalid`/`room_private`/`forbidden`/`room_inactive`/`room_expired` \| 429 (5/min per user+room) |
| DELETE | `/api/rooms/:roomId` | room host / admin+ | 204 (deletes the room in the DB and LiveKit) |
| GET | `/api/rooms/:roomId/members?limit=&cursor=` | room host / admin+ | `Page<RoomMemberItem>` (members, then pending invitations; limit default 50, max 200) |
| POST | `/api/rooms/:roomId/members` | room host / admin+, `{ email, role }` | 201 `RoomMemberItem` (existing account → member; otherwise → pending) |
| PATCH · DELETE | `/api/rooms/:roomId/members/:userId` | room host / admin+, PATCH `{ role }` | `RoomMemberItem` / 204 \| 404 `member_not_found` \| 409 `last_host` |
| DELETE | `/api/rooms/:roomId/invitations/:email` | room host / admin+ | 204 (cancels a pending invitation) \| 404 `member_not_found` |
| POST | `/api/rooms/:roomId/invites` | room host / admin+, `{ role, ttlHours? }` | `{ url, expiresAt }` \| 403 `room_private` |
| GET | `/api/invites/preview?invite=` | public (session optional) | `InvitePreview` (room title, role, current session, `passwordRequired`) \| 400 \| 403 `room_private`/`room_inactive`/`room_expired` \| 404 |
| POST | `/api/invites/accept` | session, `{ invite, password? }` | `{ user, roomId, role }` \| 401 \| 403 (as for preview; password room, non-member: `password_required`/`password_invalid`) \| 429 (200/hour per IP; password 5/min per user+room) |
| POST | `/api/rooms/:roomId/token` | member / admin+ | `{ token, url, role }` (role comes from the DB, never from the body) \| 403 `room_inactive`/`room_expired`/`password_required` |
| GET | `/api/rooms/:roomId/layout` | member / admin+ | `{ version, layout \| null, stageMode }` |
| PUT | `/api/rooms/:roomId/layout` | room host / admin+; in `open` stage mode also `participant` (never `viewer`), `{ baseVersion, layout }` | `{ version }` \| 403 `stage_locked` \| 409 `{ currentVersion }` |
| PUT | `/api/rooms/:roomId/stage-mode` | room host / admin+, `{ mode: "host" \| "request" \| "open" }` | `RoomSummary` (layout unchanged; new mode is broadcast in the room metadata `{ stageMode, layout }`) |
| POST | `/api/rooms/:roomId/stage-requests` | host / participant member, `{ trackName, action: "show" \| "focus" }` (`trackName` = one of the caller's own `screen-N` tracks) | `StageRequest` (pending 60 s; a new request replaces the caller's previous one) \| 403 \| 409 `stage_mode_mismatch` (room not in `request` mode) \| 429 (5/min per user+room) |
| GET | `/api/rooms/:roomId/stage-requests` | room host / admin+ | `{ items: StageRequest[] }` (pending only) |
| POST | `/api/rooms/:roomId/stage-requests/:id/approve` · `/deny` | room host / admin+ | 204 \| 404 `stage_request_not_found` (approve does not change the layout: the host client applies it with PUT layout first) |
| DELETE | `/api/rooms/:roomId/stage-requests/:id` | request owner | 204 \| 404 `stage_request_not_found` |
| GET | `/api/admin/users?q=&role=&banned=&limit=&cursor=` | admin+ | `Page<AdminUser>` |
| POST | `/api/admin/users/:id/ban` | admin+, `{ reason, expiresInHours? }` | `{ user }` (sessions revoked, user removed from active rooms) |
| POST | `/api/admin/users/:id/unban` | admin+ | `{ user }` |
| DELETE | `/api/admin/users/:id` | admin+ | 204 |
| POST | `/api/admin/users/:id/sessions/revoke` | admin+ | 204 |
| GET | `/api/admin/rooms?limit=&cursor=` | admin+ | `Page<RoomSummary & { members, live, participants }>` |
| DELETE | `/api/admin/rooms/:id` | admin+ | 204 (deletes the room in the DB and LiveKit) |
| PUT | `/api/dev/users/:id/role` | super_admin, `{ role: "user" \| "admin" }` | `{ user }` |
| GET | `/api/dev/health` | super_admin | `SystemHealth` (version, LiveKit, DB) |
| GET | `/api/dev/audit?action=&actorId=&limit=&cursor=` | super_admin | `Page<AuditEntry>` |
| GET · PUT | `/api/dev/settings` | super_admin, `{ allowedEmailDomains }` | `AppSettings` |
| GET | `/api/dev/config` | super_admin | configuration summary (secrets are masked, only reported as set or empty) |

Stage request changes are pushed to everyone in the room over the LiveKit data channel (reliable, topic
`zoomin.stage`) as `StageEvent` JSON: `{ type: "request.created" | "request.resolved", request }`, where
`request.status` is `pending`, `approved`, `denied`, `canceled` or `expired`. Clients also `GET` the list on
join/reconnect. Pending requests live in server memory and are lost on restart.

## Admin targeting rules

`/api/admin/*` actions (admin+) may only target `user` accounts; a super_admin may also target admins. Nobody can
target themselves (403 `cannot_modify_self`) or a super_admin. Every admin/dev action is recorded in the audit log.
