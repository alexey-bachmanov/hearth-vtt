# 010: Per-Server PlayerAccount Model

## Status

Accepted

## Context

The original authentication design (documented in auth-join-flow.md prior to this ADR) used a **seat-centric session model**: claiming an invite created both a seat record and an AuthSession in a single step. The session was bound directly to the `(seat_id, campaign_id)` pair, not to any persistent user identity.

### Problems with the seat-centric session model

#### 1. No persistent identity across sessions

Clearing cookies, switching devices, or moving to a new browser left a player with no way to log back in independently. They required a new invite link from the GM for every new browser or device — high friction that would be a recurring pain point in normal play.

#### 2. Rotating refresh tokens broke multi-tab usage

The original model called for refresh token rotation on every use (a standard hardening technique). In practice, two open tabs can race each other on `/api/auth/refresh`: the first tab refreshes and invalidates the old token; the second tab arrives milliseconds later with the now-invalidated token and gets a 401. The user session is silently destroyed. With a seat-bound session there is no way to recover without another invite.

#### 3. Cookie clearing required GM intervention

Losing the cookie was a dead end. With no username + password, there was no path to re-authentication. The only recovery was the GM revoking the seat and generating a new invite — a poor experience for a common scenario (browser refresh, incognito session, shared computer).

#### 4. Multi-device play was impossible without re-invite

Players commonly want to use a laptop for the full map and a phone or secondary screen for their character sheet. The seat-bound single-session model cannot support multiple simultaneous connections for the same seat across different devices; a new connection would implicitly invalidate the previous one.

#### 5. Server-authoritative prompts were unsafe in multi-device context

Prompts (action resolution requests) were designed as delivered messages, not stored state. With a single session this works: the prompt arrives and waits. With multiple devices, the prompt may arrive on device A while the player is looking at device B, and there is no mechanism to deliver or clear it reliably. The "resolve a prompt on one device, but the other device still shows it" race could cause double-submissions or stuck UI.

#### 6. Import/export had no clean identity story

The previous model bound sessions to seats, and seats were the portable identity within a campaign. Importing a campaign to a new server would silently invalidate all sessions in ways that were undefined. There was no clear statement of what was server-local vs. portable.

---

## Decision

Replace the seat-centric session model with a **PlayerAccount** model. Full specification is in [`docs/components/auth-join-flow.md`](../components/auth-join-flow.md).

### Core changes

#### 1. PlayerAccount entity

A `PlayerAccount` is a server-local identity: username + bcrypt/scrypt password, no email, no recovery questions. A `player_accounts` table is added to `hearth.db`. Passwords are hashed using the same scrypt utility already used for admin passwords.

- Usernames: case-insensitive unique per server, ASCII alphanumeric + `_-.`, 2–32 chars.
- Passwords: minimum 8 characters; rate-limited by IP (not by account, to prevent account enumeration + DoS).
- Admin resets player passwords; there is no self-service email recovery (this is a game table context).

#### 2. AuthSession bound to PlayerAccount, not Seat

`auth_sessions.seat_id` is replaced by `auth_sessions.account_id`. One PlayerAccount may hold N seats across N campaigns; the session is portable across all of them without re-authentication.

The WebSocket connection URL (`wss://<origin>/ws?campaignId=<id>`) selects which seat to use for a given connection.

#### 3. Claim flow updated: login or register at claim time

`POST /api/auth/claim-invite` gains a `mode: 'login' | 'register'` field:

- `register`: creates a new PlayerAccount and binds the seat to it.
- `login`: authenticates an existing PlayerAccount and binds the seat to it (for players who already have an account on this server).

A standalone `POST /api/auth/login` is also added for subsequent logins without an invite.

#### 4. Stable refresh token (no rotation on use)

The refresh token does **not** rotate on every `/api/auth/refresh` call. It has a fixed 30-day lifetime. Access tokens remain short-lived (15 min) and rotate normally.

**Rationale**: Multi-tab and multi-device usage make rotation unsafe without a token family mechanism. The threat model for HearthVTT (a game table application with short-lived campaigns) does not require the additional complexity. Revoked-token reuse detection is retained (a revoked token being presented triggers session revocation, not silent failure).

#### 5. Multiple simultaneous WebSocket connections per seat

The server maintains a `Set<WebSocket>` per `(accountId, seatId)` instead of a 1:1 connection. All state changes are broadcast to all connections in the set. This directly enables multi-tab map + sheet layouts and multi-device play.

#### 6. Server-authoritative prompt state

Prompts are stored as server-owned state with `status: 'pending' | 'resolved' | 'cancelled'`. They are not delivered as one-shot messages. When a prompt is resolved or cancelled, the server updates its status and broadcasts the change to all of the seat's connections. The UI on all devices reacts to the status change. Action handlers are idempotent against stale references: submitting a response to an already-resolved prompt is a no-op.

#### 7. Optimistic UI scoped to originating connection

Optimistic UI gestures (e.g., live token drag preview) are applied only to the originating WebSocket connection. They are not broadcast to the account's other connections. Other devices see only server-confirmed state.

#### 8. Identity portability contract

PlayerAccount↔Seat bindings are **server-local**. Campaign export strips all account bindings from seats. On import to a new server, seats arrive unbound and must be re-claimed via fresh invites. The campaign and its seat roster are portable; the identity that held those seats is not.

#### 9. Admin password reset via filesystem flag

`DATA_DIR/admin-reset.flag` triggers a re-run of the initial setup ceremony on next server startup, allowing recovery from admin lockout without console access to the database. Mirrors the existing setup-PIN pattern.

---

## Alternatives considered

### Keep seat-bound sessions, add re-invite as recovery

This avoids introducing a new identity concept but doesn't address multi-device, multi-tab, or cookie-clearing friction. The GM becomes a gatekeeper for every device change — unacceptable as a recurring pattern.

### Use OAuth / social login as the identity layer

This would eliminate per-server password management but creates a dependency on external identity providers and breaks the self-hostable, offline-capable design goal. Deferred as an optional layer for hosted deployments (see Open Issues in auth-join-flow.md).

### Rotate refresh tokens with a token family mechanism

Token family rotation (RFC 6749 §10.4 spirit) is a robust defence against refresh token theft. However, implementing it correctly is non-trivial and the threat model for a self-hosted game application is much lower than the applications where this matters. The multi-tab race condition it would introduce is a certain UX problem; the theft scenario it mitigates is a speculative one. Stable refresh + short-lived access tokens is the right balance here.

### Platform-managed accounts for cloud deployments

A future cloud deployment of HearthVTT will want to offer platform-managed accounts (one login for all campaigns across all hosted servers). This will be implemented as a public API that a cloud platform can call to bind a seat to a platform identity. HearthVTT itself remains agnostic — the platform uses the same claim flow with a server-side binding step. This is tracked as an open issue in auth-join-flow.md and does not affect this ADR.

---

## Consequences

- Adds `player_accounts` table and `account_id` FK on `seats` to `hearth.db`.
- `auth_sessions.seat_id` → `auth_sessions.account_id` (requires schema migration or fresh init).
- Claim flow UI gains username/password fields and login/register mode.
- New `POST /api/auth/login` route.
- `/play` becomes a campaign picker; `/play/<campaignId>` is the per-campaign bookmarkable URL.
- WS connection handling is refactored from 1:1 to `Set<WebSocket>` per `(accountId, seatId)`.
- Prompt storage model changes from message delivery to server-owned state with status.
- All tracked in [`docs/todo.md`](../todo.md) under "Auth & Sessions" tech debt.
