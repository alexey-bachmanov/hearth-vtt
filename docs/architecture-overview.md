# HearthVTT Architecture Overview

HearthVTT is a **homebrew-first**, **system-agnostic**, **self-hostable** virtual tabletop (VTT) with an optional hosted platform. The core design goals are:

- **Fast map play**: WebGL rendering, minimal main-thread work.
- **Writable compendiums**: first-class homebrew content and portable packs.
- **Portable campaigns**: export/import without lock-in.
- **One server, many deployments**: same server runs locally or in the cloud.
- **Server-served client**: avoid client/server version drift.

This document is the high-level map of how the major pieces fit together.

> **Terminology:** See [shared-types.md](shared-types.md) for canonical definitions of Seat, Session, CampaignState, Snapshot, GameEvent, EventRecord, Action, Ruleset, GameEngine, Resolver, Tome, and Compendium.

---

## Core principles

### Server is authoritative

The server is the single source of truth for campaign state. Clients may do optimistic UI, but the server validates and resolves actions into state changes and broadcasts results.

### Rulesets are data-driven with safe execution

Rulesets define schemas, actions, UI templates, and resolver logic using a constrained DSL over engine primitives. No arbitrary script execution in the UI.

### Manual play is ruleset responsibility

The GameEngine does not define built-in actions. All actions (dice rolls, HP adjustments, effect applications) are defined by the loaded Ruleset. Common manual actions should be included in ruleset templates, but deterministic or dice-free games are valid use cases—rulesets are not forced to include dice mechanics.

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
- Hosts WebSocket for realtime state sync
- Validates permissions and resolves actions
- Loads rulesets + tomes + campaign state
- Persists campaign state + assets

**Web Client (browser UI)**

- Connects to the server over HTTPS + WebSocket
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

> **Terminology Note:** A **Seat** is a persistent slot in a campaign linked to one person; a **Session** is an ephemeral server run (startup to shutdown). See [shared-types.md](shared-types.md) for full definitions.

### Roles

- **Server Admin**: server-level management (updates, backups, campaign import/export, seat management).
- **Campaign GM**: in-game authority (scenes, fog, actors, compendiums).
- **Player**: controls assigned actor(s), uses allowed actions.
- (Optional) **Spectator/Assistant GM**: constrained views/permissions.
- In practice, server admin and campaign gm will often be the same person, but it's important to separate those roles.

### Self-host baseline auth: invite-link bootstrap

- GM/Admin creates “seats” in a campaign.
- Server generates **opaque invite secrets**.
- A link is **claimed** into a revocable session (short-lived access + refresh cookie).
- GM can revoke/rotate invites and revoke active sessions.

Platform identity (OAuth/passkey/email) may exist later for hosted convenience, but **server membership remains authoritative** for joining/permissions.

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
  - resolver logic (DSL over primitives)
  - UI templates + bindings (safe component tree)
- May include controlled “scripts” only via a constrained runtime (no arbitrary DOM script).

### `.character` (portable character instance)

- Export/import of a character/actor instance
- Allows players to carry characters between campaigns (when ruleset-compatible)

See: [`docs/components/data-model.md`](components/data-model.md), [`docs/components/ruleset-engine.md`](components/ruleset-engine.md), and [`docs/shared-types.md`](shared-types.md) for canonical type definitions.

---

## Realtime engine: actions, resolution, and events

### Action pipeline

An **Action** represents user intent (roll, attack, cast, move, apply effect). The server resolves actions into:

- **Rolls** (deterministic via server-side rolling; clients may request/trigger)
- **Prompts** (UI requests to specific seats)
- **GameEvents** (immutable record of what happened; see [shared-types.md](shared-types.md))
- **State patches** (validated updates to campaign state)

### Why events + patches

- Easy auditing / logs
- Potential undo/redo later
- Deterministic replay of session state
- Efficient realtime sync (send deltas)

Rulesets govern which actions exist and how they resolve; the engine provides the primitive operations.

See: [`docs/components/ruleset-engine.md`](components/ruleset-engine.md)

---

## Effects system

Effects are first-class constructs to represent modifiers and timed conditions:

- bonuses/penalties to derived values
- advantage/disadvantage-like flags (system-specific)
- resistances/vulnerabilities
- duration rules (turn-based, time-based, “save ends”, etc.)
- stacking rules (replace/stack/highest-only)

Effects reduce the need for bespoke action logic and enable future automation.

---

## Rendering architecture

### WebGL map renderer

- Map, tokens, fog, and lighting are rendered in WebGL.
- DOM UI handles sheets/chat/journal/toolbars.

### Visibility computation

- **CPU computes visibility polygons** (typically in a Worker to avoid main-thread stalls).
- **GPU composites visibility masks** for fog-of-war and lighting.
- Per-user visibility masks are maintained, supporting union of multiple vision sources.

Visibility computation should be abstracted behind a stable interface (e.g., `updateVisibility()`), so future implementations (e.g., different algorithms) do not require API breaks.

See: [`docs/components/client.md`](components/client.md)

---

## Server responsibilities

The Game Server must provide:

- Static file hosting of the client bundle
- HTTP API for:
  - health checks
  - campaign/tome import/export
  - seat/invite/session management
- WebSocket for realtime updates:
  - action dispatch
  - state delta broadcast
  - prompt delivery
- Persistence:
  - campaign storage (initially local directory + SQLite; scalable later)
  - asset storage (local folder; pluggable object store later)

See: [`docs/components/server.md`](components/server.md)

---

## Repository layout (recommended)

- `server/` — HTTP + WebSocket + persistence + serves client bundle
- `client/` — web UI and renderer
- `packages/` — shared libraries (types, protocol, dice, ruleset DSL runtime)
- `docs/` — source-of-truth design documents
- `docs/decisions/` — ADRs capturing decisions and rationale
