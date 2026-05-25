# Auth + Join Flow — HearthVTT (`docs/components/auth-join-flow.md`)

This document defines the **join link**, **PIN claim**, **cookie session**, and **WebSocket auth** flow for HearthVTT across hosting modes (hosted, tunnel, direct-IP). It operationalizes ADR-0004.

---

## Goals

- **Low friction**: players join via a link, not mandatory cloud-platform accounts.
- **Lightweight per-server accounts**: a player has a username + password on each server they play on (no email, no recovery questions). Enables multi-device login, browser changes, and cookie clearing without GM intervention.
- **Portable campaigns**: a campaign's seats are durable identifiers within the campaign file. Account-to-seat bindings are server-local and remapped on import/export between servers (or between self-host and cloud).
- **Secure by default** (hosted/tunnel): HTTPS + WSS, HttpOnly cookies.
- **No secrets in bookmarks**: invite tokens are temporary; the bookmarkable `/play` URL contains no secrets.
- **Server Admin ≠ Campaign GM**: server access control (admin) is separate from campaign gameplay (GM).
- **Admin ≠ Player Account ≠ Seat**: three distinct identity layers (see Terminology).
- **Single server implementation**: only `PUBLIC_BASE_URL` changes per deployment.

Non-goals (for v1):

- OAuth / social login (platform accounts optional later, see Open Issues)
- email-based password recovery (admin resets player passwords via admin UI)
- strong identity verification beyond username + password + invite PIN (this is a game table context)

---

## Terminology

- **Server Admin**: operator of the server instance; manages server-wide operations (not tied to any campaign).
- **PlayerAccount**: a server-local identity (username + password). Belongs to one server. May hold multiple seats across multiple campaigns. Identifies the _person_.
- **Seat**: an access identity within a single campaign (player / GM / spectator). Bound to exactly one PlayerAccount and exactly one Campaign at any time. Identifies the _role_. Cardinality: one PlayerAccount → N seats; one Campaign → N seats; one Seat → exactly 1 PlayerAccount and 1 Campaign.
- **Invite**: a capability token that can be claimed to bind a seat to a PlayerAccount (existing or newly created during claim).
- **AuthSession**: long-lived player session, identified by a refresh token cookie. Bound to a PlayerAccount (not a seat). Produces short-lived access tokens used for API/WS auth.
- **AdminSession**: separate authentication for server admin (distinct from player sessions: different cookies, different tables, different recovery flow).

---

## Supported deployment modes

All modes use the same routes and cookies.

1. **Hosted**: `https://hearth-vtt.com/...`
2. **Tunnel**: `https://<serverId>.hearth-vtt.com/...`
3. **Direct / LAN**: `http://<ip>:<port>/...` (insecure; for dev / hardcore)

**Key config**: `PUBLIC_BASE_URL` is used for generating invite URLs.

---

## URL routes (public)

### `GET /join/<inviteToken>`

Entry point from Discord/email/etc.

Behavior:

- Validate invite token existence and expiry. **GET must have no side effects** (no claim attempts logged, no `maxClaims` decrement) — Discord/Slack/etc. preview bots will hit this URL.
- If already claimed/revoked: render a friendly "expired link" page with instructions to ask the GM for a new invite.
- If valid: serve the SPA and route to the claim UI.

**Never** require the user to bookmark this URL.

### `POST /api/auth/claim-invite`

Claim the invite. Binds the seat to a PlayerAccount (existing or newly created in the same request).

Inputs:

- `inviteToken`
- `pin` (user-provided invite PIN)
- `mode`: `"login"` | `"register"`
- If `mode: "login"`: `{ username, password }` of an existing PlayerAccount on this server.
- If `mode: "register"`: `{ username, password }` for a new PlayerAccount (server enforces username uniqueness and password min length).
- optional device metadata: `deviceName`, `userAgent` (for audit UI)

Server behavior on success:

- Validates PIN; if invalid, applies rate limit (see PIN policy).
- Validates/creates the PlayerAccount.
- Binds `seats.accountId = <claiming account>`.
- Creates an AuthSession bound to the PlayerAccount.
- Sets the refresh cookie.
- Returns minimal boot JSON: `{ accountId, campaignId, seatId, roles }`.
- Client redirects to `/play/<campaignId>`.

If the user is already logged in to a different account in the same browser, the claim page still shows the login/register choice — it does **not** auto-bind to the current cookie. (Households sharing a browser need this.)

### `GET /play`

Stable bookmarkable URL. Contains no secrets.

Behavior:

- Not authenticated → render login page (username + password + "forgot password" link).
- Authenticated → render **campaign picker** listing every campaign the account holds a seat in. Single-seat accounts may be auto-redirected to `/play/<campaignId>`.

### `GET /play/<campaignId>`

Per-campaign play URL. Bookmarkable. Contains no secrets.

Behavior:

- Not authenticated → redirect to `/play` (with optional `?returnTo=...`).
- Authenticated but no seat in this campaign → show "no access" page with link to `/play`.
- Authenticated with a seat → load the play UI for that campaign.

### `POST /api/auth/login`

Log into an existing PlayerAccount.

Inputs: `{ username, password }`.

On success: creates AuthSession, sets refresh cookie, returns `{ accountId }` and the list of campaigns/seats the account holds.

Rate-limited per IP (see PIN/password policy).

### `POST /api/auth/refresh`

Uses refresh cookie to mint a new short-lived access token.

- **Refresh token is stable across normal use** (does not rotate on every refresh). This intentionally diverges from strict OAuth BCP to support multi-tab and multi-device usage, which are the norm for a VTT.
- **Reuse detection still applies to revoked tokens**: presenting a refresh token whose session has been revoked (by logout, admin kick, or password change) revokes the entire session chain defensively and forces re-login.
- Refresh tokens have a finite max lifetime (default 30 days, configurable) after which the user must log in again.

### `POST /api/auth/logout`

Revokes the current AuthSession (server-side) and clears the refresh cookie. Other devices remain logged in.

### `POST /api/auth/forgot-password` (player; admin-mediated)

For self-hosted: returns a generic "contact your admin" response. The actual reset is performed by the admin via `PATCH /api/admin/accounts/:id/reset-password`, which sets a temporary password the player must change on first login.

For cloud-hosted: handled by the platform's account management, not by HearthVTT. See Open Issues.

---

## Invite token lifecycle (Admin-managed)

Invites are capability tokens mapped server-side to a claim.

Recommended fields:

- `inviteId` (internal)
- `inviteToken` (public; long random)
- `campaignId`
- `seatId` OR `seatTemplate` (claim slot to create seat on claim)
- `rolesGranted` (player/gm/spectator)
- `expiresAt` (recommended default: 7 days)
- `maxClaims` (default: 1)
- `claimedAt`, `claimedBySessionId`, `claimedByIp` (optional audit)
- `pinHash` (argon2/bcrypt)
- `createdByAdminSeatId` (audit)

Invite rules:

- **Invite tokens must be unguessable** (>= 128 bits of entropy).
- Invites should be **short-lived** (default 7 days) and **revoked/marked claimed** immediately on successful claim.
- Discord link previews may hit the join URL; short-lived + claim flow avoids accidental consumption.

Admin controls:

- create invite (choose seat, role, expiry, requiresPin toggle)
- revoke invite (immediate invalidation)
- rotate invite (revoke old, mint new)

---

## PlayerAccount model

A PlayerAccount is the durable identity for a player on a server. It owns sessions, holds seats, and is the unit of password change / account revocation.

### Schema

`player_accounts` table:

- `id` (uuid, primary key)
- `username` (unique on the server, case-insensitive)
- `password_hash` (scrypt; reuse the admin auth hashing utility)
- `must_change_password` (bool — set true when an admin issues a temporary password)
- `created_at`, `last_login_at`

`seats.account_id` foreign keys into `player_accounts.id`. Nullable until claimed.

`auth_sessions` belongs to `account_id` (not `seat_id`).

### Username rules

- Unique per server, case-insensitive.
- Min/max length and allowed characters TBD; ASCII alphanumeric + `_-.` is a safe starting point.
- Players choose their own usernames at claim time. No admin pre-approval.
- Username collisions are local to one server; the blast radius is small. Suggested UX on collision: "that username is taken — pick another, or log in if it's you."

### Password rules

- Hashed with scrypt (same utility as admin password hashing).
- Minimum length: 8 characters. No complexity requirements (per current research, length matters more than character classes).
- No maximum length below 256.
- Stored only as hash; never logged.
- Failed login attempts **rate-limit by IP**, not by account. Locking accounts on failed logins creates a DoS vector against a known username list.

### Multi-seat semantics

- One account can hold seats in many campaigns on the same server.
- A seat is bound to exactly one account at any time.
- Re-binding a seat to a different account is an admin operation (e.g., a player leaves the table; their seat is re-issued to someone else). Re-binding revokes any active sessions tied to the old account _for that seat's campaign access_, but does not revoke the old account itself.
- When a campaign is exported, seat IDs and seat metadata are preserved. Account bindings are **not** exported. On import to a different server, seats arrive unbound and must be re-claimed via fresh invites.

### Account management routes (player-facing)

The `/account` route is deferred (see Open Issues), but the eventual surface includes:

- View account info (username, created date, list of seats across campaigns).
- Change password.
- Log out everywhere (revoke all AuthSessions for the account).

For cloud-hosted deployments, the player-facing account UI is provided by the platform, not by HearthVTT. See Open Issues.

---

## PIN policy (one-time friction)

Purpose: mitigate invite link leakage.

- PIN is required during invite claim (configurable per invite).
- Store only `pinHash` (argon2id preferred; scrypt acceptable to share infrastructure with password hashing).
- Rate-limit failed PIN attempts:
  - per invite token: 5 attempts, then 60-second cooldown (not "locked until expiry" — the most common cause of PIN failure is the GM mistyping the PIN to the player, and a short cooldown lets them re-verify and try again).
  - per IP: 20 attempts / 10 minutes.
- After the per-invite cooldown elapses, the invite is usable again with full attempt budget reset.
- Log every failed attempt with IP for admin audit.
- Admin UI shows the PIN inline (not just the hash) so the admin can re-verify what they sent.

---

## Session model (stable refresh + rotating access)

### Tokens

- **Refresh token**: long-lived secret bound to the PlayerAccount, stored in HttpOnly cookie. Default lifetime 30 days. Used only against `/api/auth/refresh` and during WS upgrade.
- **Access token**: short-lived bearer token (default 15 minutes). Returned by `/api/auth/refresh` as JSON; client stores it in memory and sends it on API requests as `Authorization: Bearer <token>`. WS upgrade may use either the refresh cookie or an access token query header (cookie is preferred).

The refresh token is **stable** — it does not rotate on every successful refresh. This is a deliberate departure from strict OAuth BCP, motivated by:

- **Multi-tab safety.** Rotating refresh tokens on every use plus reuse detection produces false-positive session revocations any time two tabs refresh near-simultaneously. Multi-tab is the norm for a VTT (map + character sheet pop-out).
- **Multi-device safety.** Same problem at device scope (phone + laptop both refreshing).
- **Acceptable threat model.** A VTT session is not a bank. The cost of a stolen refresh token is bounded (max 30 days, scoped to one server, no payment data).

Reuse detection still applies to **revoked** refresh tokens: presenting a refresh token whose session was revoked (logout, admin kick, password change) revokes the entire session chain and forces re-login on that device.

### Cookies

Refresh cookie:

- `HttpOnly`
- `Secure` (hosted/tunnel; in direct mode may be false)
- `SameSite=Lax` (player sessions; admin sessions use `Strict`)
- `Path=/`

Name:

- `hearth_refresh` (player sessions)
- `hearth_admin_session` (admin sessions)

### Revocation

Admin actions:

- revoke a PlayerAccount's sessions (forces re-login on all devices)
- revoke a single device/session
- kick active WS connections for a PlayerAccount (closes sockets without revoking the session — the next reconnect re-authenticates and resumes)
- reset a PlayerAccount's password (sets `must_change_password`, revokes all sessions)

User actions:

- logout (current session)
- log out everywhere (all sessions for the account) — deferred to `/account` route

---

## WebSocket authentication

### Connection

Client connects to:

- `wss://<origin>/ws?campaignId=<campaignId>` (hosted/tunnel)
- `ws://<origin>/ws?campaignId=<campaignId>` (direct/LAN)

The `campaignId` query parameter selects which seat the connection is for (one account may hold seats in multiple campaigns; the connection is per-seat).

Auth mechanism:

- Server reads the refresh cookie during WS upgrade.
- Validates the AuthSession → PlayerAccount.
- Resolves the seat: `SELECT * FROM seats WHERE account_id = ? AND campaign_id = ?`.
- If no seat → close with 4403.
- If valid → maps the connection to `{accountId, campaignId, seatId, roles}` and registers it in the seat's connection set.

### Multiple connections per seat

A seat may have **multiple simultaneous WebSocket connections** (multi-tab, pop-out windows, multi-device). The server keeps a `Set<WebSocket>` per `(accountId, seatId)` and broadcasts state changes to all of them.

Design implications (see also [realtime-ws.md](../protocols/realtime-ws.md)):

- All transient interactive state (prompts, workflow steps, initiative, token positions) is **server-owned**. Each connection is a projection of server state, not an independent state machine.
- Prompts are not delivered messages; they are state with a `status` field. A new prompt appears on all connections for the seat. When any connection resolves it, the server broadcasts the resolution and all connections dismiss the UI.
- Action handlers must be **idempotent against stale prompts**: an action referencing a `resolved` or `cancelled` prompt returns a no-op (with an info-level error), not an actual state change. This makes stale-UI-on-second-device safe by construction.
- Optimistic UI updates (e.g., live token drag) stay **on the originating connection only**. They are not broadcast to the originating account's _other_ connections, which see only server-confirmed positions.

Handshake messages (minimum):

- server (on connect): `{ type: "welcome", protocolVersion, serverVersion, accountId, seatId, campaignId }`

If not authenticated:

- Server closes with 4401 (no session) or 4403 (session valid but no seat in this campaign).
- Client attempts one silent `/api/auth/refresh` before showing the re-auth UI. If the refresh succeeds, reconnect with the new access token; only if refresh also fails does the user see a login page.

### Reconnect behavior

On reconnect:

- Client sends `{ type: "resume", lastEventSeq }`.
- Server replies with:
  - event backlog since `lastEventSeq` (or full snapshot if too stale)
  - the current set of pending prompts for that seat (derived from server state, not replayed from a delivery log)
  - the current set of active workflows for that seat

---

## CSRF considerations

Because we use cookies:

- Prefer using refresh cookie only for `/api/auth/refresh` and use access tokens for other APIs.
- For cookie-authenticated POST endpoints, use one of:
  - CSRF tokens (all admin endpoints use this)
  - SameSite protections (Lax for player sessions, Strict for admin) + ensure no cross-site POST endpoints are sensitive
  - Origin checks on state-changing endpoints

Hosted mode should validate `Origin` for WS and sensitive endpoints.

---

## Direct / LAN mode security posture

In direct mode (`http://` / `ws://`):

- Cookies may not be `Secure`
- Transport is not encrypted on the public internet
- Display a clear UI banner: “Insecure connection (HTTP). Use tunnel/hosted for HTTPS.”

Direct mode is supported for:

- development
- LAN playtests
- “off-the-grid” users accepting risk

---

## Admin tooling requirements (server UI/API)

Server admin must be able to:

- create campaigns
- delete campaigns
- import/export campaigns (account bindings are stripped on export; seats arrive unbound on import)
- create seats (across all campaigns)
- delete seats
- re-bind a seat to a different account (e.g., player roster change)
- create invite (role, expiry, pin required)
- revoke invite
- list PlayerAccounts on this server
- reset a PlayerAccount password (sets `must_change_password`, revokes all sessions)
- revoke all sessions for a PlayerAccount
- kick live WS connections for a PlayerAccount or seat
- view audit log: claims, login failures, password resets, revocations

---

## Server Admin Authentication

Server admin authentication is **separate** from seat-based player authentication. Admin has a dedicated auth system with its own cookies, sessions, and UI.

### Goals

- **Self-hosted convenience**: Server operator gets admin access naturally via setup PIN
- **Cloud-hosted security**: Platform can manage admin credentials securely
- **Tunneled deployment support**: Admin UI accessible from internet with strong authentication
- **No seat coupling**: Admin identity is not tied to campaign participation

### Admin password reset (forgotten password)

If the admin forgets their password, recovery uses the **filesystem-flag** pattern:

1. The admin (who has filesystem access — that's the point of self-hosting) creates an empty file at `DATA_DIR/admin-reset.flag`.
2. On next server startup (or via a `POST /api/admin/reset` endpoint that only works when the flag is present), the server:
   - Nulls `password_hash` on the `server_admin` record.
   - Re-runs the initial-setup ceremony: generates a new setup PIN, writes it to `DATA_DIR/admin-setup-pin.txt`, logs it to console.
   - Deletes `admin-reset.flag` (so the reset is not re-triggered on every subsequent startup).
3. The admin visits `/admin/setup` and completes setup as if it were a fresh install. **Campaigns, seats, and player accounts are untouched.**

The admin login page exposes an "I forgot my password" button that displays instructions for creating the flag file (it cannot trigger the reset directly without filesystem access, by design).

For cloud-hosted deployments, the platform provides admin credential recovery through its own channel (same one used to deliver the initial `ADMIN_SETUP_PIN`).

---

### Admin Auth Flow: First-Time Setup

**Applies to**: Pure self-hosted and tunneled deployments

1. **Server starts**: On first startup, if no `ServerAdmin` record exists:
   - Generate random 8-character alphanumeric setup PIN (128+ bits entropy)
   - Hash PIN (argon2id/bcrypt) and store in `server_admin` table with `setupPinExpiresAt` = now + 24 hours
   - Write PIN to `DATA_DIR/admin-setup-pin.txt` with instructions
   - Log PIN to console: "Admin setup required. Visit http://localhost:3000/admin/setup and enter PIN: ABC123XY"

2. **Admin visits `/admin/setup`**:
   - Client calls `POST /api/admin/check-setup` → `{ needsSetup: true, setupPinExpired: false }`
   - Render setup form: PIN input + optional password input

3. **Admin submits setup**:
   - Client calls `POST /api/admin/setup` with `{ setupPin, newPassword? }`
   - Server validates PIN hash, checks expiry
   - If valid:
     - Create `AdminSession` record
     - Set `hearth_admin_session` cookie (HttpOnly, Secure, SameSite=Strict)
     - Optionally set permanent `passwordHash` in `ServerAdmin` record (nulls `pinHash` and `setupPinExpiresAt`)
     - Delete `admin-setup-pin.txt`
     - Return `{ success: true }`
   - Client redirects to `/admin` (server settings page)

**Cloud-hosted override**:

- Platform sets `ADMIN_SETUP_PIN` environment variable instead of generating randomly
- No console logging (credentials managed by platform)
- Platform provides admin credentials via secure channel (email, dashboard, etc.)

### Admin Auth Flow: Returning Admin

**Applies to**: All deployments after first setup

1. **Admin visits `/admin`**:
   - Client checks for `hearth_admin_session` cookie
   - Client calls `GET /api/admin/check-auth` → `{ authenticated: boolean, needsSetup: boolean }`
   - If `needsSetup: true`, redirect to `/admin/setup`
   - If `authenticated: false`, redirect to `/admin/login`
   - If `authenticated: true`, render admin UI

2. **Admin login** (if not authenticated):
   - Client renders `/admin/login` with password input
   - Admin enters password
   - Client calls `POST /api/admin/login` with `{ password }`
   - Server validates `passwordHash` from `ServerAdmin` record
   - If valid:
     - Create new `AdminSession`
     - Set `hearth_admin_session` cookie
     - Return `{ success: true }`
   - Client redirects to `/admin`

### Admin Session Management

**AdminSession properties**:

- Cookie name: `hearth_admin_session` (distinct from player sessions: `hearth_session`)
- Cookie attributes: `HttpOnly; Secure; SameSite=Strict; Path=/`
- Session duration: 30 days (planned: 1 hour with sliding window extension)
- Session token: 256-bit cryptographically random value, hashed with SHA-256 (deterministic)
- CSRF token: 32-byte random value stored plaintext in database, returned on login/setup
- Stored in `admin_sessions` table with columns:
  - `session_token_hash` (SHA-256 of session token)
  - `csrf_token` (plaintext, used for CSRF validation)
  - `expires_at` (session expiration timestamp)
  - `revoked_at` (NULL if active, timestamp if revoked)
  - `created_at`, `last_used_at` (audit trail)

**Admin logout**:

- Client calls `POST /api/admin/logout` with `X-CSRF-Token` header
- Server validates CSRF token, revokes `AdminSession` (sets `revokedAt`)
- Clear `hearth_admin_session` cookie
- Client redirects to `/admin/login`

**Password change**:

- Client calls `POST /api/admin/change-password` with `{ currentPassword, newPassword }` and `X-CSRF-Token` header
- Server validates CSRF token and `currentPassword` against `ServerAdmin.passwordHash`
- If valid, update `passwordHash`, revoke all `AdminSession` records (force re-login)

**Session cleanup**:

- Periodic job runs every hour via `setInterval()` in main server process
- Deletes expired sessions: `DELETE FROM admin_sessions WHERE expires_at < ? OR revoked_at IS NOT NULL`
- Prevents database accumulation of stale session records
- No user-visible impact (expired sessions already non-functional)

### Admin vs Seat Authentication

| Aspect           | Admin Auth                                 | Seat Auth                   |
| ---------------- | ------------------------------------------ | --------------------------- |
| **Purpose**      | Server management                          | Campaign participation      |
| **UI**           | `/admin` (server/campaign/seat management) | `/play` (gameplay)          |
| **Cookie**       | `hearth_admin_session`                     | `hearth_session`            |
| **Database**     | `server_admin`, `admin_sessions`           | `seats`, `auth_sessions`    |
| **Scope**        | Server-wide (all campaigns)                | Per-campaign (single seat)  |
| **Auth flow**    | Setup PIN → password                       | Invite claim → PIN          |
| **Created when** | First server startup                       | Invite claimed              |
| **Managed by**   | Server operator                            | Server admin (via admin UI) |

**Critical distinction**: Admin never "holds a seat" in campaigns. If admin wants to participate in a campaign as a player or GM, they must create a PlayerAccount and claim an invite like any other player. The admin identity and the player identity are deliberately separated, even when held by the same human.

The player login page and admin login page should share component infrastructure (form, validation, error display) but be visually distinct (different page chrome, different copy) so a user who is both an admin and a player on the same server doesn't end up in the wrong flow.

### Security Considerations

**Setup PIN**:

- One-time use, 24-hour expiry
- Logged to console and file for self-hosted convenience
- For cloud deployments, use `ADMIN_SETUP_PIN` env var to avoid console logging
- PIN file only deleted **after** password is set (not just on PIN validation)
- Rate-limit setup attempts (per IP): 5 attempts / 10 minutes

**Password**:

- scrypt hashing (64-byte derived key with random salt)
- Minimum length: 12 characters (recommended: 16+)
- Rate-limit login attempts (per IP): 5 attempts / 10 minutes
- Rate-limit password changes (per IP): 3 attempts / 10 minutes
- Failed login attempts logged for audit

**Session tokens**:

- Generated using `crypto.randomBytes(32)` (256 bits entropy)
- Hashed with SHA-256 (deterministic) before storage
- No salt needed (session tokens already cryptographically random)
- Stored hash used for lookup: `SELECT * FROM admin_sessions WHERE session_token_hash = SHA256(cookie_value)`

**CSRF protection**:

- CSRF token generated on login/setup: `crypto.randomBytes(32).toString('hex')`
- Stored plaintext in `admin_sessions.csrf_token` column
- Returned to client in login/setup response: `{ success: true, csrfToken: '...' }`
- Client stores in memory (Svelte $state reactive store)
- Client includes in all state-changing requests via `X-CSRF-Token` header
- Server validates: `if (req.headers['x-csrf-token'] !== session.csrfToken) return 403`
- Applied to all POST/PATCH/DELETE admin endpoints

**Rate limiting**:

- In-memory Map tracking attempts by IP address and endpoint
- Key format: `{ip}:{endpoint}` (e.g., `192.168.1.100:/api/admin/setup`)
- Limits per endpoint:
  - `/api/admin/setup`: 5 attempts / 10 minutes
  - `/api/admin/login`: 5 attempts / 10 minutes
  - `/api/admin/change-password`: 3 attempts / 10 minutes
- Returns `429 Too Many Requests` when limit exceeded
- Auto-reset after time window expires

**Localhost-only default**:

- Default `HOST=127.0.0.1` restricts admin UI to localhost
- For tunneled deployments, set `HOST=0.0.0.0` + `ADMIN_ALLOW_REMOTE=true` to allow admin UI from internet
- Recommend HTTPS (via reverse proxy) for any non-localhost admin access

**Session expiry and cleanup**:

- AdminSessions expire after 30 days (planned: 1 hour with sliding window)
- Periodic cleanup job runs every hour: `storage.cleanupExpiredAdminSessions()`
- Cleanup deletes: `WHERE expires_at < NOW() OR revoked_at IS NOT NULL`
- Password change revokes all AdminSessions (force re-login across all devices)

**Cookie security**:

- Cookie secret: `COOKIE_SECRET` env var or auto-generated via `crypto.randomBytes(32)`
- Cookie attributes enforced:
  - `httpOnly: true` - No JavaScript access (XSS protection)
  - `secure: true` - HTTPS only (requires reverse proxy for tunneled deployments)
  - `sameSite: 'strict'` - Strongest CSRF protection (no cross-site cookies)
  - `path: '/'` - Available to all admin routes
- Cookies signed with secret to prevent tampering

### Admin API Routes

All routes require `hearth_admin_session` cookie (except setup/check routes).

**State-changing routes** also require `X-CSRF-Token` header matching session's CSRF token.

#### Authentication Routes

- `POST /api/admin/check-setup` → `{ needsSetup: boolean, setupPinExpired: boolean }`
  - Public, no auth required

- `POST /api/admin/setup` → `{ setupPin, newPassword? }`
  - Public, validates setup PIN
  - **Returns**: `{ success: true, csrfToken: string }`
  - Sets `hearth_admin_session` cookie
  - Rate limited: 5 attempts / 10 minutes per IP

- `GET /api/admin/check-auth` → `{ authenticated: boolean, needsSetup: boolean }`
  - Requires session cookie only

- `POST /api/admin/login` → `{ password }`
  - Validates password against `ServerAdmin.passwordHash`
  - **Returns**: `{ success: true, csrfToken: string }`
  - Sets `hearth_admin_session` cookie
  - Rate limited: 5 attempts / 10 minutes per IP

- `POST /api/admin/logout`
  - **Requires**: Session cookie + `X-CSRF-Token` header
  - Revokes current AdminSession
  - Clears cookie

- `POST /api/admin/change-password` → `{ currentPassword, newPassword }`
  - **Requires**: Session cookie + `X-CSRF-Token` header
  - Updates password, revokes all sessions
  - Rate limited: 3 attempts / 10 minutes per IP

#### Campaign Management Routes (all require auth + CSRF)

- `GET /api/campaigns` → list all campaigns
  - Auth only (no CSRF for read-only)

- `POST /api/campaigns` → create campaign
  - **Requires**: `X-CSRF-Token` header

- `DELETE /api/campaigns/:id` → delete campaign
  - **Requires**: `X-CSRF-Token` header

- `POST /api/campaigns/:id/import` → import campaign
  - **Requires**: `X-CSRF-Token` header

- `GET /api/campaigns/:id/export` → export campaign
  - Auth only (no CSRF for read-only)

#### Seat Management Routes (all require auth + CSRF for mutations)

- `GET /api/campaigns/:id/seats` → list seats
  - Auth only (no CSRF for read-only)

- `POST /api/campaigns/:id/seats` → create seat
  - **Requires**: `X-CSRF-Token` header

- `PATCH /api/seats/:id` → update seat
  - **Requires**: `X-CSRF-Token` header

- `DELETE /api/seats/:id` → delete seat
  - **Requires**: `X-CSRF-Token` header

#### Invite Management Routes (all require auth + CSRF for mutations)

- `GET /api/campaigns/:id/invites` → list invites
  - Auth only (no CSRF for read-only)

- `POST /api/campaigns/:id/invites` → create invite
  - **Requires**: `X-CSRF-Token` header

- `DELETE /api/campaigns/:id/invites/:id` → revoke invite
  - **Requires**: `X-CSRF-Token` header

See [ADR 007](../decisions/007-server-level-admin.md) for complete admin authentication architecture.

---

## Data persistence

These records must be stored via `Storage`:

- invites
- sessions / refresh token records
- active prompts/workflows (for reconnect)
- minimal audit events (optional but recommended)

---

## Implementation notes (non-binding)

- Use a reverse proxy (hosted/tunnel) for TLS termination; keep server proxy-aware (`TRUST_PROXY=true` when behind proxy).
- Avoid secrets in URLs beyond the temporary invite token.
- Prefer server-authoritative join claim response to set cookies and redirect cleanly.
- Reuse the admin auth password-hashing utility (scrypt) for PlayerAccount passwords. Same constant-time comparison, same salt strategy.
- Reuse the admin session-cleanup periodic job for `auth_sessions` cleanup.

---

## Open Issues (deferred for later design)

These are known design problems with the auth model that are explicitly **out of scope for the initial lightweight-accounts implementation**. Documented here so they are not forgotten.

### 1. Cloud-platform account binding

When HearthVTT runs on a managed hosting platform ("HearthVTTHub" or any third-party host), the player-facing account system should not be HearthVTT's per-server username + password. Players expect to use their platform account.

**Constraints:**

- HearthVTT and any specific hosting platform must remain **separate entities** for legal and licensing reasons (AGPL, see [ADR 008](../decisions/008-licensing-and-contributions.md)). There must be no platform-specific code in the HearthVTT codebase.
- Platform identity must bind to HearthVTT seats through a **public, documented API** that any hosting platform could implement, not a special-cased integration.
- Self-hosted deployments must continue to work without any platform involvement.

**Likely shape (TBD):**

- HearthVTT exposes a server-to-server API for "shadow accounts": the platform tells HearthVTT "this seat should be bound to platform-account-id `<opaque>`," and HearthVTT creates a local PlayerAccount that has no password (login is delegated to the platform via signed assertion / OIDC / similar).
- The platform handles all account UX (signup, login, password reset, account settings). HearthVTT's `/account` route is hidden in this mode.
- The HearthVTT login page is replaced by a platform-provided redirect.

This design needs concrete protocol shape, security analysis, and prototype before being locked in.

### 2. Player-facing `/account` route

Self-hosted servers need a player-facing account management page (change password, list seats, log out everywhere). The route exists conceptually but is not designed in detail. Deferred until the lightweight-accounts implementation lands and account management becomes a felt pain point.

For cloud-hosted deployments, `/account` is not exposed — account settings are handled by the platform. The decision of how to route around this (404? redirect to platform settings URL passed via config?) is part of Open Issue #1.

### 3. Two-people-one-account collision

If two players in the same household share a browser profile and both have seats in the same campaign on the same server, they have to log out and log back in to switch identities. This is the standard web-app failure mode and matches user expectations from every other site. No fix planned. Browser profiles or private windows are the workaround.

### 4. Notification kind explicit field

The client UI currently has an implicit split between **ephemeral notifications** (toasts, brief banners — "reconnected to server," "saved") and **blocking notifications** (action prompts, target selection — server-authoritative state requiring user response). This split should be made explicit:

- Server-authoritative blocking notifications correspond 1:1 with server `Prompt` state. They survive reconnect because they are re-fetched from server state.
- UI-only ephemeral notifications are client-local and do not survive reconnect.

The client `notifications` store should have a `kind: 'prompt' | 'ephemeral'` field so the two are never accidentally conflated. Tracked in [todo.md](../todo.md) for the next client refactor.

### 5. Public-game griefing mitigations

For servers running large public games (open invites in a public Discord), additional protections are useful: per-claim admin approval queue, expected-username binding on invites, IP-continuity audit. None are in scope for v1. Default invite flow stays friction-free for small private games (the primary use case). Revisit when a real public-game user reports the need.

---
