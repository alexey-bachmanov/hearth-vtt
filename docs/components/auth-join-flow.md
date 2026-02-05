# Auth + Join Flow — HearthVTT (`docs/components/auth-join-flow.md`)

This document defines the **join link**, **PIN claim**, **cookie session**, and **WebSocket auth** flow for HearthVTT across hosting modes (hosted, tunnel, direct-IP). It operationalizes ADR-0004.

---

## Goals

- **Low friction**: players join via a link, not mandatory platform accounts.
- **Secure by default** (hosted/tunnel): HTTPS + WSS, HttpOnly cookies, token rotation.
- **No secrets in bookmarks**: join tokens are temporary and not meant to be retained.
- **Admin ≠ GM**: server access control is an admin responsibility.
- **Single server implementation**: only `PUBLIC_BASE_URL` changes per deployment.

Non-goals (for v1):

- OAuth / social login (platform accounts optional later)
- strong identity verification beyond invite + PIN (this is a game table context)

---

## Terminology

- **Admin**: operator of a given server instance; manages access and hosting.
- **Seat**: an access identity within a campaign (player seat / GM seat / spectator).
- **Invite**: a capability token that can be claimed to create/attach a seat session.
- **Session**: long-lived access represented by refresh token (cookie), producing short-lived access tokens.

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

Admin must be able to:

- create invite (role, expiry, pin required)
- revoke invite
- rotate invite
- revoke sessions for a seat
- kick live connections for a seat
- view audit log: claims, failures, revocations

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
