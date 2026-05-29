# Todo List Strategy

**Workflow:** Items in "Tech Debt" and "Bugs" represent known issues organized by category. Long-term objectives are detailed in [docs/implementation-strategy.md](../docs/implementation-strategy.md). When we decide to tackle a category, we **promote it to "Current Projects"** with a comprehensive, step-by-step plan. This prevents plans from rolling out of context during implementation.

As work completes, check off tasks.

---

# Current Projects

## Phase 3 — Durable Engine State + Two-Computer Sync

**Goal:** Drag a token on one computer, see it on a second. Restart the server, see the token in its new position. Engine state is durable via snapshot-load + event-replay. Dispatch is serialized so concurrent actions can't corrupt in-memory state.

**Out of scope:** auto-snapshot triggers + pruning, engine create-actions, admin entity-placement routes, real player auth (Phase 5), heavy renderer/UI work, schema migration (delete dev DB on schema change), `resume` replay optimisation.

**Verification:** `npm test -w server` green (new engine + storage tests included). `npm run seed-dev-db` produces a seeded dev DB idempotently. Manual two-computer demo: drag token on computer A → appears on B. Kill server → restart → both clients reconnect → token still in new position.

---

### Phase A — Storage primitives

- [x] **A1.** Add `seq INTEGER NOT NULL` column to the `events` table CREATE statement in [`sqlite-storage.ts`](../server/src/storage/sqlite-storage.ts). Update `appendEvent` to accept + persist `seq`; update `getEvents` to return it. Mirror in [`in-memory-storage.ts`](../server/src/storage/in-memory-storage.ts).
- [x] **A2.** Add `getMaxEventSeq(campaignId): Promise<number>` to `StorageBackend` and `Storage` facade, returning `0` for empty campaigns. Implement in both backends.
- [x] **A3.** Add `afterSeq` filter option to `getEvents(campaignId, {afterSeq?: number})` in the interface and both backends. Used by `open()` to replay only events after the snapshot.
- [x] **A4.** Add `snapshots` table to SQLite schema: `(campaign_id TEXT PRIMARY KEY, seq INTEGER NOT NULL, data_json TEXT NOT NULL, created_at INTEGER NOT NULL)`. Single-row-per-campaign; write replaces the existing row.
- [x] **A5.** Add `getLatestSnapshot(campaignId): Promise<{seq: number, blob: unknown} | null>` and `putSnapshot(campaignId, seq, blob): Promise<void>` to `StorageBackend`, `Storage` facade, and both backends.
- [x] **A6.** Tests in [`sqlite-storage.test.ts`](../server/src/storage/sqlite-storage.test.ts): snapshot put/get round-trip; `seq` persistence on events; `getMaxEventSeq` for empty + populated campaigns; `afterSeq` filter; each new method covered in `InMemoryBackend` as well.

---

### Phase B — Engine refactor

- [x] **B1.** Define `SnapshotBlobV1` type inside [`placeholder.ts`](../server/src/domain/engine/placeholder.ts) (or a co-located `state.ts`): `{ schemaVersion: 1, activeSceneId: string | null, scenes: Record<string, Scene>, tokens: Record<string, Token>, actors: Record<string, Actor> }`. Type stays engine-internal — not exported to `shared/`.
- [x] **B2.** Split each action handler into two parts: (a) validate + build event (`validateTokenMove`, `validateChatSend`, `validateDiceRoll`) returning `{event, eventData} | {rejected, reason}`; (b) `apply(event)` that mutates `CampaignState` and appends to `recentEvents`. Live dispatch path becomes: validate → assign `nextSeq()` → `storage.appendEvent(seq)` → `apply(event)` → broadcast. Replay path: `apply(event)` only.
- [x] **B3.** Rewrite `PlaceholderEngine.open()`: load snapshot → seed `CampaignState` from blob (or empty state if null) → `storage.getEvents({afterSeq: snapshot?.seq ?? 0})` → replay each via `apply()` → `state.seq = await storage.getMaxEventSeq(campaignId)`. Stop calling `storage.listEntities` — remove from the `Promise.all`. Document that `state.seats` loads once and doesn't refresh until engine reopen (Phase 5 concern).
- [x] **B4.** Implement AsyncQueue inside `PlaceholderEngine`: private `dispatchQueue: Promise<unknown> = Promise.resolve()`. `dispatch(input)` chains onto the queue: `this.dispatchQueue = this.dispatchQueue.then(() => this.dispatchInternal(input)).catch(() => ...)`. Each `dispatchInternal` error is caught and returned as `{accepted: false}` so the queue chain never poisons on rejection. The `GameEngine` interface is unchanged.
- [x] **B5.** Implement close-on-apply-throw: wrap `apply(event)` inside `dispatchInternal` in try/catch. On throw: log the error, mark `state.closed = true`, schedule `void this.close()` on next tick. Subsequent `dispatch` calls return `{accepted: false, reason: 'engine closed'}`. `subscribe` after close is a no-op returning a no-op unsubscriber. `getView` after close returns an empty/zeroed `SeatView`.
- [x] **B6.** Tests in [`placeholder.test.ts`](../server/src/domain/engine/placeholder.test.ts) (using `InMemoryBackend`):
  - **Restart persistence:** dispatch `token.move`, close, reopen with same storage, `getView()` shows new position.
  - **Replay correctness:** hand-write snapshot + 3 events into `InMemoryBackend`, open engine, verify state.
  - **Dispatch serialisation:** fire 3 concurrent `dispatch` calls, verify `seq` values are 1, 2, 3 in arrival order with no duplicates.
  - **Close-on-throw:** monkey-patch `apply` to throw; dispatch; verify engine closes and subsequent dispatches return `{accepted: false}`.
  - **Seq monotonicity across reopen:** dispatch 2 events, close, reopen, dispatch 1 more → `seq=3`, not `seq=1`.

---

### Phase C — Dev seed + dev-bypass extension

- [ ] **C1.** Create [`server/src/domain/engine/dev-seed.ts`](../server/src/domain/engine/dev-seed.ts): exports `buildDevSeed(): SnapshotBlobV1` — one scene, two tokens, two actors. Actor `seatPermissions` assigns `seat-mock-001` (GM) `'control'` and `seat-mock-002` (player) `'control'` over their respective tokens. Pure function, no IO.
- [ ] **C2.** Create [`scripts/seed-dev-db.ts`](../scripts/seed-dev-db.ts): CLI wrapper that opens `SqliteStorage` at the dev DB path, creates campaign `campaign-mock-001` (hardcoded, matches `DEV_CAMPAIGN_ID`), creates seats `seat-mock-001` (GM) and `seat-mock-002` (player), calls `storage.putSnapshot('campaign-mock-001', 0, buildDevSeed())`. Idempotent: if the campaign already exists, delete it and recreate. Add `"seed-dev-db": "tsx scripts/seed-dev-db.ts"` to root [`package.json`](../package.json).
- [ ] **C3.** Extend dev-bypass in [`ws.ts`](../server/src/routes/ws.ts): if `NODE_ENV !== 'production'` and `?seat=<id>` is present, validate the seat exists in the requested campaign via `storage.listSeats`; if found, use it. Otherwise fall back to `DEV_SEAT_ID`. Add `DEV_SEAT_ID_2 = 'seat-mock-002'` constant for documentation purposes. Hard-gate: the `?seat=` param read is inside the `!isProduction` branch and cannot be reached in production.
- [ ] **C4.** Tests in [`ws.integration.test.ts`](../server/src/routes/ws.integration.test.ts): `?seat=` accepted in dev when seat belongs to campaign; `?seat=` ignored (falls back to `DEV_SEAT_ID`) in prod (`NODE_ENV=production`); `?seat=` with unknown seat ID falls back to `DEV_SEAT_ID` in dev.

---

### Phase D — Doc updates + verification

- [ ] **D1.** Update [Phase 3 in `implementation-strategy.md`](../docs/implementation-strategy.md): mark WS dispatch/broadcast/view.request as already shipped in Phase 2.5; mark snapshot auto-trigger + pruning as deferred to a separate mini-sprint; note `expectedSeq`-in-actions as rejected (AsyncQueue makes it unnecessary).
- [ ] **D2.** Update [`todo.md`](../docs/todo.md) tech debt: remove "Snapshot chain (deferred to Phase 3)" bullet (partially landed — read path done, auto-trigger deferred). Add "Drop `entities` table and storage methods (engine no longer uses them)" under Code Quality.

---

---

# Tech Debt

Known issues organized by area. Items here can be promoted to "Current Projects" when prioritized.

## Server

### Engine baseline actions (deferred from Phase 2.5)

Follow-on mini-sprint after the engine boundary is locked. Adds the remaining VTT-universal action types to the placeholder engine. Each item is the wire schema in `shared/`, the engine handler, and the renderer/UI affordance.

- [ ] **`drawing.*`** — create/update/delete persistent and ephemeral drawings (lines, shapes, freehand). Render layer in `client/src/render/pixi/layers/`.
- [ ] **`measurement.*`** — private and shared ruler/AoE measurements. Audience filter: private = originating seat only; shared = everyone.
- [ ] **`label.*`** — text labels pinned to the scene.

### Snapshot chain (auto-trigger + pruning — deferred from Phase 3)

- [ ] **Auto-snapshot trigger.** Engine emits a snapshot every N events. Trigger threshold TBD from real event-volume data. Implemented inside `PlaceholderEngine`; wired through `Storage.putSnapshot`.
- [ ] **Snapshot pruning.** Retain the latest K snapshots per campaign; prune older rows. Schema already supports multi-row retention (`(campaign_id, seq)` PK); pruning logic not yet implemented.

### Security

- **Medium:**
  - [ ] CSRF token comparison uses `===` instead of `timingSafeEqual` in [admin-auth.ts](../server/src/routes/admin-auth.ts#L774)
  - [ ] No `lastUsedAt` update on session validation (column exists but never updated)
  - [ ] Campaign GET endpoints unauthenticated [campaigns.ts](../server/src/routes/campaigns.ts#L24)
  - [ ] Setup PIN generation has modulo bias [setup-pin.ts](../server/src/auth/setup-pin.ts#L31) (256 % 30 ≠ 0)

- **Low:**
  - [ ] No validation of seat `role` against enum in [seats.ts](../server/src/routes/seats.ts#L87)
  - [ ] No validation of `rolesGranted` array values in [invites.ts](../server/src/routes/invites.ts#L98)
  - [ ] No validation of `expiresIn` range in [invites.ts](../server/src/routes/invites.ts#L98)
  - [ ] No invite PIN strength validation

### WebSocket

- [ ] No message size limit (`maxPayload`)
- [ ] No message schema validation beyond `.type` check
- [ ] No rate limiting on messages
- [ ] **Multi-connection-per-seat support**: server currently assumes (or will assume) one WS per seat. Refactor to keep `Set<WebSocket>` per `(accountId, seatId)` and broadcast state changes to all. See [realtime-ws.md](../docs/protocols/realtime-ws.md) "Multiple Connections Per Seat" section.
- [ ] **Server-authoritative prompt state**: prompts should be stored with explicit `status: 'pending' | 'resolved' | 'cancelled'` and broadcast as state changes, not delivered as one-shot messages. Required for multi-device safety. See [auth-join-flow.md](../docs/components/auth-join-flow.md) and [realtime-ws.md](../docs/protocols/realtime-ws.md).
- [ ] **Idempotent action handlers**: actions referencing resolved/cancelled prompts must return no-op, not error.

### Auth & Sessions

- [ ] **`must_change_password` enforcement**: Phase 2.6 sets the flag when admin resets a player password, but the login flow does not enforce a forced-change screen. Enforce at `POST /api/auth/login` (and on WS connect as a secondary check).
- [ ] **Silent refresh on WS auth close**: client attempts one `POST /api/auth/refresh` before falling back to `/play/login`.
- [ ] **Admin password reset via filesystem flag**: `DATA_DIR/admin-reset.flag` triggers re-running initial setup on next startup. Admin login page should expose "I forgot my password" with instructions.
- [ ] **PIN cooldown change**: per-invite PIN cooldown is 60s (not "until expiry") so a typo'd PIN doesn't dead-end the invite.
- [ ] **Rate-limit productionization**: Phase 2.6 lands a simple in-memory rate-limit bucket on `POST /api/auth/login`. Replace with `@fastify/rate-limit` for persistence across restarts and distributed deployments.
- [ ] **Audit log surface**: claims, login failures, password resets, and session revocations should be visible in the admin Accounts tab.

### Code Quality

- [ ] Unbounded campaign DB pool — no LRU eviction or idle timeout [sqlite-storage.ts](../server/src/storage/sqlite-storage.ts#L200)
- [ ] No database migrations — schema applied via `CREATE TABLE IF NOT EXISTS`
- [ ] TransactionStorage methods throw `'not implemented'` [sqlite-storage.ts](../server/src/storage/sqlite-storage.ts#L527-L541)
- [ ] Storage facade hardcodes SqliteStorage implementation [storage.ts](../server/src/storage/storage.ts#L301) — can't inject backends for testing
- [ ] `esbuild` in devDependencies but unused (may be dead dependency)
- [ ] Drop `entities` table and corresponding `StorageBackend` methods (`createEntity`, `getEntity`, `updateEntity`, `deleteEntity`, `listEntities`) — engine no longer uses them (switched to snapshot + event-replay in Phase 3); no other callers exist

### Input Validation

- [ ] No max length on campaign name [campaigns.ts](../server/src/routes/campaigns.ts#L63)
- [ ] `rolesGranted` and `expiresIn` not validated in invite creation
- [ ] Seat role accepts any string instead of enum validation

## Client

### API Layer

- [ ] All API sub-clients throw `NOT_IMPLEMENTED` — `HttpClient` built but never wired [http.ts](../client/src/api/http.ts#L141)
- [ ] `Api.http` field created but never passed to sub-clients [http.ts](../client/src/api/http.ts#L419)
- [ ] Admin components bypass API layer with raw `fetch()`:
  - [ ] AdminLogin [AdminLogin.svelte](../client/src/ui/admin/AdminLogin.svelte#L36)
  - [ ] AdminSetup [AdminSetup.svelte](../client/src/ui/admin/AdminSetup.svelte#L40)
- [ ] **Admin panel Campaigns/Accounts tabs use mock data** — wire `AccountDetail`, `CampaignDetail`, `SeatSettings` to real API endpoints once the admin API layer is built [admin.svelte.ts](../client/src/state/admin.svelte.ts)
- [ ] WebSocket message handlers all stub (console.log only) [ws.ts](../client/src/api/ws.ts#L261-L342)
- [ ] `adminFetch` in state layer should arguably be in API layer [admin.svelte.ts](../client/src/state/admin.svelte.ts#L55)

### Error Handling

- [ ] AdminLogin error branch calls `response.json()` without try/catch [AdminLogin.svelte](../client/src/ui/admin/AdminLogin.svelte#L94)
- [ ] AdminSetup same issue [AdminSetup.svelte](../client/src/ui/admin/AdminSetup.svelte#L104)

### Accessibility

- [ ] AdminTree missing ARIA tree roles [AdminTree.svelte](../client/src/ui/admin/AdminTree.svelte#L81)
- [ ] Emoji-only buttons lack `aria-label` throughout admin UI

### Stub Implementations

- [ ] Domain module empty [domain/index.ts](../client/src/domain/index.ts)
- [ ] Util module empty [util/index.ts](../client/src/util/index.ts)
- [ ] `campaign.setInitialState()` has TODO [campaign.svelte.ts](../client/src/state/campaign.svelte.ts#L27)
- [ ] `campaign.applyDelta()` is stub [campaign.svelte.ts](../client/src/state/campaign.svelte.ts#L35)
- [ ] **Hex grid** — `GridLayer` only draws square grids; `gridType: 'hex'` is accepted but silently falls back to no grid [GridLayer.ts](../client/src/render/pixi/layers/GridLayer.ts)
- [ ] Several floating window and drawer components are placeholder stubs with hardcoded content: `CharacterSheet`, `DocumentReader`, `ItemInspector`, `InitiativeModal`, `CampaignPrepDrawer`, `GameSettingsDrawer`

### Input System

The current `CanvasInputController` works but was built incrementally and has known structural problems. It is good enough until tool modes or touch support are actually required. Scope of the redesign still TBD. Don't touch this one without an actual design.

### Renderer

- [ ] **Token hit detection uses AABB bounds, not shape**: `TokenLayer.hitTestToken` uses `Sprite.getBounds()` (axis-aligned bounding box) for pointer events. This produces square hit areas for circular/non-rectangular tokens and incorrect hit areas for rotated tokens. Should be replaced with shape-accurate hit testing — either `Sprite.containsPoint()` (PixiJS inverse-transform point check, works for circles and rotation) or a polygon hull for non-convex cases. Note: `containsPoint` expects canvas-relative coordinates (`e.offsetX/Y`), not viewport-relative (`e.clientX/Y`). See [TokenLayer.ts](../client/src/render/pixi/layers/TokenLayer.ts#L120) and [canvas-input-controller.ts](../client/src/app/canvas-input-controller.ts).

### Notifications

- [ ] **Notification 2×2 model (handled in Phase 2.5)**: `origin: 'server' | 'client'` × `lifetime: 'persistent' | 'ephemeral'`. Prompts are `(server, persistent)` and the client stores references to prompt state by `promptId`, not copies. Toasts are `(client, ephemeral)`. Server-driven feed entries ("X attacked Y") are `(server, ephemeral)`. The `(client, persistent)` cell is reserved (offline indicators, app errors). See [Engine Boundary Refactor](#engine-boundary-refactor-phase-25) for the locked decision and [auth-join-flow.md Open Issues](../docs/components/auth-join-flow.md#open-issues-deferred-for-later-design).

### Console Logging

- [ ] Pervasive `console.log` in production paths across all API and state files
- [ ] No log-level gating

### Deferred Features

These play UI features were deferred from the Play UI Overhaul sprint, pending infrastructure that doesn't exist yet.

- [ ] **Radial menu** — context radial on token right-click; custom SVG/CSS; defer until renderer + token system exist
- [ ] **Pop-out windows** — detach a floating window into a separate browser window for multi-monitor setups
- [ ] **Drag-and-drop from drawers** — drag actors from Token Library to map; drag Compendium items onto character sheets; defer until renderer + character sheet system exist
- [ ] **OverlayLayer content** — the world-container slot above tokens ([OverlayLayer.ts](../client/src/render/pixi/layers/OverlayLayer.ts)) is reserved but empty; decide what goes here (rain/snow/particle emitters, AoE fog, etc.) and implement when the effect system is designed

### Auth & Account UI (deferred from Phase 2.6)

- [ ] **`/play/account` real settings UI**: password change, active sessions list (view and revoke devices), change-username. Placeholder page ships in Phase 2.6.
- [ ] **`/play/login` forgot-password flow**: support admin-configured contact info in the "Ask your admin" modal instead of a generic message. Requires a server-side contact-info setting.
- [ ] **`/play/<campaignId>` no-access page**: friendly error when the authenticated user has no seat in the requested campaign, instead of silently redirecting to `/play`.
- [ ] **Discord/Slack preview optimization for `/join/<token>`**: bot user-agents fetch the URL on paste. Serve a lightweight meta-tag HTML page for bots; deliver the SPA shell for real browsers.

## Documentation

### Drift from Implementation

- [ ] Cookie `sameSite` inconsistent (some docs say Lax, code is Strict)
- [ ] Invite routes don't match docs (`/api/seats/:id/invites` vs `/api/campaigns/:id/invites`)
- [ ] Storage constructor signature differs between docs and implementation
- [ ] server.md references wrong filenames and directories

### Missing Documentation

- [ ] Server-served SPA fallback behavior [server.ts](../server/src/server.ts#L136)
- [ ] CORS configuration [server.ts](../server/src/server.ts#L82)
- [ ] `GET /api/info` endpoint [health.ts](../server/src/routes/health.ts#L37)

## Build & Infrastructure

### Docker (handled in Phase 5)

- [ ] Workspace stages may fail (missing sibling package.json)
- [ ] Production image retains build tools (`python3 make g++`)
- [ ] Redundant dual builds (local + Docker)

### Scripts

- [ ] build-docker.js redundancy (handled in Phase 5)
- [ ] build-exe.js wrong HOST default (handled in Phase 5)

### Configuration

- [ ] `declaration: true` generates unnecessary `.d.ts` files [tsconfig.json](../server/tsconfig.json)
- [ ] No `noUncheckedIndexedAccess` in tsconfig
- [ ] `moduleResolution: "bundler"` may conflict with bare `.js` imports

### Dependency Issues

- [ ] No Prettier config
- [ ] No `@fastify/rate-limit` — hand-rolled solution with issues

### Legal & Metadata

- [ ] Add per-file `SPDX-License-Identifier: AGPL-3.0-or-later` headers to all source files (`.ts`, `.svelte`, `.js`, `.css`). Baseline is covered by repo-level [LICENSE](../LICENSE) and `license` field in each `package.json`; per-file headers are nice-to-have and tracked here so we don't forget. See [ADR 008](decisions/008-licensing-and-contributions.md).

## Testing

- [ ] **E2E with Playwright** — `e2e/` directory exists at workspace root. Priority journeys:
  - Auth flow: fresh DB → admin setup → create campaign + invite → `/join/<token>` register → land on `/play/<id>`.
  - Session re-auth: clear cookies → revisit `/play/<id>` → bounced to `/play/login?returnTo=...` → login → back at `/play/<id>`.
  - Admin smoke: admin tree navigation; Accounts node lists players; reset-password forces re-login; revoke-sessions kicks active player.
  - Plus: campaign create, invite generate/revoke, seat management.
  - Deferred until WS message handlers and renderer are non-stub.
- [ ] No test-specific mocks (MockResolveContext, TestRngProvider, TestClock) — deferred until ruleset engine

---

# Future Milestones Wishlist

Features worth building eventually to make HearthVTT a compelling, complete VTT. None are currently in progress. When prioritizing, promote an item (or a group of related items) to "Current Projects" with a detailed, step-by-step plan.

---

## In-Game Note-Taking (Markdown Documents)

Players and GMs need a place to record session notes, lore, and reminders without leaving the VTT. A lightweight markdown editor integrated into the floating window system would cover this.

**Key characteristics:**

- View mode (rendered markdown) and edit mode (plain text), toggled in the window title bar.
- Documents are stored in the campaign (a `documents` table in SQLite, scoped to campaign).
- "Share" action sends a document to one or more seats — read-only or read-write, based on the sharer's intent.
- The `DocumentReader` floating window stub is already scaffolded — this feature fills it in.

**Implementation path:**

- Add a `documents` table to `SqliteStorage` (id, campaign_id, title, content, owner_seat_id, created_at, updated_at).
- Add CRUD routes under `/api/campaigns/:id/documents`.
- Add a `share_document` WS message from server to target seat(s).
- Client: extend `DocumentReader.svelte` with a markdown render/edit toggle; back it with a `DocumentStore`.
- Pick a small, dependency-free markdown renderer (e.g. `marked` or `micromark`) — add an ADR if a new dependency is introduced.

---

## Actor Pill Quick Actions

The actor pill (sidebar card for a scene actor) should surface a pinned list of quick actions the controlling player can trigger without opening the full character sheet — e.g. "Attack", "Cast Spell", "Use Potion".

**Key characteristics:**

- Actions available in the quick-action list are drawn from the actor's loaded ruleset (actions the actor actually has).
- The player chooses which actions to pin; the pinned list is stored in actor state.
- Permissions follow seat ↔ actor permissions: if a seat can control the actor, they can see and trigger quick actions for it.
- Triggering a quick action dispatches it through the normal GameEngine action pipeline.

**Implementation path:**

- Requires the GameEngine and ruleset action dispatch pipeline to be non-stub.
- Actor state in `CampaignState` gains a `pinnedActions: string[]` field (array of ruleset action IDs).
- The actor pill renders a collapsible "Quick Actions" section below the HP bar.
- Clicking a quick action dispatches an `action` WS message to the server.

---

## Actor Pill List / Compact Toggle

The actor pill sidebar should support switching between a detailed list view and a compact view (icon + name only) for sessions with many actors on screen. Pure client-side UI preference.

**Key characteristics:**

- Toggle in the sidebar header.
- State persisted in `UiStore` (not campaign state — it's a per-client display preference).
- Compact view shows token image, name, and a minimal HP bar only.

---

## Onboarding Tutorials

New users should be guided through their first session rather than having to reverse-engineer the interface. Separate tours for GMs and players make sense because their workflows differ meaningfully.

**Key characteristics:**

- **Player tutorial:** moving tokens, rolling dice, chat log, opening the character sheet, signaling readiness.
- **GM tutorial:** creating a campaign, inviting players, setting up a scene, placing tokens, using fog of war, managing the initiative tracker.
- Tours are dismissible and re-triggerable from the help menu.
- Implemented as a step-based overlay (highlight element + tooltip) within the normal UI — no separate tutorial mode needed.

**Implementation path:**

- A lightweight `TutorialStore` tracks which steps have been seen (persisted to `localStorage`).
- Each step specifies a CSS selector or component ref to highlight, a tooltip message, and a "next" trigger (click, keystroke, or explicit "Next" button).
- No server changes needed — entirely client-side.
- Two entry points: auto-triggered on first login (dismissible), and a "Take a tour" button in the help / settings menu.

---

## "It's Your Turn" Indicator

When the initiative tracker advances to a player's token, they should get an unmissable signal — important for online sessions where players are multitasking.

**Key characteristics:**

- Visual indicator on the active token in the WebGL layer (animated pulse, glowing border, etc.).
- Optional browser notification (Web Notifications API, opt-in) for players who have tabbed away.
- GM can manually "ping" a seat outside of initiative order.
- Precise UX TBD — warrants playtesting before locking down the design.

**Implementation path:**

- Requires the initiative tracker and GameEngine turn management to be non-stub.
- Server emits a `turn_started` WS message with the active seat and token IDs when the tracker advances.
- Renderer checks `campaignState.currentTurn` and applies a highlight pass to the active token sprite.
- Browser notification: client requests `Notification.permission` on game join; fires a notification on `turn_started` when the tab is not focused.

---

## Quick-Start Demo Campaign

A ready-to-play campaign bundled with HearthVTT to get new users into actual play immediately. Also serves as a product demo for anyone evaluating the software.

**Key characteristics:**

- Based on D&D 5e SRD content (no licensing issues).
- One complete encounter — a tavern brawl or similar scene: visually interesting, quick to resolve, representative of a typical session.
- Pre-built map with walls, lighting, and fog of war configured.
- Several pregenerated actors (fighter, rogue, wizard, etc.) with full stat blocks and ruleset-defined actions.
- Actors are not pre-assigned to seats — the GM assigns them at the table as players join.
- Ships as a `.campaign` file checked into `content/demo/`, importable from the admin dashboard.

**Implementation path:**

- Requires the `.campaign` import/export format and the renderer/fog system to be non-stub.
- Add an "Import demo campaign" button to the admin dashboard.
- Write a short "Getting Started" guide in `docs/` that walks through the demo campaign as the first experience.

---

## Map Pins

GMs (and optionally players with permission) should be able to drop pins on the map canvas that link to readable documents — location descriptions, NPC notes, hidden lore, etc.

**Key characteristics:**

- Pins are placed at a world-space coordinate on the active scene.
- Each pin links to a document (see In-Game Note-Taking above) or a plain-text label.
- GM-only pins are invisible to players; shared pins are visible to all.
- Clicking a pin opens its linked document in a `DocumentReader` floating window.
- Placement UX TBD — likely right-click map → "Place pin".

**Implementation path:**

- Depends on the document system above.
- Add a `map_pins` table to `SqliteStorage` (id, scene_id, x, y, document_id, visible_to_players).
- Renderer adds a `PinsLayer` above the map but below tokens; renders pin icons at world coordinates.
- Clicking a pin dispatches to the UI layer (not the renderer) to open the linked document window.

---

## Multi-Track Ambient Audio (Jukebox Mixer)

Background music and ambient sound design are a major part of VTT atmosphere. Rather than a simple single-track jukebox, HearthVTT should support multiple concurrent audio layers that the GM can mix in real time — e.g. a persistent "forest ambience" layer that crossfades into "battle drums" when combat starts.

**Key characteristics:**

- GM defines named audio layers (e.g. "Ambience", "Music", "Combat").
- Each layer has its own volume slider and a track queue.
- GM uses a mixer panel to adjust layer volumes and trigger crossfades between tracks.
- Audio is synced to clients via playback commands over WS (asset references + timing), not by streaming audio data.
- Audio assets stored in campaign `AssetStore`.

**Note:** Pocket Bard already does multi-track ambient audio well as an external tool. This is a deliberate "good enough, built-in" version — lightweight and zero-dependency for the GM — not an attempt to replicate their full feature set.

**Implementation path:**

- Requires the `AssetStore` interface to be implemented.
- Server emits `audio_command` WS messages (play, pause, stop, set_volume, crossfade) to all seats.
- Client: Web Audio API player with one `GainNode` per layer, each fed from an `<audio>` element.
- GM UI: a "Jukebox" drawer or floating window with per-layer controls and a crossfade slider.

---

## Readable Documents Attached to Tokens

A token should optionally have an attached readable document — a stat block summary, flavor text, a letter the character is carrying, etc. The GM (or controlling seat) can share it via the token's context menu.

**Key characteristics:**

- A token may have zero or one attached document (linked to the document system above).
- The token context menu gains a "Share document" option, visible to the GM or the controlling seat.
- Receiving a shared document opens it in a `DocumentReader` floating window for the target seat.
- Relationship to actor data (ruleset-defined stat blocks vs. freeform attached documents) is TBD — may evolve once the ruleset engine is more concrete.

**Implementation path:**

- Depends on the document system and the token context menu (radial menu, currently deferred).
- Actor state gains an optional `attachedDocumentId: string | null` field.
- Sharing dispatches a `share_document` WS message from the server to target seats.

---

## Grid Alignment Tool (GM-Only Map Setup)

Aligning the application grid to a map image is one of the most frustrating parts of VTT session prep. The naive approach — independent sliders for scale, x-offset, and y-offset — creates a painful feedback loop: adjusting scale shifts the offset, re-adjusting the offset reveals scale is still wrong, repeat until you throw your keyboard. This feature replaces that with a purpose-built calibration mode centered on shortening the iteration loop until it stops being annoying.

**Key design principle:** Iteration loops are necessary for precise convergence, but they should be as short as possible. The goal is not to eliminate interaction, but to eliminate wasted interaction.

**Planned approach: Anchor + scale pivot with sensitivity levels**

The GM enters calibration mode; the grid turns translucent red and a draggable anchor point appears. The workflow:

1. Drag the anchor to a known grid intersection on the map image.
2. Use a scale control to adjust grid cell size — **scale always pivots around the anchor**, so the anchor stays fixed as the grid expands or contracts. This eliminates the position/scale coupling that causes the death spiral.
3. Sensitivity levels allow progressively finer adjustments: coarse (e.g. ±50%), medium (±5%), fine (±0.5%). The GM can converge quickly without overshooting, and the smallest sensitivity level is precise enough for any map.
4. Confirm → grid fades to a subtle translucent in-play style.

Sensitivity levels are the key UX mechanism: they make the single-knob approach sufficient for 99% of cases. The exact sensitivity values and control style (buttons vs. a step-size dropdown vs. holding modifier keys while dragging) should be playtested before being locked down.

**Other approaches considered:**

- **Bounding-box calibration:** Drag a rectangle over N×M cells, type in the cell count, app back-calculates. Fast for square grids with obvious rectangular regions, but any misalignment in the drag gesture requires starting over. Mitigated by adding adjustment handles to the bounding box after placement, but it's unclear this saves meaningful time over Option 1. Deferred until Option 1 is polished — revisit then.
- **Two-anchor drag:** Place two anchors on known grid intersections; app constrains them to the same x or y axis (no rotation — grids are assumed straight; if a map designer rotated their grid, that is a them problem). Shorter iteration loop than naive sliders, but still more fiddly than anchor + sensitivity levels, especially on dense maps (e.g. regional exploration maps with fine hex grids). Deferred; revisit alongside bounding-box after Option 1 ships.
- **Two-point correspondence:** Click two app grid intersections, then the corresponding map points; app solves scale + offset deterministically. Faster than two-anchor drag, but a misclick means starting over. Rejected — no iteration path.

**Key characteristics:**

- GM-only; not accessible to players.
- Calibration mode entered from scene settings or a dedicated toolbar button.
- Grid renders in a distinct "calibration" color (translucent red) during setup vs. normal in-play style (subtle gray).
- Calibration result stored as `gridSize: number`, `gridOffsetX: number`, `gridOffsetY: number` on the Scene.
- Supports both square and hex grids (the anchor-pivot approach is grid-topology-agnostic).
- Grid rotation is not supported — maps with rotated grids should be rotated at the image level before import.

**Implementation path:**

- Renderer exposes `setCalibrationMode(active: boolean)`, which toggles a `CalibrationLayer` above the normal grid.
- `CalibrationLayer` renders the red grid and draggable anchor point as screen-space PixiJS Graphics.
- Anchor drag updates `gridOffsetX/Y`; scale control updates `gridSize`; scale math pivots around the anchor's world position. Both changes re-render `CalibrationLayer` live.
- Sensitivity levels adjust the step size of the scale control; exact values TBD from playtesting.
- On confirm: `patch_scene` action dispatched to server; `CalibrationLayer` hidden; normal grid re-renders with new values.

---

# Bugs

## UI

- [ ] Admin setup page extends past the bottom of the screen and isn't scrollable.
- [ ] Play UI: zooming the map using the slider in the quick status bar zooms into the top left corner, should zoom on center of map canvas.

## Backend

## GameEngine and RulesetRuntime

## Build pipeline
