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

### `GET /`

Splash page. Entry point for the SPA.

Behavior:

- Renders three buttons: **Play** → `/play`, **Account** → `/play/account`, **Admin** → `/admin`.
- No auto-redirect, even if a session cookie is present. The user always sees the splash and actively picks a destination.
- Does **not** call `GET /api/auth/me` on load.

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
- Atomically consumes the invite (guards against concurrent claims — see `INVITE_RACE_LOST` below).
- Binds `seats.accountId = <claiming account>`.
- Creates an AuthSession bound to the PlayerAccount.
- Sets the refresh cookie.
- Returns `ClaimInviteResponse`: `{ accountId, campaignId, seatId, role, csrfToken }`. Client stores `csrfToken` in memory.
- Client redirects to `/play/<campaignId>`.

Error codes:

- `400 INVALID_REQUEST` — missing or invalid fields.
- `401 INVALID_PIN` — wrong PIN.
- `401 INVALID_CREDENTIALS` — wrong password (login mode).
- `404 INVITE_NOT_FOUND` — invite token unknown.
- `409 USERNAME_TAKEN` — username collision (register mode).
- `409 SEAT_ALREADY_BOUND` — seat bound to a different account.
- `410 INVITE_REVOKED` — invite was revoked.
- `410 INVITE_RACE_LOST` — invite was valid but consumed by a concurrent claim (race condition); player should ask the GM for a new invite.
- `429 RATE_LIMITED` — too many login attempts.

If the user is already logged in to a different account in the same browser, the claim page still shows the login/register choice — it does **not** auto-bind to the current cookie. (Households sharing a browser need this.)

### `GET /play`

Campaign picker. Stable bookmarkable URL. Contains no secrets.

Behavior:

- Not authenticated → redirect to `/play/login?returnTo=/play`.
- Authenticated → render campaign picker listing every campaign the account holds a seat in.

### `GET /play/login`

Player login page. Accepts `?returnTo=<same-origin-path>`.

Behavior:

- Already authenticated → redirect to `returnTo` (or `/play` if absent or invalid).
- Renders username + password form. On success, creates an AuthSession, sets the refresh cookie, and redirects to `returnTo`.
- **`returnTo` validation**: accepted values must be a same-origin pathname only (see [returnTo contract](#returnto-contract)).
- "I forgot my password" → "Ask your admin" modal (no server-side recovery flow in self-hosted mode).

### `GET /play/account`

Account settings placeholder. Requires authentication.

Behavior:

- Not authenticated → redirect to `/play/login?returnTo=/play/account`.
- Authenticated → renders username, "Settings coming soon", Logout button, and a link back to `/play`.
- Full account management UI (password change, active sessions list, etc.) is deferred; see [Open Issues](#open-issues-deferred-for-later-design).

### `GET /play/<campaignId>`

Per-campaign play URL. Bookmarkable. Contains no secrets.

Behavior:

- Not authenticated → redirect to `/play/login?returnTo=/play/<campaignId>`.
- Authenticated but no seat in this campaign → redirect to `/play` (no-access friendly error page is deferred; see [Open Issues](#open-issues-deferred-for-later-design)).
- Authenticated with a seat → load the play UI for that campaign.

### `returnTo` contract

The `returnTo` query-string parameter carries a post-login redirect target. It is only consumed on `/play/login`.

Validation rules (enforced in `validateReturnTo()` in `client/src/app/routes.ts`):

- Must start with `/` (absolute same-origin pathname).
- Must **not** start with `//` (rejects protocol-relative URLs).
- Must **not** contain `://` (rejects `http://`, `javascript:`, etc.).
- Must **not** contain `@` (rejects `user@host` authority variants).
- Any value failing validation is silently dropped; the client falls back to `/play`.

The client only ever inserts `returnTo` from known-safe values (the current `window.location.pathname` captured inside the auth guard). It is never constructed from untrusted user input.

---

### `POST /api/auth/login`

Log into an existing PlayerAccount.

Inputs: `{ username, password }`.

On success: creates AuthSession, sets refresh cookie, returns `LoginResponse` (extends `MeResponse`): `{ accountId, username, seats, mustChangePassword, csrfToken }`. Client stores `csrfToken` in memory.

Rate-limited per IP (see PIN/password policy).

### `GET /api/auth/me`

Returns the `MeResponse` for the currently authenticated player.

- Reads the `hearth_refresh` cookie to resolve the session.
- Returns `{ accountId, username, seats, mustChangePassword }`.
- When `mustChangePassword` is `true` the client (PlayLayout) shows a blocking forced-change modal that cannot be dismissed; the player must submit a new password via `POST /api/auth/change-password` before gameplay is accessible.
- 401 when not authenticated, session expired, or revoked.

### `POST /api/auth/refresh`

Uses the `hearth_refresh` cookie to mint a new short-lived access token.

- **Refresh token is stable across normal use** (does not rotate on every refresh). This intentionally diverges from strict OAuth BCP to support multi-tab and multi-device usage, which are the norm for a VTT.
- **Reuse detection still applies to revoked tokens**: presenting a refresh token whose session has been revoked (by logout, admin kick, or password change) returns 401.
- Returns `{ csrfToken }`. Client stores it in memory (replaces any previously stored value).
- Refresh tokens have a finite max lifetime (default 30 days, configurable) after which the user must log in again.

### `POST /api/auth/logout`

Revokes the current AuthSession (server-side) and clears the refresh cookie. Other devices remain logged in.

Requires `X-CSRF-Token` header (CSRF synchronizer pattern — see [CSRF considerations](#csrf-considerations)).

### `POST /api/auth/logout-all`

Revokes **all** active AuthSessions for the account ("log out everywhere") and clears the refresh cookie. The current session is also revoked; the client redirects to login.

Requires `X-CSRF-Token` header.

### `POST /api/auth/change-password`

Changes the current player's password. On success:

- Clears the `mustChangePassword` flag.
- Returns the updated `MeResponse` (200) so the client can refresh state without a separate `/me` call.
- **Does not** revoke existing sessions (password change by the account owner is not treated as a security reset — sessions remain valid).

Inputs: `{ currentPassword, newPassword }`. `newPassword` minimum 8 characters, maximum 256.

Requires `X-CSRF-Token` header.

400 on validation failure; 401 on wrong current password; 403 on CSRF failure.

### `POST /api/auth/forgot-password` (player; admin-mediated)

For self-hosted: returns a generic "contact your admin" response. The actual reset is performed by the admin via `POST /api/admin/accounts/:id/reset-password`, which sets a temporary password the player must change on first login (`mustChangePassword = true`).

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

`GET /play/account` is implemented as a **placeholder** that shows the username and a Logout button. The full account management surface is deferred (see [Open Issues](#open-issues-deferred-for-later-design)).

Eventual surface (when implemented):

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

- **Refresh token**: long-lived secret bound to the PlayerAccount, stored in the `hearth_refresh` HttpOnly cookie. Default lifetime 30 days on HTTPS, session-only on HTTP (see Cookies below). Used for `/api/auth/refresh` and WS upgrade.
- **CSRF token**: 32-byte random hex value stored in the session row, returned in the response body of login / claim-invite / refresh. Client stores it in memory (`authState.csrfToken`) and sends it via the `X-CSRF-Token` header on all state-changing requests (logout, logout-all, change-password). Not stored in a cookie (an HttpOnly cookie for CSRF provides no protection — attacker-controlled pages can trigger cookies automatically).
  The refresh token is **stable** — it does not rotate on every successful refresh. This is a deliberate departure from strict OAuth BCP, motivated by:

- **Multi-tab safety.** Rotating refresh tokens on every use plus reuse detection produces false-positive session revocations any time two tabs refresh near-simultaneously. Multi-tab is the norm for a VTT (map + character sheet pop-out).
- **Multi-device safety.** Same problem at device scope (phone + laptop both refreshing).
- **Acceptable threat model.** A VTT session is not a bank. The cost of a stolen refresh token is bounded (max 30 days, scoped to one server, no payment data).

Reuse detection still applies to **revoked** refresh tokens: presenting a refresh token whose session was revoked (logout, admin kick, password change) revokes the entire session chain and forces re-login on that device.

### Cookies

Refresh cookie:

- `HttpOnly` — always
- `Secure` — set when HTTPS is detected (directly or via a trusted reverse proxy); absent on HTTP
- `SameSite=Lax` (player sessions; admin sessions use `Strict`)
- `Path=/`
- `maxAge` — on HTTPS: default 30 days, admin-configurable via the `refresh_cookie_max_days` server setting (0–30; 0 = session-only even on HTTPS). On HTTP (dev without proxy): no `maxAge` — session-only cookie, discarded when the browser closes.

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

- `wss://<origin>/ws?campaign=<campaignId>` (hosted/tunnel)
- `ws://<origin>/ws?campaign=<campaignId>` (direct/LAN)

The `campaign` query parameter selects which campaign (and thus which seat) to connect to. One account may hold seats in multiple campaigns; the connection is per-seat.

Auth mechanism:

- Server reads the `hearth_refresh` cookie during WS upgrade.
- Missing `campaign` parameter → close with 4400.
- Invalid/expired/revoked session OR no active seat bound in the requested campaign → close with 4401.
- If valid → maps the connection to `{accountId, campaignId, seatId, seatRole}` and registers it in the campaign engine's seat connection set.

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

- **4400**: missing `?campaign=` query parameter.
- **4401**: auth failure — covers all of: no cookie, session not found, session revoked/expired, and no active seat bound in the requested campaign. (The server currently collapses these into a single 4401; distinguishing "no seat" from "no session" is a future refinement.)
- **4403**: seat revoked after connection was established (planned; not yet sent by the server). The client handles it by navigating to the campaign picker.

On receiving 4401: client attempts one silent `POST /api/auth/refresh`; on success stores the new `csrfToken` and reconnects; on failure redirects to `/play/login`.

### Reconnect behavior

On reconnect:

- Client sends `{ type: "resume", lastEventSeq }`.
- Server replies with:
  - event backlog since `lastEventSeq` (or full snapshot if too stale)
  - the current set of pending prompts for that seat (derived from server state, not replayed from a delivery log)
  - the current set of active workflows for that seat

---

## CSRF considerations

HearthVTT uses the **synchronizer-token pattern** for both admin and player state-changing routes:

1. Server mints a random CSRF token on session creation and stores it in the session row.
2. Token is returned in the response body (NOT as a cookie) from `POST /api/auth/login`, `POST /api/auth/claim-invite`, and `POST /api/auth/refresh`.
3. Client stores it in memory (`authState.csrfToken`).
4. Client sends it as `X-CSRF-Token` header on all state-changing requests.
5. Server validates the header value against the stored token using a constant-time comparison.

Player routes that require `X-CSRF-Token`: `POST /api/auth/logout`, `POST /api/auth/logout-all`, `POST /api/auth/change-password`.

Admin routes that require `X-CSRF-Token`: all POST/PATCH/DELETE admin endpoints.

The `SameSite=Lax` cookie attribute on player sessions provides a baseline defence for any future endpoint not covered by the token check. Admin sessions use `SameSite=Strict`.

Hosted mode additionally validates the `Origin` header on WS upgrades.

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

#### Development mode

Recovery is performed via a **dev-only script** bundled in the repository:

```bash
npm run dev:reset-setup
```

This runs `scripts/reset-admin-setup.ts`, which:

1. Deletes all `admin_sessions` rows.
2. Deletes the `server_admin` row.
3. Removes `DATA_DIR/admin-setup-pin.txt` if present.

On next server startup, first-time setup re-triggers automatically: a new setup PIN is generated, written to `admin-setup-pin.txt`, and logged to console. The admin visits `/admin/setup` and completes setup as if it were a fresh install. **Campaigns, seats, and player accounts are untouched.**

The script is hard-gated: it throws immediately when `NODE_ENV=production`.

#### Production self-hosted and cloud deployments (installer / Docker / SEA build)

The repository `reset-admin-setup.ts` script is not shipped in production builds. Recovery uses a **filesystem-flag HTTP endpoint**:

1. Admin visits `/admin/login` and clicks **"Forgot password?"** → navigates to `/admin/recovery`.
2. The recovery page shows generic instructions:
   > Create an empty file named `admin-reset.flag` in your HearthVTT data directory, then click "Check again". See [the self-hosting docs] for where your data directory is per deployment type.
3. Admin creates the flag file (or an install wizard does it automatically — planned feature), then clicks **"Check again"**.
4. Browser calls `POST /api/admin/reset`.
5. Server checks `${DATA_DIR}/admin-reset.flag`:
   - **Flag absent** → 404. Page re-displays instructions.
   - **Flag present but delete fails** → 500. DB is not touched. Page shows an error.
   - **Flag deleted** → null `server_admin` row, revoke all admin sessions, regenerate setup PIN → write `admin-setup-pin.txt` + log to console → return `{ setupPin }`.
6. On 200: client navigates to `/admin/setup`, where the new PIN flow completes.

**Security properties of this flow:**

- Requires _two_ capabilities: network reach to `POST /api/admin/reset` (subject to existing `ADMIN_ALLOW_REMOTE` / localhost rules) **and** filesystem write to `DATA_DIR`. Collapsing to one would require an additional exploit beyond network access.
- Flag is deleted _before_ any DB mutation. If deletion fails, nothing is changed.
- Rate-limited (5 requests / hour per IP).
- No data is deleted. Campaigns, seats, and player accounts are untouched. Admin re-completes setup as on first install.

#### Cloud deployments

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
- If valid: update `passwordHash`, revoke all `AdminSession` records, return **204 (no body)**
- Client must re-login after change; the 204 is the signal to clear local session state and redirect to `/admin/login`
- (A new session token is not returned inline — the clean security story is "password change proves identity from scratch".)

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
| **Cookie**       | `hearth_admin_session`                     | `hearth_refresh`            |
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
  - **Returns**: 204 (no body) — client must re-login
  - Rate limited: 3 attempts / 10 minutes per IP

- `POST /api/admin/reset` (no auth, no CSRF)
  - Public; subject to `ADMIN_ALLOW_REMOTE` / localhost-only rules
  - Rate limited: 5 attempts / hour per IP
  - Checks for `${DATA_DIR}/admin-reset.flag`
  - **404** if flag absent; **500** if flag cannot be deleted (DB untouched); **200 `{ setupPin }`** on success

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

The `POST /api/auth/change-password` and `POST /api/auth/logout-all` server routes are implemented. The `mustChangePassword` forced-change modal on `PlayLayout` is also implemented.

What remains deferred is the full self-service `/play/account` UI surface: a page listing active seats across campaigns, a voluntary password-change form, and a "log out everywhere" button. The route renders a placeholder (username + Logout button) until this UI is built.

For cloud-hosted deployments, `/account` is not exposed — account settings are handled by the platform. The decision of how to route around this (404? redirect to platform settings URL passed via config?) is part of Open Issue #1.

### 3. Two-people-one-account collision

If two players in the same household share a browser profile and both have seats in the same campaign on the same server, they have to log out and log back in to switch identities. This is the standard web-app failure mode and matches user expectations from every other site. No fix planned. Browser profiles or private windows are the workaround.

### 4. Notification kind explicit field (resolved)

> **Resolved:** The notification 2×2 model described here was implemented in [Phase 2.5](../../todo.md#notifications). See [`shared/src/notification.ts`](../../shared/src/notification.ts) for the shared types and [`client/src/state/notifications.svelte.ts`](../../client/src/state/notifications.svelte.ts) for the client store.

The client notification store now uses the explicit 2×2 model:

- **`origin: 'server' | 'client'`** — Server-originated notifications reflect server-owned state and survive reconnect. Client-originated notifications are local and do not survive reconnect.
- **`lifetime: 'persistent' | 'ephemeral'`** — Persistent notifications require explicit dismissal. Ephemeral notifications auto-dismiss after a timeout.

Server-authoritative blocking notifications (prompts) correspond 1:1 with server `Prompt` state. The client stores only a `promptId` reference in the notification store; the full `Prompt` data lives in `CampaignState.activePrompts`, populated from `SeatView.activePrompts` on connect/resync and updated incrementally via `prompt.created` / `prompt.resolved` / `prompt.cancelled` events.

### 5. Public-game griefing mitigations

For servers running large public games (open invites in a public Discord), additional protections are useful: per-claim admin approval queue, expected-username binding on invites, IP-continuity audit. None are in scope for v1. Default invite flow stays friction-free for small private games (the primary use case). Revisit when a real public-game user reports the need.

---
