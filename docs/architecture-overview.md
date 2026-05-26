# HearthVTT Architecture Overview

HearthVTT is a **homebrew-first**, **system-agnostic**, **self-hostable** virtual tabletop (VTT) with an optional hosted platform. The core design goals are:

- **Fast map play**: WebGL rendering, minimal main-thread work.
- **Writable compendiums**: first-class homebrew content and portable packs.
- **Portable campaigns**: export/import without lock-in.
- **One server, many deployments**: same server runs locally or in the cloud.
- **Server-served client**: avoid client/server version drift.

This document is the high-level map of how the major pieces fit together.

> **Terminology:** See [shared-types.md](shared-types.md) for canonical definitions of Seat, AuthSession, CampaignState, Snapshot, GameEvent, EventRecord, Action, EngineInput, DispatchResult, SeatView, Capabilities, Ruleset, GameEngine, Tome, and Compendium.

---

## Core principles

### Server is authoritative

The server is the single source of truth for campaign state. Clients may render optimistic UI for their own in-flight gestures (e.g., live token drag preview on the dragging device only), but the server validates and resolves all actions into state changes and broadcasts results.

This authority extends beyond persistent campaign state to all **transient interactive state**: pending Prompts, workflow steps, initiative tracker position, turn indicators, and token positions are all server-owned with explicit status fields. Clients render projections of this state; they do not own it. This makes multi-device and multi-tab usage safe by construction: a Prompt resolved on one device updates server state, which broadcasts to all of the seat's connections, which dismiss the prompt UI uniformly. Action handlers are idempotent against stale references (e.g., responding to an already-resolved Prompt is a no-op, not an error condition).

### Rulesets are data-driven with safe execution

Rulesets define schemas and additional action types layered over the engine's baseline VTT-universal surface. The runtime form for ruleset code (TS module first; sandboxed scripting later) is deferred — see [ADR 011](decisions/011-engine-facade-and-dsl-reversal.md). There is no DSL.

### Manual play is ruleset responsibility

GameEngine does not define built-in actions. All actions (dice rolls, HP adjustments, effect applications) are defined by the loaded Ruleset. Common manual actions should be included in ruleset templates, but deterministic or dice-free games are valid use cases—rulesets are not forced to include dice mechanics.

> This is the canonical statement of this principle. Other documents reference this section.

### “Run anywhere” portability

The same Game Server implementation must run:

- self-hosted on a user machine
- containerized (Docker) for consistent deployment
- in cloud environments without rewriting the server

---

## High-level system diagram

**Game Server (authoritative)**

- Serves the web client bundle (static assets)
- Hosts HTTP API (configuration, login/claim, file import/export)
- Hosts WebSocket Secure (WSS) for realtime state sync
- Validates permissions and resolves actions
- Loads rulesets + tomes + campaign state
- Persists campaign state + assets

**Web Client (browser UI)**

- Connects to the server over HTTPS + WebSocket Secure (WSS)
- Renders map/tokens/fog/lighting in WebGL
- Renders sheets/chat/journal as DOM UI
- Dispatches user intents as actions
- Receives state updates + prompts

**Optional Platform (convenience layer)**

- Account dashboard, hosted server offerings
- Storage for campaigns/tomes/characters (optional)
- Marketplace (future; licensing-dependent)
- Not required to join a server/game

---

## Deployment modes

### Self-host

- User runs server locally (CLI or executable)
- Data stored on local disk
- Players join via invite links
- Optional: user configures tunneling/relay for remote players

### Hosted (SaaS)

- The same server runs in managed infrastructure
- Platform account can provide dashboards and storage
- Joining a game still works via server-issued links (platform account optional)

### Hybrid relay/tunneling (optional)

- Server runs locally; relay helps with NAT traversal
- Relay facilitates connectivity; campaign data remains on the server

---

## Identity and permissions

> **Terminology Note:** A **Seat** is a persistent identity within a campaign. An **AuthSession** is an authenticated client connection (cookie-based). A **ServerAdmin** is the server operator (separate from campaign participation). See [shared-types.md](shared-types.md) for full definitions.

### Roles

HearthVTT distinguishes between **server administration** (managing the server and campaigns) and **campaign participation** (playing in games):

#### Server-Level Role

- **Server Admin**: The server operator. Manages server-wide operations:
  - Campaign creation, deletion, import, export
  - Seat creation and management across all campaigns
  - Invite generation and revocation
  - Server settings and configuration
  - **Not tied to any campaign** — admin is a server-level identity, not a seat
  - Authenticates via separate admin session system (setup PIN → password)
  - Uses separate admin UI at `/admin` (not campaign play UI)

#### Campaign-Level Roles (Seats)

All campaign participants hold **seats** within specific campaigns:

- **Campaign GM**: In-game authority (scenes, fog, actors, encounters). Manages gameplay, not access control.
- **Player**: Controls assigned actor(s), uses allowed actions.
- **Spectator**: View-only access (optional; implementation TBD).

**Important distinction**:

- **Server Admin** manages **which campaigns exist** and **who can join them** (server operations)
- **Campaign GM** manages **what happens in-game** (scenes, encounters, fog — gameplay operations)
- Server admin and campaign GM are **separate roles** that may be held by the same person in self-hosted scenarios
- Admin authenticates separately from campaign participants — admin never "holds a seat" in campaigns

### Authentication Flows

#### Admin Authentication (Server Operations)

**First-time setup**:

1. Server generates random setup PIN on first startup (logged to console + `admin-setup-pin.txt`)
2. Admin visits `/admin/setup`, enters PIN, optionally sets permanent password
3. Server creates `AdminSession`, sets `hearth_admin_session` cookie
4. Admin can now access `/admin` UI and server-wide operations

**Returning admin**:

1. Admin visits `/admin`, server checks for valid `hearth_admin_session` cookie
2. If valid, render admin UI; if invalid, redirect to `/admin/login`
3. Admin enters password, server validates, creates session

Admin sessions are **completely separate** from seat-based sessions (different cookies, different database tables).

#### Player Authentication (Campaign Participation)

**Identity model**: A **PlayerAccount** is a server-local identity (username + password) that may hold multiple **Seats** across multiple campaigns on the same server. One PlayerAccount → N seats; one Seat → exactly one PlayerAccount + one Campaign. Sessions are bound to the PlayerAccount, not the seat. A WebSocket connection is per-seat (the connection URL selects which campaign), and a seat may have multiple simultaneous connections (multi-tab, multi-device, pop-out windows).

**Join flow**:

1. Admin creates **Seats** and generates **Invites** (capability tokens with PIN protection)
2. Players receive invite link: `GET /join/<inviteToken>` (no side effects — safe for Discord previews)
3. Claim requires PIN entry + log into existing PlayerAccount OR create new one in the same request
4. Successful claim binds the seat to the PlayerAccount, creates AuthSession, sets refresh cookie
5. Client redirects to `/play/<campaignId>` (per-campaign bookmarkable URL; `/play` is a campaign picker)
6. WebSocket connections authenticate via cookies (no tokens in URLs); refresh token is stable, access tokens rotate
7. Sessions can be revoked by admin or user logout; admin can reset PlayerAccount passwords

**Portability**: PlayerAccount↔Seat bindings are server-local and are stripped on campaign export. On import to a different server (e.g., self-host → cloud or vice versa), seats arrive unbound and must be re-claimed via fresh invites. The campaign and its seat structure are portable; account identity is not.

A cloud-hosted deployment will eventually replace the per-server PlayerAccount system with platform-managed accounts bound to seats via a public, platform-agnostic API. See Open Issues in [auth-join-flow.md](components/auth-join-flow.md).

See [auth-join-flow.md](components/auth-join-flow.md), [ADR 005](decisions/005-networking-management.md), and [ADR 007](decisions/007-server-level-admin.md) for complete authentication specifications.

### Security Measures

**Admin session security** (implemented 2026-02-06):

- **CSRF protection**: All state-changing admin operations require CSRF token validation via `X-CSRF-Token` header
- **Rate limiting**: Brute-force protection on authentication endpoints (5 attempts/10min for login/setup, 3/10min for password changes)
- **Session token hashing**: 256-bit random tokens hashed with SHA-256 before storage (deterministic lookup)
- **Session cleanup**: Periodic hourly job removes expired/revoked sessions to prevent database accumulation
- **Cookie hardening**: `httpOnly`, `secure: true`, `sameSite: 'strict'` attributes enforced on admin cookies
- **Cookie signing**: Cookies signed with secret to prevent tampering (auto-generated or via `COOKIE_SECRET` env var)

**Player session security** (partial implementation):

- PIN-protected invite claims with rate limiting and expiry
- Cookie-based sessions with HttpOnly, Secure, SameSite=Lax
- Session revocation by admin or user logout
- CSRF protection via SameSite cookies + Origin validation (token-based CSRF not yet implemented for player sessions)

See [ADR 007 Security Implementation](decisions/007-server-level-admin.md#security-implementation-2026-02-06) for detailed security architecture.

---

## Data model and portable file formats

HearthVTT uses portable artifacts to avoid lock-in and enable sharing:

### `.campaign` (portable campaign package)

- A zip-like package under the hood.
- Contains campaign state snapshots (and optionally event logs), assets, and references to attached tomes/rulesets.
- Used for export/import and hosting uploads.

### `.tome` (content pack)

- Data-only compendium: items, monsters, spells, journal entries, tables, etc.
- Homebrew-first; import/exportable and attachable to campaigns.
- References a ruleset for interpretation (e.g., which schema it targets).

### `.ruleset` (ruleset package)

- Defines:
  - entity schemas (PCs, monsters, items, effects)
  - action definitions and permissions
  - additional action types over baseline
  - UI panels contributed back to the play UI (declarative, not arbitrary code)
- May include controlled “scripts” only via a constrained runtime (no arbitrary DOM script).

### `.character` (portable character instance)

- Export/import of a character/actor instance
- Allows players to carry characters between campaigns (when ruleset-compatible)

See: [`docs/components/data-model.md`](components/data-model.md), [`docs/components/ruleset-engine.md`](components/ruleset-engine.md), and [`docs/shared-types.md`](shared-types.md) for canonical type definitions.

---

## Realtime engine: facade, SeatView, and events

### GameEngine is a facade

**GameEngine** is a facade with a narrow public surface and a private interior. Outside code (HTTP routes, WebSocket transport, the client) talks only to the surface; the interior may be reorganized freely. See [components/ruleset-engine.md](components/ruleset-engine.md) and [ADR 011](decisions/011-engine-facade-and-dsl-reversal.md).

Public surface:

- `dispatch(input)` — the single mutation entry point.
- `getView(seatId)` — returns a `SeatView` for first-connect / reconnect / explicit resync.
- `subscribe(seatId, listener)` — per-seat event stream.
- `close()` — lifecycle shutdown.

Inside (private): the ruleset, CampaignState, patches, snapshots, RNG, sequence numbers, authorization. Outside callers see only `SeatView` projections and `GameEvent` streams.

One engine instance per active campaign, managed by `CampaignManager`. State is loaded from Snapshot + event replay on open; final snapshot on close.

### Wire protocol: events, with SeatView for resync

- **Events** are the steady-state server→client stream.
- **SeatView** is returned on first connect, requested again on sequence-number gap, or explicit resync.
- **Patches do not appear on the wire.** They are engine-internal mutation machinery.

Every event carries a per-campaign monotonic `seq`. Clients detect missed events by gap and request `getView`. Tail-checksum schemes were considered and deferred.

### Action pipeline

An **Action** represents user intent (`token.move`, `chat.send`, ruleset-specific types when loaded). The engine validates, resolves, persists, and broadcasts:

- **Rolls** are deterministic; the RNG seed is derived from the action's `actionId = hash(campaignId, seq, actionType, canonicalJSON(payload))`.
- **Prompts** are events with one target seat. Multi-target prompts emit multiple events; an internal workflow correlates the responses.
- **GameEvents** are persisted before they are broadcast.
- **Idempotency**: actions may carry an optional `clientRequestId`; replays return the original result without emitting a second event.

### Pause-and-resume is durable workflow state, not coroutines

Multi-step ruleset behavior across user input is modeled as an **explicit workflow state machine in campaign state**, not as host-language coroutines/promises. This is the durability constraint: a crash mid-workflow leaves the workflow row persisted; on engine reload the workflow resumes from its row. See [ADR 011](decisions/011-engine-facade-and-dsl-reversal.md).

### Baseline engine (no ruleset loaded)

The baseline engine implements only VTT-universal features: scenes, tokens, minimal actors, dice, chat, drawings, measurements, labels, and fog (one shared player-fog mask per scene). TTRPG-mechanical concepts (initiative, HP, attacks, saves, advantage, encounters, sanity, momentum, etc.) are **ruleset** concerns. Rulesets contribute action types, UI panels, and capability rules; they may also hide built-in tool UI without removing the underlying functionality.

See: [`docs/components/ruleset-engine.md`](components/ruleset-engine.md)

---

## Effects system

Effects (modifiers and timed conditions) are **ruleset-level concepts**, not part of the engine's baseline surface. Stacking rules, duration tracking, and modifier composition are deferred until at least one ruleset is being built. The baseline engine provides no effects.

---

## Rendering architecture

### WebGL map renderer

- Map, tokens, fog, and lighting are rendered in WebGL.
- DOM UI handles sheets/chat/journal/toolbars.

### Visibility computation

- The pure geometry function `computeVisibility(...)` lives in `shared/visibility/`, callable from both server (engine) and client (renderer).
- The **engine** owns the authoritative exploration mask and emits `fog.revealed` events.
- The **client renderer** uses the same geometry function for an optimistic lit-area overlay that follows token-drag in real time. The exploration mask is _never_ updated optimistically.
- The baseline uses one shared player-fog mask per scene. Per-seat / multi-source visibility (familiars, parties, hidden-from-allies) is a ruleset concern and deferred.

See: [`docs/components/client.md`](components/client.md)

---

## Server responsibilities

The Game Server must provide:

- Static file hosting of the client bundle
- HTTP API for:
  - health checks
  - campaign/tome import/export
  - seat/invite/session management
- WebSocket Secure (WSS) for realtime updates:
  - action dispatch
  - state delta broadcast
  - prompt delivery
- Persistence:
  - campaign storage (initially local directory + SQLite; scalable later)
  - asset storage (local folder; pluggable object store later)

See: [`docs/components/server.md`](components/server.md)

---

## Repository layout (recommended)

- `server/` — HTTP + WebSocket Secure (WSS) + persistence + serves client bundle
- `client/` — web UI and renderer
- `packages/` — shared libraries (types, protocol, dice, visibility geometry)
- `docs/` — source-of-truth design documents
- `docs/decisions/` — ADRs capturing decisions and rationale
