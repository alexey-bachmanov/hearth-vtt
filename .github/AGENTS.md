# AGENTS.md — HearthVTT Agent Guide

This file is the **entry point** for coding agents working in this repository.  
Read this first, then follow the linked design docs before making changes.

---

## Project goal

Build a **system-agnostic virtual tabletop (VTT)** that is:

- **Fast** (map rendering in WebGL; minimal main-thread work)
- **Homebrew-first** (writable compendium packs, portable data)
- **Self-hostable** (server runs on a user machine) _and_ optionally **hostable** (same server image in the cloud)
- **Server-served client** (the server always serves a compatible web UI to avoid client/server version drift)

---

## Architecture boundary rules (must-follow)

HearthVTT is designed as a set of **layers** with strict dependency direction. Agents must preserve these boundaries to keep the codebase modular and non-brittle.

### Golden rule: dependencies point inward

Higher-level delivery layers (UI, HTTP, WS) may depend on application/domain layers, but **core logic must never depend on frameworks or IO details**.

If you need to cross a boundary, add an interface/adapter rather than importing across layers.

---

## Repo-level boundaries

### Server (`/server`)

**Goal:** Fastify + WebSocket are delivery mechanisms only; business logic is framework-agnostic.

**Allowed imports**

- `server/src/routes/**` and `server/src/ws/**`
  - may import: `server/src/services/**`, `packages/shared/**`, `server/src/auth/**` (interfaces), `server/src/config/**`
  - may NOT import: `server/src/storage/sqlite/**` directly (must go through interfaces/services)

- `server/src/services/**`
  - may import: `server/src/domain/**`, `server/src/storage/**` (interfaces), `packages/shared/**`, `server/src/util/**`
  - may NOT import: `fastify`, websocket libs, sqlite driver libs, filesystem libs

- `server/src/domain/**`
  - may import: other `domain/**`, `packages/shared/**` (pure types only)
  - may NOT import: `services/**`, `routes/**`, `ws/**`, `storage/**`, any framework/IO libraries

- `server/src/storage/**`
  - `server/src/storage/index.ts` defines interfaces (storage, repositories, etc.)
  - `server/src/storage/sqlite/**` implements those interfaces and may import sqlite libs
  - may import: `server/src/domain/**` (types), `packages/shared/**` (types), `server/src/util/**`
  - may NOT import: `routes/**`, `ws/**`

- `server/src/util/**`
  - must be pure and side-effect free unless clearly labeled (e.g., `util/io/**`)
  - do not put business logic here

**Hard rule:** Fastify/WebSocket types must not leak into `services/` or `domain/`.

---

### Client (`/client`)

**Goal:** UI framework (Svelte) is a presentation layer; rendering and game logic are separated.

**Allowed imports**

- `client/src/ui/**` (Svelte components, UI composition)
  - may import: `client/src/app/**`, `client/src/state/**`, `client/src/api/**`, `client/src/render/**` (public surface), `packages/shared/**`
  - may NOT import: low-level WebGL engine internals directly unless through `render/` public API

- `client/src/app/**` (application orchestration)
  - may import: `client/src/state/**`, `client/src/api/**`, `client/src/domain/**`, `client/src/render/**`, `packages/shared/**`, `client/src/util/**`
  - may NOT import: Svelte component files except via UI entry points

- `client/src/render/**` (WebGL renderer + scene management)
  - may import: `client/src/domain/**`, `packages/shared/**`, `client/src/util/**`
  - may NOT import: Svelte, UI components
  - renderer must expose a small stable API (e.g., `initRenderer`, `setScene`, `updateTokens`, `updateVisibilityMasks`)

- `client/src/state/**` (stores/state containers)
  - may import: `packages/shared/**`, `client/src/domain/**`, `client/src/util/**`
  - may NOT import: UI components, WebGL internals

- `client/src/api/**` (HTTP/WS client)
  - may import: `packages/shared/**`, `client/src/state/**` (interfaces only), `client/src/util/**`
  - may NOT import: UI components, renderer internals

- `client/src/domain/**` (pure client-side domain helpers)
  - must be framework-agnostic and side-effect free

**Hard rule:** Svelte components must not contain business rules or protocol logic; they dispatch actions and render state.

---

### Shared packages (`/packages`)

**Goal:** shared code must be portable across server and client.

- `packages/shared/**`
  - contains: protocol message types, schemas, ids, dice parser, small pure utilities
  - may NOT import: node-only libs, browser-only libs, Fastify, Svelte, filesystem, sqlite drivers

If a shared utility needs environment-specific behavior, define an interface in shared and implement adapters in server/client.

---

### Rulesets and content (`/rulesets`, `/tomes` or similar)

**Goal:** ruleset definitions are portable and validated; runtime execution is constrained.

- Ruleset packages should be treated as **data + constrained scripts/DSL**, not arbitrary executable code.
- Engine-facing compilation/validation lives in code (`packages/ruleset-runtime` or similar), not inside ruleset content.

**Hard rule:** no ruleset-supplied code may directly access network, filesystem, DOM, or Node APIs.

---

## Cross-cutting rules

### Validation at boundaries

- Validate all external inputs at the boundary:
  - HTTP request bodies/params
  - WS messages
  - imported `.campaign/.tome/.ruleset/.character` artifacts
- After validation, pass typed objects inward (services/domain) to avoid “stringly typed” logic.

### Services are orchestration; domain is invariants

- Services coordinate workflows (resolve actions, call storage, emit events).
- Domain contains business rules/invariants and must remain IO-free.

### Ports and adapters for IO

Anything that touches IO must be behind an interface:

- Storage interface (DB)
- `AssetStore` (filesystem/S3)
- `Clock`, `IdGenerator`
- (later) `RelayClient`, `EmailSender`, etc.

### No “god utils”

- Utility modules must stay small and pure.
- If logic grows beyond a few functions or gains state, promote it to a domain/service object.

### Prefer composition over deep inheritance

- Use small objects with clear responsibilities.
- Keep functions pure where possible; keep stateful behavior encapsulated.

### When unsure: add a boundary, don’t break one

If implementing a feature tempts you to import across layers, create an adapter or a small interface instead.

---

## Hard decisions we’ve locked in

### Rendering

- **WebGL** for map/tokens/fog/lighting rendering.
- **CPU visibility polygons (in a Worker) + GPU mask compositing**.
- Visibility is computed by the server/client engine (implementation hidden behind `updateVisibility()`-style boundary) so raymarching can be explored later without API breakage.
- **Per-user visibility masks**, with multiple vision sources per user mask (e.g., wizard + familiar; party-shared is union of all party tokens).

### Hosting model

- One **Game Server** codebase that can run:
  - locally (self-host)
  - as a Docker container
  - in cloud hosting (same container; no second implementation)
- A separate **Platform** layer (optional) may provide convenience:
  - storage, marketplace (licenses later), and hosted servers
  - platform accounts are optional; **joining a game should not require a platform account** if you have a server invite link

### Persistence and file formats

Portable artifacts:

- `.campaign` — portable campaign package (zip under the hood), containing state + assets + references to attached tomes/rulesets.
- `.tome` — data-only compendium/content pack (homebrew-first; “writable compendium” concept).
- `.ruleset` — code + declarations that define schemas, actions, UI templates, and rules logic (no arbitrary JS in the UI; constrained DSL for action resolution).
- `.character` — portable character instance export/import.

### Ruleset + engine architecture

- Core engine provides a small set of **primitive ops** (roll, patch, prompt, select AoE/targets, emit events).
- Rulesets define:
  - entity schemas and derived fields (expressions)
  - action definitions (what exists / who can call)
  - resolver logic (DSL over primitive ops)
  - UI templates (safe declarative component tree) + bindings (buttons dispatch actions)
- **Effects** are first-class (modifiers/durations) to reduce custom resolver logic over time.

### Auth (self-host baseline)

- **Invite-link bootstrap** (opaque secrets), then **revocable sessions** (short-lived access + refresh token cookie).
- Avoid embedding user UUIDs in URLs.

---

## Documents (source of truth)

### Start here

- **Architecture overview:** [`docs/architecture-overview.md`](../docs/architecture-overview.md)
- **Shared types & terminology:** [`docs/shared-types.md`](../docs/shared-types.md) — **Read this for canonical type definitions and glossary**
- **Code style guide:** [`docs/code-style-guide.md`](../docs/code-style-guide.md) — **Follow these patterns for documentation and code organization**
- **To-do list:** [`docs/todo.md`](../docs/todo.md)

### Component docs

- **Server:** [`docs/components/server.md`](../docs/components/server.md)
- **Client:** [`docs/components/client.md`](../docs/components/client.md) — ⚠️ TBD, do not implement
- **Data model & file formats:** [`docs/components/data-model.md`](../docs/components/data-model.md) — ⚠️ TBD, do not implement
- **Ruleset engine:** [`docs/components/ruleset-engine.md`](../docs/components/ruleset-engine.md)

### Testing

- **Testing guidelines:** [`docs/testing.md`](../docs/testing.md)

### Protocols

- **HTTP API:** [`docs/protocols/http-api.md`](../docs/protocols/http-api.md)
- **Realtime WS protocol:** [`docs/protocols/realtime-ws.md`](../docs/protocols/realtime-ws.md)

### Decisions (ADRs)

All "locked" decisions should be captured as ADRs:

- [`docs/decisions/`](../docs/decisions/)

---

## Agent workflow rules

### 1) Read before you code

Before changing anything non-trivial, the agent must:

- Read `AGENTS.md` (this file)
- Read [`docs/shared-types.md`](../docs/shared-types.md) for canonical type definitions and terminology
- Read [`docs/code-style-guide.md`](../docs/code-style-guide.md) for documentation and code organization standards
- Read the relevant component doc(s) under `docs/components/`
- If changing protocols, read `docs/protocols/*`
- If changing architecture decisions, add/update an ADR in `docs/decisions/`

**Do not redefine types that exist in shared-types.md.** Import and reference them instead.

### 2) Plan + incremental implementation

Agents should work in small, verifiable steps:

- Make the smallest change that compiles/tests
- Run checks
- Only then move to the next step

### 3) Don’t invent new frameworks casually

Any addition of major dependencies/frameworks must be justified in an ADR:

- why needed
- alternatives considered
- impact on performance and portability

### 4) Determinism and authority

- The **server is authoritative** for campaign state.
- The client may do optimistic UI, but server resolves actions and broadcasts results.
- Ruleset DSL must remain constrained and safe; no arbitrary script execution in UI.

### 5) Security posture (pragmatic)

We’re not building a bank, but we **must** avoid common footguns:

- No player UUIDs in invite URLs
- Revocable tokens/sessions
- Treat user-generated text as untrusted (sanitize; no raw HTML execution)
- Prefer HttpOnly cookies for refresh tokens

### 6) Definition of done (DoD)

A change is “done” when:

- It builds
- Tests (if present) pass
- Lint/format passes (if configured)
- Docs updated if behavior/architecture changed

---

## Repo conventions (expected)

### Suggested layout (may evolve)

- `server/` — HTTP + WebSocket + persistence + serving the client bundle
- `client/` — web UI (map renderer, sheets UI, etc.)
- `packages/` — shared code (types, protocol definitions, dice, etc.)
- `docs/` — design docs (source of truth)

### Source of truth order

1. ADRs + component docs in `/docs`
2. Code
3. README/notes

If code and docs disagree, update docs or create an ADR explaining the change.

---

## First milestone (placeholder server + placeholder client)

Agents implementing the initial scaffold should aim for:

- Server serves a placeholder UI at `/`
- `/healthz` endpoint
- WebSocket endpoint (echo or minimal handshake)
- Config via env/flags: `PORT`, `DATA_DIR`, `PUBLIC_BASE_URL`, `TRUST_PROXY`
- Data directory created automatically
- Dockerfile that runs the same server
- (Optional) dev scripts for local run + docker run

See: [`docs/components/server.md`](docs/components/server.md)

---

## Notes for future work (non-goals for the scaffold phase)

- No full ruleset engine implementation required in milestone 1
- No full auth system required in milestone 1 beyond stub endpoints
- No full fog/lighting required in milestone 1 (just reserve the architecture boundaries)

---
