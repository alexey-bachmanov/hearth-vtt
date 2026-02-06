# Auth + Join Flow — HearthVTT (`docs/components/auth-join-flow.md`)

This document defines the **join link**, **PIN claim**, **cookie session**, and **WebSocket auth** flow for HearthVTT across hosting modes (hosted, tunnel, direct-IP). It operationalizes ADR-0004.

---

## Goals

- **Low friction**: players join via a link, not mandatory platform accounts.
- **Secure by default** (hosted/tunnel): HTTPS + WSS, HttpOnly cookies, token rotation.
- **No secrets in bookmarks**: join tokens are temporary and not meant to be retained.
- **Server Admin ≠ Campaign GM**: server access control (admin) is separate from campaign gameplay (GM).
- **Admin ≠ Seat**: server admin is a server-level identity, not tied to campaign participation.
- **Single server implementation**: only `PUBLIC_BASE_URL` changes per deployment.

Non-goals (for v1):

- OAuth / social login (platform accounts optional later)
- strong identity verification beyond invite + PIN (this is a game table context)

---

## Terminology

- **Server Admin**: operator of the server instance; manages server-wide operations (not tied to any campaign).
- **Admin** (legacy context): when used in campaign context, refers to admin seat holders (deprecated in favor of server admin model).
- **Seat**: an access identity within a campaign (player seat / GM seat / spectator).
- **Invite**: a capability token that can be claimed to create/attach a seat session.
- **Session**: long-lived access represented by refresh token (cookie), producing short-lived access tokens.
- **AdminSession**: separate authentication for server admin (distinct from seat-based sessions).

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

Entry point from Discord/email.

Behavior:

- Validate invite token existence and expiry.
- If already claimed/revoked: show a friendly “expired link” page and offer to request a new invite.
- If valid: render a lightweight claim page (or serve the SPA and route to claim UI).

**Never** require the user to bookmark this URL.

### `POST /api/auth/claim-invite`

Claim the invite and mint a session.

Inputs:

- `inviteToken` (from URL or body)
- `pin` (user-provided)
- optional device metadata: `deviceName`, `userAgent` (for admin audit UI)

Outputs on success:

- Sets secure cookies (refresh token)
- Returns minimal JSON to boot the client (campaignId, seatId, roles)
- Client redirects (or server responds with 302) to `/play`

### `GET /play`

Stable play URL (bookmarkable). Contains no secrets.

If not authenticated, it should show:

- “Not logged in” + a link to request a new invite (or instructions).

### `POST /api/auth/refresh`

Uses refresh cookie to mint a new access token (or update server-side session state).

- rotates refresh tokens on each use
- invalidates old refresh token

### `POST /api/auth/logout`

Revokes the current session (server-side) and clears cookies.

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

## PIN policy (one-time friction)

Purpose: mitigate link leakage.

- PIN is required during invite claim (configurable per invite).
- Store only `pinHash` (argon2id preferred; bcrypt acceptable).
- Rate-limit failed PIN attempts:
  - per invite token (e.g., 5 attempts / 10 minutes)
  - per IP (e.g., 20 attempts / 10 minutes)
- On too many failures, temporarily lock the invite (cooldown), and log the event for admin.

---

## Session model (cookie + rotation)

### Tokens

- **Refresh token**: long-lived secret stored in HttpOnly cookie; used to mint access token.
- **Access token**: short-lived proof used for API calls and WS auth decision.
  - may be returned as a JSON response and stored in memory (recommended)
  - or set as a short-lived cookie (acceptable, but harder to reason about CSRF)

### Cookies

Set refresh cookie:

- `HttpOnly`
- `Secure` (hosted/tunnel; in direct mode may be false)
- `SameSite=Lax`
- `Path=/`

Name recommendation:

- `hearth_refresh`

Optional cookie:

- `hearth_session` (if you need a stable session id distinct from refresh token)

### Rotation

- Each refresh call issues a **new refresh token** and invalidates the previous token.
- Server stores refresh tokens hashed (like passwords) or stores opaque IDs with a database record.
- Reuse detection:
  - if an old refresh token is presented after rotation, revoke the entire session chain (defensive).

### Revocation

Admin actions:

- revoke a seat’s sessions
- revoke a device/session
- kick active WS connections for a seat

User actions:

- logout revokes current session

---

## WebSocket authentication

### Connection

Client connects to:

- `wss://<origin>/ws` (hosted/tunnel)
- `ws://<origin>/ws` (direct/LAN)

Auth mechanism:

- server reads refresh/access cookie during WS upgrade
- validates session
- maps connection to `{campaignId, seatId, roles}`

Handshake messages (minimum):

- client: `{ type: "hello", protocolVersion, clientVersion? }`
- server: `{ type: "welcome", protocolVersion, serverVersion, seatId, campaignId }`

If not authenticated:

- server closes with an appropriate close code (e.g., 4401-like app code), and client shows “please re-join.”

### Reconnect behavior

On reconnect:

- client sends `{ type: "resume", lastEventSeq }`
- server replies with:
  - event backlog or snapshot + deltas
  - outstanding prompts for that seat

---

## CSRF considerations

Because we use cookies:

- Prefer using refresh cookie only for `/api/auth/refresh` and use access tokens for other APIs.
- For cookie-authenticated POST endpoints, use one of:
  - CSRF tokens
  - SameSite protections (Lax) + ensure no cross-site POST endpoints are sensitive
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
- import/export campaigns
- create seats (across all campaigns)
- delete seats
- create invite (role, expiry, pin required)
- revoke invite
- revoke sessions for a seat
- kick live connections for a seat
- view audit log: claims, failures, revocations

---

## Server Admin Authentication

Server admin authentication is **separate** from seat-based player authentication. Admin has a dedicated auth system with its own cookies, sessions, and UI.

### Goals

- **Self-hosted convenience**: Server operator gets admin access naturally via setup PIN
- **Cloud-hosted security**: Platform can manage admin credentials securely
- **Tunneled deployment support**: Admin UI accessible from internet with strong authentication
- **No seat coupling**: Admin identity is not tied to campaign participation

### Admin Auth Flow: First-Time Setup

**Applies to**: Pure self-hosted and tunneled deployments

1. **Server starts**: On first startup, if no `ServerAdmin` record exists:
   - Generate random 8-character alphanumeric setup PIN (128+ bits entropy)
   - Hash PIN (argon2id/bcrypt) and store in `server_admin` table with `setupPinExpiresAt` = now + 24 hours
   - Write PIN to `DATA_DIR/admin-setup-pin.txt` with instructions
   - Log PIN to console: "Admin setup required. Visit http://localhost:3000/admin/setup and enter PIN: ABC123XY"

2. **Admin visits `/admin/setup`**:
   - Client calls `GET /api/admin/check-setup` → `{ needsSetup: true, setupPinExpired: false }`
   - Render setup form: PIN input + optional password input

3. **Admin submits setup**:
   - Client calls `POST /api/admin/setup` with `{ setupPin, newPassword? }`
   - Server validates PIN hash, checks expiry
   - If valid:
     - Create `AdminSession` record
     - Set `hearth_admin_session` cookie (HttpOnly, Secure, SameSite=Lax)
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
- Cookie attributes: `HttpOnly; Secure; SameSite=Lax; Path=/`
- Expiry: Configurable (default: 7 days)
- Stored in `admin_sessions` table (separate from `auth_sessions`)

**Admin logout**:

- Client calls `POST /api/admin/logout`
- Server revokes `AdminSession` (sets `revokedAt`)
- Clear `hearth_admin_session` cookie
- Client redirects to `/admin/login`

**Password change**:

- Client calls `POST /api/admin/change-password` with `{ currentPassword, newPassword }`
- Server validates `currentPassword` against `ServerAdmin.passwordHash`
- If valid, update `passwordHash`, revoke all `AdminSession` records (force re-login)

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

**Critical distinction**: Admin never "holds a seat" in campaigns. If admin wants to participate in a campaign as a player or GM, they must create a seat and claim an invite like any other player.

### Security Considerations

**Setup PIN**:

- One-time use, 24-hour expiry
- Logged to console and file for self-hosted convenience
- For cloud deployments, use `ADMIN_SETUP_PIN` env var to avoid console logging
- Rate-limit setup attempts (per IP): 5 attempts / 10 minutes

**Password**:

- argon2id or bcrypt hashing
- Minimum length: 12 characters (recommended: 16+)
- Rate-limit login attempts (per IP): 5 attempts / 10 minutes
- Failed login attempts logged for audit

**Localhost-only default**:

- Default `HOST=127.0.0.1` restricts admin UI to localhost
- For tunneled deployments, set `HOST=0.0.0.0` + `ADMIN_ALLOW_REMOTE=true` to allow admin UI from internet
- Recommend HTTPS (via reverse proxy) for any non-localhost admin access

**Session expiry**:

- AdminSessions expire after inactivity (default: 7 days)
- Expired sessions cleaned up periodically
- Password change revokes all AdminSessions (force re-login across all devices)

### Admin API Routes

All routes require `hearth_admin_session` cookie (except setup/check routes):

- `GET /api/admin/check-setup` → `{ needsSetup: boolean, setupPinExpired: boolean }`
- `POST /api/admin/setup` → `{ setupPin, newPassword? }` → creates AdminSession
- `GET /api/admin/check-auth` → `{ authenticated: boolean, needsSetup: boolean }`
- `POST /api/admin/login` → `{ password }` → creates AdminSession
- `POST /api/admin/logout` → revokes current AdminSession
- `POST /api/admin/change-password` → `{ currentPassword, newPassword }` → updates password, revokes all sessions
- `GET /api/campaigns` → list all campaigns (admin-only)
- `POST /api/campaigns` → create campaign (admin-only)
- `DELETE /api/campaigns/:id` → delete campaign (admin-only)
- `POST /api/campaigns/:id/import` → import campaign (admin-only)
- `GET /api/campaigns/:id/export` → export campaign (admin-only)
- `GET /api/campaigns/:id/seats` → list seats for campaign (admin-only)
- `POST /api/campaigns/:id/seats` → create seat (admin-only)
- `DELETE /api/seats/:id` → delete seat (admin-only)
- `GET /api/seats/:id/invites` → list invites for seat (admin-only)
- `POST /api/seats/:id/invites` → create invite (admin-only)
- `DELETE /api/invites/:id` → revoke invite (admin-only)

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

---
