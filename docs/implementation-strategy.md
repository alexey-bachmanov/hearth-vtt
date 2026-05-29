# Implementation Strategy

> **Created:** February 2026  
> **Status:** Living document — update as phases complete and priorities shift.  
> **Purpose:** Long-term roadmap for HearthVTT, organized so each phase produces testable output and components can be developed in parallel across tracks.

---

## Table of Contents

- [Design Principles](#design-principles)
- [Isolation Surfaces](#isolation-surfaces)
- [Parallel Tracks](#parallel-tracks)
- [Milestones](#milestones)
- [Phases](#phases)
  - [Phase 0 — Foundation](#phase-0--foundation)
  - [Phase 1 — UI Completion](#phase-1--ui-completion)
  - [Phase 2 — Renderer + Canvas Input](#phase-2--renderer--canvas-input)
  - [Phase 3 — Server CampaignState + Sync](#phase-3--server-campaignstate--sync)
  - [Phase 4 — Minimal GameEngine](#phase-4--minimal-gameengine)
  - [Phase 5 — Player Auth](#phase-5--player-auth)
  - [Phase 6 — Campaign Creation & Lifecycle](#phase-6--campaign-creation--lifecycle)
  - [Phase 7 — DSL & RulesetRuntime](#phase-7--dsl--rulesetruntime)
  - [Phase 8 — Example Ruleset & Tome](#phase-8--example-ruleset--tome)
  - [Phase 9 — Effects & Workflows](#phase-9--effects--workflows)
  - [Phase 10 — Advanced Rendering](#phase-10--advanced-rendering)
  - [Phase 11 — File Formats & Portability](#phase-11--file-formats--portability)
  - [Phase 12 — Production Hardening](#phase-12--production-hardening)
- [Dependency Graph](#dependency-graph)
- [Key Decisions](#key-decisions)
- [Current State (as of Feb 2026)](#current-state-as-of-feb-2026)

---

## Design Principles

1. **Test-first for all new code.** Zero tests exist today. Every phase produces unit and/or integration tests alongside implementation. Vitest for both server and client.
2. **Isolate behind interfaces, mock at boundaries.** Every major subsystem is defined by a contract (interface or pure function signature). Mocks and in-memory implementations let components be developed and tested independently.
3. **Incremental integration.** Each phase yields something testable — a passing test suite, a visible UI behavior, or an end-to-end flow. No "implement everything, connect, pray" approach.
4. **Built-in actions bypass the runtime.** Primitive operations like `token.move` and `chat.send` are engine-level built-ins that can work without any ruleset. This lets early milestones ship before the DSL exists.
5. **Dev auth bypass for game development.** A `DEV_BYPASS_AUTH=true` flag provides hardcoded sessions so game mechanics and rendering work can proceed without real auth infrastructure.

---

## Isolation Surfaces

These are the 12 system boundaries where mocks/stubs allow independent development and testing. When building a component, mock everything across its boundary — don't reach into another component's internals.

| #   | Surface                             |  Pure?  | Boundary Contract                                                                                            | Test Strategy                                                                            |
| --- | ----------------------------------- | :-----: | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| 1   | **Shared Types**                    |   Yes   | Type definitions + Zod schemas in `shared/`                                                                  | Compile-time checks; schema round-trip tests                                             |
| 2   | **StorageBackend**                  |   No    | `StorageBackend` interface ([`storage.ts`](../server/src/storage/storage.ts))                                | `InMemoryBackend` for unit/integration tests; `SqliteBackend` for storage-specific tests |
| 3   | **SeatView projection**             |   Yes   | `engine.getView(seatId) → SeatView` — audience-filtered immutable snapshot                                   | Fixture-based: hand-build engine state, project for multiple seats, compare              |
| 4   | **RulesetRuntime** _(deferred)_     |    —    | Interior of the engine; design pending per [ADR 011](decisions/011-engine-facade-and-dsl-reversal.md)        | Out of scope until design pass completes                                                 |
| 5   | **Shared visibility geometry**      |   Yes   | `computeVisibility(tokenPos, params, walls, bounds) → polygon` in `shared/visibility/`                       | Property tests over scene fixtures; identical results server vs client                   |
| 6   | _(reserved)_                        |    —    | —                                                                                                            | —                                                                                        |
| 7   | **GameEngine (facade)**             |   No    | `dispatch`, `getView`, `subscribe`, `close` — per [ADR 011](decisions/011-engine-facade-and-dsl-reversal.md) | Boundary tests only; interior is engine-private                                          |
| 8   | **RealtimeHub** (WS protocol layer) |   No    | Forwards `view` and `event` messages per seat; routes `dispatch` inbound                                     | Mock WS connections; verify audience filtering and gap-resync                            |
| 9   | **Renderer**                        |   No    | `initRenderer()`, `setScene()`, `updateTokens()`, etc. — PixiJS hidden behind this API                       | Mock renderer for UI tests; visual regression for renderer                               |
| 10  | **Canvas Input Controller**         | Yes-ish | Pointer events → typed domain intents (`pan`, `zoom`, `select`, `dragToken`)                                 | Synthetic event tests                                                                    |
| 11  | **HTTP API Client**                 |   No    | Typed methods per endpoint; returns typed responses                                                          | Mock fetch for client tests; integration tests against real server                       |
| 12  | **Auth System**                     |   No    | Session interfaces; dev bypass mode for testing                                                              | Unit tests for crypto/session logic; dev bypass for all other tests                      |

---

## Parallel Tracks

Work is organized into 3 tracks that a small team (2–3 contributors) can run concurrently. Integration checkpoints (milestones **M1–M4**) are where tracks must converge and be tested together.

| Track                    | Focus                                               | Owner Profile            |
| ------------------------ | --------------------------------------------------- | ------------------------ |
| **Track A — Backend**    | Server state, persistence, GameEngine, auth         | Server/systems dev       |
| **Track B — Frontend**   | UI completion, renderer, client state, canvas input | UI/graphics dev          |
| **Track C — Game Logic** | Ruleset runtime (deferred), rulesets, tomes         | Language/game design dev |

Track C starts later (Phase 7) and is mocked until then. Tracks A and B converge at M1.

---

## Milestones

| Milestone | Description                                                           | Phases Required | What It Proves                                                                               |
| --------- | --------------------------------------------------------------------- | --------------- | -------------------------------------------------------------------------------------------- |
| **M1**    | Token moves on a map, synced between two clients                      | 0, 2, 2.5, 3    | Rendering, WS sync, engine facade, server state, and event application all work end-to-end   |
| **M2**    | Actions flow through the GameEngine facade                            | 0, 2.5, 3, 4    | Engine pipeline (dispatch → events → view-projection → broadcast) works for baseline actions |
| **M3**    | Multi-user campaign with real auth                                    | 0, 3, 4, 5      | Invite → claim → session → WS auth → see synced state; revoking sessions disconnects players |
| **M4**    | Full action cycle (pick target → roll → apply damage → see HP change) | 0, 3, 4, 7, 8   | Real ruleset resolves actions; multi-step workflows with prompts work; ruleset-driven UI     |

---

## Phases

### Phase 0 — Foundation

> **Estimated effort:** ~1 week  
> **Tracks:** All (prerequisite for everything)  
> **Dependencies:** None

Everything else depends on this. Do first.

#### Tasks

1. **Vitest configuration.** Add `vitest.config.ts` to both `server/` and `client/`. Confirm `npm test` works with a trivial passing test in each package.

2. **Shared types folder.** Create `shared/` at repo root (plain folder; both sides import via relative paths or TypeScript path aliases). Move/define canonical types from [`shared-types.md`](shared-types.md):
   - `CampaignState`, `Snapshot`, `GameEvent` (with `seq: number`)
   - `EngineInput`, `DispatchResult`, `ActionType`, `Capabilities`
   - `SeatView` and the `*View` projection types
   - `Audience`, `EntityType`, `PromptKind`, `Prompt`, `PromptAction`
   - All branded ID types (`CampaignId`, `SeatId`, `ActorId`, `TokenId`, etc.)
   - Zod schemas for WS message validation (both directions)

   Per [ADR 011](decisions/011-engine-facade-and-dsl-reversal.md), `Patch`, `PatchOp`, `applyPatches`, `WorkflowState`, `Resolution`, `ResolverProgramRef`, and `SyncBundle` are **engine-internal** and do **not** belong in `shared/`.

3. **InMemoryStorageBackend.** Implement the `StorageBackend` interface as a pure in-memory Map-based store. This unlocks all server-side testing without SQLite.

4. **Dev auth bypass.** Add a `DEV_BYPASS_AUTH=true` env flag. When set, WS upgrade skips cookie validation and assigns a hardcoded `seatId`/`campaignId`. HTTP routes skip session checks. Guarded with `if (process.env.NODE_ENV === 'production') throw` safety.

5. **Shared visibility geometry.** Create `shared/visibility/` with `computeVisibility(tokenPos, params, walls, bounds) → polygon`. Both server and client import it.

#### Verification

- `npm test` passes in both packages.
- `InMemoryBackend` passes the same interface tests that will later run against `SqliteBackend`.
- `computeVisibility` has property-based tests over a small set of scene fixtures.

---

### Phase 1 — UI Completion

> **Estimated effort:** ~2–3 weeks  
> **Track:** B (Frontend)  
> **Dependencies:** Phase 0

Finish the Play UI Overhaul (phases 7–11 from [`todo.md`](todo.md)) before pivoting to engine/backend.

#### Tasks

1. **Bottom notifications** (Play UI Phase 7). Build `NotificationArea` and `NotificationCard` components. Wire to `notificationState`. Replace old snackbar system.

2. **Tabbed floating windows** (Play UI Phase 8). Build `TabbedWindow` component with tab merge/detach. Integrate with `FloatingWindowLayer` and unify its state into `uiState`.

3. **Canvas input** — deferred to Phase 2 since it's tightly coupled with the renderer.

4. **Seat permissions** (Play UI Phase 10). Implement `seatPermissions` derived state in `ui.svelte.ts`. Gate toolbar items, drawer access, and actor pill actions by role. Use mock `seatRole` for now.

5. **Cleanup** (Play UI Phase 11). Remove dead components, consolidate CSS, audit component boundaries.

#### Verification

- All UI interactions work with mock campaign data.
- No console errors.
- Manual walkthrough of all toolbar drawers, windows, notifications, and permission gating.

---

### Phase 2 — Renderer + Canvas Input

> **Estimated effort:** ~2–3 weeks  
> **Track:** B (Frontend, can overlap Phase 1)  
> **Dependencies:** Phase 0

Replaces the stub `render/index.ts` with a real PixiJS-backed renderer. Builds toward M1.

#### Tasks

1. **PixiJS integration.** Install PixiJS. Create `client/src/render/pixi/` implementation folder. Implement the `Renderer` interface: `initRenderer(canvas)`, `destroy()`.

2. **Map background layer.** Load and display a scene background image. Implement `setScene(scene)`.

3. **Grid overlay.** Render grid lines (square grid initially; hex later) based on `Scene.grid` config.

4. **Token sprite layer.** Render token sprites at grid positions. Implement `updateTokens(tokens[])`. Handle add/remove/move with simple tweening for position changes.

5. **Camera system.** Pan (middle-click drag or two-finger), zoom (scroll wheel / pinch), with smooth interpolation. Expose via `viewportState`.

6. **Canvas Input Controller.** Pointer event handler on `MainCanvas.svelte`. Translates raw events into typed intents:
   - `{ type: 'select', tokenId }`
   - `{ type: 'dragStart', tokenId }`
   - `{ type: 'dragMove', position }`
   - `{ type: 'dragEnd', position }`

   No rendering knowledge — just emits domain events.

7. **Token drag/drop.** Visual feedback during drag (ghost sprite). On drop, emit a domain action (not yet wired to server — just updates local mock state for now).

#### Verification

- Open `/play` → see map background + grid + token sprites from mock data.
- Pan/zoom works smoothly.
- Drag a token, see it move.
- All still local/mock — no server sync yet.

---

### Phase 2.5 — Engine Boundary Refactor

> **Estimated effort:** ~1–2 weeks  
> **Track:** A + B (small cross-cutting)  
> **Dependencies:** Phase 0; Phase 2 complete  
> **Authority:** [ADR 011](decisions/011-engine-facade-and-dsl-reversal.md)

Locks down the engine boundary before Phase 3 builds against it. Replaces the previously-planned patches-on-wire model with events + SeatView. Inserts a minimal placeholder engine that exposes the boundary shape; the engine _interior_ (RulesetRuntime, ruleset scripting runtime, effects, workflows) remains deferred.

#### Tasks

1. **Define the engine facade in `server/src/domain/engine/`.** Interfaces only:
   - `GameEngine` (`dispatch`, `getView`, `subscribe`, `close`)
   - `EngineInput`, `DispatchResult` (re-exported from `shared/`)
   - Internal `CampaignState` shape (not exported — engine-private)

2. **Update `shared/` types.** Remove `Patch`, `PatchOp`, `applyPatches`, `WorkflowState`, `Resolution`, `ResolverProgramRef`, `SyncBundle` from the public surface. Add `SeatView`, `EngineInput`, `DispatchResult`, `Capabilities`, `ActionType`, and the `*View` projection types. Add `seq: number` to `GameEvent`. Add `clientRequestId?: string` to dispatch envelopes.

3. **Shared visibility module.** Create `shared/visibility/` with the pure geometry function `computeVisibility(tokenPos, visionParams, walls, sceneBounds) → polygon`. Server and client both import from here.

4. **Minimal placeholder engine (~500 lines of CRUD).** Implements only baseline VTT-universal actions: `token.move`, `chat.send`, `dice.roll`, `drawing.create`, `drawing.delete`, `measurement.*`, `label.*`. No ruleset loaded. Owns `CampaignState`, assigns `seq` per event, derives `actionId = hash(campaignId, seq, actionType, canonicalJSON(payload))`, seeds RNG from `actionId`, honors `clientRequestId` idempotency.

5. **WebSocket handler refactor.** Replace `sync.delta` / `sync.initial` with `{ type: 'view', view }` and `{ type: 'event', event }`. Add `{ type: 'view.request' }` for resync. Route action messages to `engine.dispatch`.

6. **Client refactor.** Drop `applyDelta`; introduce `applyView(view)` and `applyEvent(event)`. Track `lastSeq`. On gap, request `view.request`. Convert optimistic token-move to compute lit overlay locally via the shared visibility function.

7. **Tests.** Boundary tests against the public surface only: dispatch → events flow, getView shape, gap-detection → resync, idempotency via `clientRequestId`, deterministic dice via seeded RNG, optimistic-move accept-and-reject paths.

#### Verification

- Server and client communicate only via `view` and `event` messages. No `Patch` import anywhere outside the engine interior.
- Token drag in tab A appears in tab B (event-driven, not patch-driven).
- Disconnecting and reconnecting a client receives a fresh `SeatView` and resumes the event stream without duplicate or missing events.
- Sequence-gap detection is exercised in a unit test by dropping an event and observing the client re-request the view.

---

### Phase 3 — Server CampaignState + Sync

> **Estimated effort:** ~2–3 weeks  
> **Track:** A (Backend)  
> **Dependencies:** Phase 2.5 (engine boundary)

The backend half of M1. Builds real state durability and wires the placeholder engine to storage. **All mutation now goes through `engine.dispatch`** — there are no "hardcoded built-in patch handlers" outside the engine.

#### Tasks

1. **Engine-internal `CampaignState` model.** Inside `server/src/domain/engine/`. Hydrates from snapshot + replayed events. Engine owns it; nothing outside imports its shape.

2. **Event persistence.** Wire `Storage.appendEvent()` and `Storage.getEventsSinceSnapshot()` to the real `SqliteBackend`. Engine writes events transactionally **before** broadcasting them.

3. **Snapshot chain.** Implement `saveSnapshot()`, `getLatestSnapshot()`, `pruneOldSnapshots()` in SQLite. Engine triggers snapshots every N events.

4. **State recovery.** Engine `open(campaignId)` → load latest snapshot → replay events → ready for dispatch. Test with InMemoryBackend.

5. **WebSocket `view.request` handler.** On WS connect or on client-side gap detection, server replies `{ type: 'view', view: engine.getView(seatId) }`.

6. **WebSocket event broadcasting.** Engine `subscribe(seatId, listener)` per connected seat; listener forwards as `{ type: 'event', event }`. Audience filtering happens before the listener fires.

7. **Token-move dispatch path.** WS receives `{ type: 'dispatch', input }` from client → `engine.dispatch(input)` → engine validates, persists, emits `token.moved` + (if visibility changes) `fog.revealed` events. Rejected moves emit `token.move.rejected` to the originating seat only.

8. **Optimistic move preview.** Either (a) drop the throttled preview channel for now in favor of round-trip dispatches, or (b) add a non-persisted `token.move.preview` event channel that bypasses storage but goes through `engine.dispatch` with a preview flag. Phase 3 picks (a); (b) is a Phase 10 polish task.

#### Verification — M1

> **Open two browser tabs. Both connect via WS, receive `SeatView`s, see the same map. Drag a token in tab A → tab B sees `token.moved` event in real-time. Server persists — refresh a tab, the token is in the new position.**

**Test coverage:** Engine boundary integration tests (InMemoryBackend), snapshot/replay tests, WS message serialization tests.

---

### Phase 4 — Minimal GameEngine

> **Estimated effort:** ~2–3 weeks  
> **Track:** A (Backend)  
> **Dependencies:** Phase 3

Adds the action processing pipeline with a mock runtime. Replaces the hardcoded handlers from Phase 3.

#### Tasks

1. **AsyncQueue.** Implement the sequential action queue (one action at a time per campaign). Pure utility, well-tested.

2. **GameEngine class.** Create `server/src/domain/game-engine.ts`. Implement:
   - `static async create(options: GameEngineOptions): Promise<GameEngine>`
   - `handleAction(envelope: ActionEnvelope): Promise<EngineResult>`
   - `handleWorkflowInput(input): Promise<EngineResult>`
   - `getInitialSync(seatId): SyncBundle`
   - `close(): Promise<void>`

   All dependencies injected: `Storage`, `RealtimeHub`, `RulesetRuntime`, `IdGenerator`, `Clock`, `Logger`.

3. **MockRulesetRuntime.** Implement `RulesetRuntime` interface with hardcoded action→resolution mappings:
   - `token.move` → position patch
   - `chat.send` → chat event
   - `roll.dice` → random roll event

   This lets you test the full engine pipeline without any DSL.

4. **CampaignManager.** Create `server/src/domain/campaign-manager.ts`. Manages `Map<CampaignId, GameEngine>`:
   - `openCampaign()` creates engine on first WS connection
   - Inactivity timer closes idle campaigns
   - `shutdown()` closes all

5. **Wire WS → GameEngine.** Replace Phase 3's hardcoded token.move handler with proper routing: WS `action` message → `CampaignManager.get(campaignId).handleAction(envelope)` → engine processes → broadcasts results.

6. **Built-in chat.** `chat.send` action → `GameEvent` with `type: 'chat'` → broadcast → appears in client sidebar chat log.

7. **RealtimeHub adapter.** Implement the `RealtimeHub` interface as a thin wrapper around the WS connection map. `broadcastEvents()` filters by audience. `sendPrompts()` targets specific seats.

#### Verification — M2

> **Token moves now flow through the engine. Chat messages work (type in sidebar → appears for all connected clients). Server logs show action→resolution→event pipeline.**

**Test coverage:** GameEngine unit tests (MockRulesetRuntime + InMemoryBackend + mock RealtimeHub). AsyncQueue concurrency tests. CampaignManager lifecycle tests.

---

### Phase 5 — Player Auth

> **Estimated effort:** ~2 weeks  
> **Track:** A (Backend, can overlap Phase 4)  
> **Dependencies:** Phase 3

Replaces dev auth bypass with real invite→claim→session→WS-auth flow.

#### Tasks

1. **Wire seats/invites to real storage.** The SQLite tables already exist. Replace mock data in `seats.ts` and `invites.ts` with real `Storage` calls. Use `crypto.randomBytes()` for invite tokens.

2. **Invite claim flow.** `POST /api/invites/:token/claim` with PIN → creates `AuthSession` → sets HttpOnly refresh token cookie → returns seat info.

3. **Session management.** Implement `POST /api/sessions/refresh` (rotate refresh token) and `DELETE /api/sessions` (revoke). Wire `sessions.ts` and `auth.ts` to real storage.

4. **WS authentication.** On WS upgrade, validate refresh token cookie → extract `seatId` + `campaignId` → proceed. Reject unauthenticated connections (except when `DEV_BYPASS_AUTH` is set).

5. **Client join flow.** Wire `JoinPage.svelte` to real `AuthApi`. On successful claim → redirect to `/play`. Wire `http.ts` sub-clients (`AuthApi`, `SeatApi`, etc.) to real `HttpClient`.

6. **Admin seat management.** Wire `SeatSettings.svelte` to create invites, view/revoke seats via real API.

7. **Remove dev-bypass hack.** After real auth is wired, delete or gate behind `DEV_BYPASS_AUTH` env var:
   - Remove `seatId` prop from `PlayLayout.svelte` and `seatId` from the `play-campaign` route type in `routes.ts`.
   - Remove `seatId` field and `&seat=` URL building from `WebSocketClient` in `ws.ts`.
   - Remove auth-guard bypass (`if (type === 'play-campaign' && currentRoute.seatId) return`) in `Router.svelte`.
   - The `?seat=` param in the server WS handler (`ws.ts`) was already hard-gated behind `!isProduction`; decide whether to keep or remove.

#### Verification — M3

> **Admin creates campaign → creates invite → shares link. Player opens link → enters PIN → joins campaign → sees synced state. Two players can see each other's token moves. Revoking a session disconnects the player.**

---

### Phase 6 — Campaign Creation & Lifecycle

> **Estimated effort:** ~2 weeks  
> **Track:** A + B  
> **Dependencies:** Phase 4

The admin experience for setting up a campaign.

#### Tasks

1. **Campaign creation flow.** Expand admin UI. Create campaign → set name/description → initially skip ruleset selection (use a "basic" built-in placeholder that provides `token.move` and `chat.send` only).

2. **Scene management.** Admin creates/edits scenes (background image upload, grid settings). Wire to storage. Scene switching broadcasts `sync.delta` to all clients.

3. **Token management.** Admin places tokens on scenes. Set actor associations, visibility, size. Store in campaign state.

4. **Campaign lifecycle states.** Draft → Active → Archived. Only Active campaigns accept WS connections.

5. **Asset upload.** Basic file upload/serve for map backgrounds and token images. Store in `DATA_DIR/campaigns/{id}/assets/`.

#### Verification

Full GM workflow: create campaign → upload map → place tokens → invite player → player joins → sees map with tokens.

---

### Phase 7 — Ruleset Runtime (deferred design)

> **Estimated effort:** TBD; significant.  
> **Track:** C (Game Logic)  
> **Dependencies:** Phase 4 (engine present); explicit design pass before implementation.  
> **Authority:** [ADR 011](decisions/011-engine-facade-and-dsl-reversal.md)

The previous plan in this slot was "DSL & RulesetRuntime" — a custom JSON DSL with an EBNF expression language and a pure resolver compiler. **That plan has been reversed.** The DSL is gone. The replacement work splits into a design pass and an implementation pass, both deferred.

#### Design pass (prerequisite)

1. **Choose the ruleset runtime form.** Options under consideration: direct TypeScript modules (first-party only); sandboxed QuickJS for untrusted distribution; Lua. The constraint that rules it: pause-and-resume across user input must be modeled as durable workflow state, **not** host-language coroutines or promises.
2. **Design the Engine ↔ Ruleset interior contract.** How rulesets register action types, capabilities, schemas, and UI panels with the engine; how the engine invokes resolver code; how rulesets read campaign state without violating the boundary.
3. **Design effects and modifier stacking.** Deferred until at least one ruleset is being built so the design has a concrete user.
4. **Untangle Engine / Ruleset / Campaign / Tome.** This relationship is currently underspecified; the design pass produces an ADR or replacement for parts of ADR 004.

#### Implementation pass (after design)

1. Implement the chosen runtime form.
2. Implement the in-engine bridge between the runtime and `CampaignState`.
3. Implement workflow state machine persistence (already an engine-internal concern; ruleset code drives it).
4. Replace the placeholder engine's empty ruleset slot with a real ruleset loader.

#### Verification

Deferred. Becomes meaningful when a real ruleset can be loaded and exercised.

---

### Phase 8 — Example Ruleset & Tome

> **Estimated effort:** ~2–3 weeks  
> **Track:** C (after Phase 7)  
> **Dependencies:** Phase 7

Concrete content to prove the system works end-to-end.

#### Tasks

1. **Minimal ruleset** (e.g. "HearthCore"). Define schemas for Actor (HP, AC, stats, proficiency), Token, Scene. Define actions: `attack.melee`, `attack.ranged`, `cast.spell`, `roll.ability`, `roll.save`, `roll.initiative`. Write DSL resolvers for each.

2. **Example tome** (e.g. "SRD Basics"). Weapons (longsword, shortbow), Spells (fire bolt, cure wounds, fireball with AoE), Monsters (goblin, dragon), Features (rage, sneak attack).

3. **Campaign creation with ruleset.** Update campaign creation to select a ruleset. Load ruleset + tomes on `GameEngine.create()`. Build the `Compendium` in-memory index.

4. **Character sheet template.** Ruleset defines a declarative UI template for the character sheet. Client renders it from the template definition (safe; no arbitrary code).

5. **Action buttons from ruleset.** Toolbar/sheet actions are defined by the ruleset, not hardcoded. Client reads action definitions from the loaded config and renders appropriate UI affordances.

#### Verification — M4

> **Create campaign with HearthCore ruleset + SRD Basics tome. Place a goblin and a fighter token. Select fighter → click "Melee Attack" → pick goblin as target → see roll in chat → goblin HP decreases. Multi-step workflow (pick target → roll attack → if hit, roll damage → apply) works end-to-end.**

---

### Phase 9 — Effects & Workflows

> **Estimated effort:** ~3–4 weeks  
> **Track:** C  
> **Dependencies:** Phase 7, Phase 8

#### Tasks

1. **Effects system.** `applyEffect` / `removeEffect` operations. Duration tracking (rounds, turn start/end, save ends). Modifier aggregation (`getStatModifiers`, `getRollModifiers`). Derived stat recomputation when effects change.

2. **Multi-step workflows.** Full `WorkflowState` lifecycle: create → prompt for input → receive response → continue → resolve. Expiration/cancellation. Test with concentration save example.

3. **Encounter system.** `encounter.create` → `encounter.collectInitiative` → `encounter.advanceTurn`. Turn order tracking in `CampaignState`. UI turn indicator.

4. **Triggered actions.** `resolveTriggered(event, ctx)` for on-hit effects, reactions, aura triggers. Recursion limit (20). Test with "fire shield deals damage when hit" scenario.

#### Verification

Run a simulated combat encounter: initiative → turns → attacks with advantage from effects → concentration checks → triggered reactions. All state changes visible in both clients.

---

### Phase 10 — Advanced Rendering

> **Estimated effort:** ~3–4 weeks  
> **Track:** B (independent of game logic track)  
> **Dependencies:** Phase 2

#### Tasks

1. **Fog of war.** Server computes visibility polygons (CPU, in Worker). Client receives per-seat visibility masks. PixiJS composites mask over map.

2. **Dynamic lighting.** Light sources on tokens/scenes. Visibility polygons recompute when lights/walls change.

3. **Wall/obstruction system.** GM draws walls on map. Stored in Scene. Used for visibility + pathfinding.

4. **Visual polish.** Token auras, status effect icons, health bars, selection highlights, measurement tool rendering.

---

### Phase 11 — File Formats & Portability

> **Estimated effort:** ~2–3 weeks  
> **Dependencies:** Phase 6, Phase 8

#### Tasks

1. **`.campaign` export/import** — ZIP: manifest + snapshot + homebrew + assets
2. **`.character` export/import** — ZIP: manifest + actor + inventory + effects
3. **`.tome` packaging and loading from file**
4. **`.ruleset` packaging and loading from file**

See [`data-model.md`](components/data-model.md) for format specifications.

---

### Phase 12 — Production Hardening

> **Estimated effort:** Ongoing  
> **Dependencies:** All prior phases

#### Tasks

1. **Auth hardening.** 1hr sessions, sliding window refresh, rate limits on all endpoints.
2. **Error handling audit.** Every WS handler, every route — structured error responses.
3. **Performance profiling.** PixiJS rendering with large token counts, WS message volume, expression evaluation hot paths.
4. **Fix Docker and exe builds.** `scripts/build-docker.js` and `scripts/build-exe.js` are currently broken.
5. **Services layer extraction.** Move business logic from route handlers into `server/src/services/`.
6. **Promote shared types.** Move `shared/` folder to proper `packages/shared` npm workspace package once types have stabilized.
7. **Hosted mode support.** Multi-tenant considerations, platform accounts (optional).

---

## Dependency Graph

```
Phase 0 (Foundation) ─────────────────────────────────────────
  │         │              │
  ▼         ▼              ▼
Phase 1   Phase 2        Phase 3
(UI)      (Renderer)     (Server State + Sync)
            │              │
            └──────┬───────┘
                   ▼
              ★ M1: Token moves on map ★
                   │
                   ▼
              Phase 4 (GameEngine + MockRuntime)
                   │
                   ├──────────────────────┐
                   ▼                      ▼
              ★ M2: Actions              Phase 5 (Player Auth)
              through engine ★            │
                   │                      │
                   └──────┬───────────────┘
                          ▼
                     ★ M3: Multi-user campaign ★
                          │
              ┌───────────┤
              ▼           ▼
         Phase 6     Phase 7 (DSL + RulesetRuntime)
         (Campaign        │
          Creation)       ▼
              │      Phase 8 (Example Content)
              │           │
              └─────┬─────┘
                    ▼
               ★ M4: Full action cycle ★
                    │
          ┌─────────┼─────────┐
          ▼         ▼         ▼
     Phase 9    Phase 10   Phase 11
     (Effects)  (Rendering) (File Formats)
          │         │         │
          └─────────┴─────────┘
                    ▼
              Phase 12 (Production)
```

### Parallelism Notes

- **Phase 1** and **Phase 3** are fully independent and can run simultaneously.
- **Phase 2** and **Phase 3** are independent until M1 integration.
- **Phase 5** can overlap with **Phase 4** (different subsystems).
- **Phase 7** parsing/evaluator work can begin during **Phase 4** (no engine integration needed yet).
- **Phase 10** is independent of the game logic track (Phases 7–9).
- **Phase 11** can begin once file format schemas are stable (Phase 8+).

---

## Key Decisions

These are locked architectural choices for this roadmap. Changes require an ADR.

| Decision                                               | Rationale                                                                                                                                                                                                                                         |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PixiJS over raw WebGL initially**                    | Faster time-to-productive-rendering. PixiJS uses WebGL under the hood (consistent with [ADR 001](decisions/001-webgl-rendering.md)). The `Renderer` interface means PixiJS can be swapped for a custom engine later without client-side breakage. |
| **MockRulesetRuntime before real ruleset code**        | Proves the entire action→event→sync pipeline works (M1, M2) before any ruleset runtime is chosen. Per [ADR 011](decisions/011-engine-facade-and-dsl-reversal.md), the engine is a facade; the runtime form is deferred.                           |
| **Dev auth bypass before real auth**                   | Unblocks all game mechanics and rendering development. Real auth is orthogonal and built in parallel (Phase 5).                                                                                                                                   |
| **Shared folder over npm workspace package initially** | Avoids monorepo tooling complexity while types are still evolving rapidly. Promoted to `packages/shared` in Phase 12 when types stabilize.                                                                                                        |
| **Built-in actions bypass the runtime**                | `token.move` and `chat.send` are engine-level primitives that can work without any ruleset. Ensures M1 and M2 are achievable before DSL work begins. Move validation will later be integrated in the game engine.                                 |
| **Test-first for all new code**                        | Zero tests exist today. Vitest is installed. Every phase produces tests alongside implementation. `InMemoryBackend` enables fast, deterministic server-side tests.                                                                                |

---

## Current State (as of Feb 2026)

### What's Working

- Server: Fastify setup, health routes, campaign CRUD, admin auth (CSRF, rate limiting, sessions), SQLite storage (metadata + per-campaign DBs), setup PIN flow
- Client: SPA routing, admin setup/login/dashboard, play layout (3-zone grid), left toolbar with 15 drawers, right sidebar (chat log), actor pills, quick status, Svelte 5 rune-based state stores, rich mock campaign data, CSS architecture (3-tier)

### What's Stubbed

- Server: player auth routes (mock data), seat/invite routes (mock data), WS handler (minimal — welcome + ping/pong, no game dispatch), `TransactionStorage` entity/event methods (throw "not implemented")
- Client: all HTTP API sub-clients (throw `NOT_IMPLEMENTED`), all WS message handlers (console.log stubs), `campaign.applyDelta()` (no-op), entire renderer (console.log no-ops), `domain/index.ts` (empty), `util/index.ts` (empty)

### What's Missing

- GameEngine, CampaignManager, RulesetRuntime, DSL interpreter
- Shared types package (`packages/` directory doesn't exist)
- WebGL/PixiJS rendering
- Real player authentication
- Real-time state sync
- File format handling (.campaign, .tome, .ruleset, .character)
- Services layer (`server/src/services/`)
- Server domain layer (`server/src/domain/`)
- Testing infrastructure (zero tests, vitest unconfigured)
- Docker and exe builds (both broken)
