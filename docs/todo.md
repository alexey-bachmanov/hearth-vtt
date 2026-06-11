# Todo List Strategy

**Workflow:** Items in "Tech Debt" and "Bugs" represent known issues organized by category. Long-term objectives are detailed in [docs/implementation-strategy.md](../docs/implementation-strategy.md). When we decide to tackle a category, we **promote it to "Current Projects"** with a comprehensive, step-by-step plan. This prevents plans from rolling out of context during implementation.

As work completes, check off tasks.

---

# Current Projects

> ⚠️ **CSP BLOCKER:** Any feature rendering user-supplied text — chat, journals, handouts, character bios, or ruleset custom UI — **must** land after strict Content-Security-Policy enforcement and input sanitization. Before building any such feature, ask: "Does this render user text?"

## Engine v0.2 — Schema De-D&D-ification

Strip all D&D-specific and premature type assumptions from `shared/`, `server/src/domain/engine/`, and `server/src/storage/` tests. Replace engine-opaque gameplay data with `data: Record<string, unknown>` blobs on Actor, Token, Scene. Remove unused types (EntityRef, SourceRef, Items, Effects from enums, deprecated `mapImageUrl`). Add `actor.replaceData`, `token.replaceData`, `scene.replaceData` intents. Break the client intentionally — rebuild in a separate pass.

### Phase 1: Shared Types Cleanup

**Step 1:** Update `shared/src/entities.ts` — Actor schema and type:
- [x] Remove fields: `type`, `hp`, `ac`, `level`, `class`, `isConcentrating`, `conditions`
- [x] Add field: `data: z.record(z.string(), z.unknown())` (Zod) / `data: Record<string, unknown>` (TS)
- [x] Update JSDoc to remove D&D-specific references

**Step 2:** Update `shared/src/entities.ts` — Token schema and type:
- [x] Add `name: z.string()` (required)
- [x] Add `imageUrl: z.string()` (required)
- [x] Add `data: z.record(z.string(), z.unknown())`

**Step 3:** Update `shared/src/entities.ts` — Scene schema and type:
- [x] Remove `mapImageUrl: z.string().optional()`
- [x] Add `data: z.record(z.string(), z.unknown())`

**Step 4:** Update `shared/src/enums.ts`:
- [x] Remove `'item'` and `'effect'` from `entityTypeSchema` — result: `['actor', 'token', 'workflow', 'scene']`

**Step 5:** Delete `shared/src/refs.ts`:
- [x] Remove `EntityRef`, `SourceRef`, `entityRefSchema`, `sourceRefSchema` — file has zero consumers

**Step 6:** Update `shared/src/index.ts`:
- [x] Remove `entityRefSchema`, `EntityRef`, `sourceRefSchema`, `SourceRef` exports
- [x] Verify updated `actorSchema`, `tokenSchema`, `sceneSchema`, `entityTypeSchema` are re-exported

**Step 7:** Update `shared/src/engine.ts` — comments only:
- [x] Lines 72, 80: change "hidden HP" example to generic "per-seat actor data visibility" text

### Phase 2: Engine Types Update

**Step 8:** Update `server/src/domain/engine/v0-2/types.ts` — `ResolverIntent` union:
- [ ] `actor.create`: add `data: Record<string, unknown>` (required), add `seatPermissions?: Record<string, 'control' | 'read'>`
- [x] `token.create`: add `data: Record<string, unknown>` (required)
- [x] `scene.create`: add `data: Record<string, unknown>` (required)
- [x] Add `{ kind: 'actor.replaceData'; actorId: string; data: Record<string, unknown> }`
- [x] Add `{ kind: 'token.replaceData'; tokenId: string; data: Record<string, unknown> }`
- [x] Add `{ kind: 'scene.replaceData'; sceneId: string; data: Record<string, unknown> }`

**Step 9:** Verify `ResolverApi` in `types.ts`:
- [x] `getActor`, `getToken`, `getScene` return types auto-update from shared — no explicit changes needed

### Phase 3: Intent Processor Update

**Step 10:** Update `intent-processor.ts` — `actor.create` case:
- [x] Change `newActor` from `{ id, name, type: 'npc', hp: {...}, ac: 10, conditions: [], ...data as Partial<Actor> }` to `{ id, name, seatPermissions: {}, data: intent.data }`
- [x] Update stored/wire event data

**Step 11:** Update `intent-processor.ts` — `token.create` case:
- [x] Change construction to: `{ id, actorId, sceneId, position, size: 1, name: intent.name ?? '', imageUrl: intent.imageUrl ?? '', hidden: intent.hidden ?? false, data: intent.data }`

**Step 12:** Update `intent-processor.ts` — `scene.create` case:
- [x] Remove `...(data as Partial<Scene>)` spread — Scene defaults are hard-coded, `data` goes into the new `data` field

**Step 13:** Add three new `processIntent` switch cases:
- [x] `actor.replaceData`: state mutates `state.actors.get(actorId).data = intent.data`; stored type `actor.dataReplaced`; wire type `actor.dataReplaced`
- [x] `token.replaceData`: same pattern for tokens
- [x] `scene.replaceData`: same pattern for scenes
- [x] Each no-ops on missing entity

### Phase 4: Baseline Resolvers Update

**Step 14:** Update `baseline-resolvers.ts` — `actor.create` resolver:
- [x] Extract `data` and `seatPermissions` from args; validate `data` is an object
- [x] Pass through to intent: `{ kind: 'actor.create', actorId, name, data, ...(seatPermissions ? { seatPermissions } : {}) }`

**Step 15:** Update `baseline-resolvers.ts` — `token.create` resolver:
- [x] Extract `data` from args; validate `data` is an object
- [x] Pass through to intent: `{ kind: 'token.create', tokenId, actorId, sceneId, position, name, imageUrl, hidden, data }`

**Step 16:** Update `baseline-resolvers.ts` — `scene.create` resolver:
- [x] Extract `data` from args; validate `data` is an object
- [x] Pass through to intent

**Step 17:** Add three new resolvers to `baselineActions`:
- [x] `actor.replaceData`: GM-gated, validates actorId exists, validates data is object, returns replace-data intent
- [x] `token.replaceData`: same pattern
- [x] `scene.replaceData`: same pattern

### Phase 5: Engine Review

**Step 18:** Review `engine-v0-2.ts` for inline entity construction:
- [x] `getView`: still filters by `seatId in actor.seatPermissions` — correct
- [x] `open()`: snapshot deserialization auto-updates with new types
- [x] `ResolverApi` construction: return types auto-update

**Step 19:** Review `snapshot-blob.ts`:
- [x] Uses `Record<string, Actor>` etc. — auto-updates. No changes needed.

### Phase 6: Ruleset & Storage Test Updates

**Step 20:** Update `ruleset-dnd.ts`:
- [x] Verify `token.move` resolver doesn't reference removed Actor fields (hp, ac, etc.)
- [x] If it does, change to `actor.data.hp` etc.

**Step 21:** Update `sqlite-storage.test.ts`:
- [x] Remove or update tests using `type: 'item'` EntityType

**Step 22:** Update `shared/src/example.test.ts`:
- [x] Fix any references to removed Actor fields or removed types

### Phase 7: Client Break (Minimal)

**Step 23:** Update client files:
- [x] `ActorPill.svelte`: comment out D&D-specific rendering (hp bar, ac, level/class, conditions, concentration), keep name display only
- [x] `ActorPill.test.ts`: comment out D&D-specific tests
- [x] `window/index.ts`: comment out `InitiativeModal` export
- [x] `BackgroundLayer.ts`: remove `scene?.mapImageUrl` fallback, use only `scene?.background?.url`
- [x] `campaign.svelte.test.ts`: remove `mapImageUrl: ''` from scene data
- [x] `seatPermissions.svelte.test.ts`: remove `mapImageUrl: ''` from scene data
- [x] Grep for any other references to removed fields and update

**Step 24:** Client build verification:
- [x] `cd client && npx tsc --noEmit` — expected failures only in pre-existing GameEvent/PlayLayout/PlayLogin issues (not from our changes)
- [x] No UNINTENTIONAL breaks (map rendering, token display, etc.)

### Phase 8: Build & Test Verification

**Step 25:** Shared package:
- [x] `cd shared && npm run build && npm test`

**Step 26:** Server package:
- [x] `cd server && npx tsc --noEmit`
- [x] `cd server && npm test`

**Step 27:** Full verification grep:
- [x] No `\bhp\b`, `\bac\b`, `\blevel\b`, `\bclass\b`, `isConcentrating`, `\bconditions\b` in .ts/.svelte files (except commented-out code and design docs)
- [x] No `mapImageUrl` outside design docs
- [x] No `EntityRef`/`SourceRef` outside design docs
- [x] No `'item'` in EntityType context outside design docs

### Relevant files

- `shared/src/entities.ts` — Actor, Token, Scene schemas
- `shared/src/enums.ts` — EntityType enum
- `shared/src/refs.ts` — **DELETE**
- `shared/src/index.ts` — barrel exports
- `shared/src/engine.ts` — comment updates
- `server/src/domain/engine/v0-2/types.ts` — ResolverIntent
- `server/src/domain/engine/v0-2/intent-processor.ts` — CRUD + replaceData cases
- `server/src/domain/engine/v0-2/baseline-resolvers.ts` — create + replaceData resolvers
- `server/src/domain/engine/v0-2/ruleset-dnd.ts` — verify
- `client/src/ui/canvas/ActorPill.svelte` — comment out D&D rendering
- `client/src/ui/canvas/ActorPill.test.ts` — comment out D&D tests
- `client/src/ui/window/index.ts` — comment out InitiativeModal
- `client/src/render/pixi/layers/BackgroundLayer.ts` — remove mapImageUrl
- `client/src/state/campaign.svelte.test.ts` — remove mapImageUrl
- `client/src/state/seatPermissions.svelte.test.ts` — remove mapImageUrl

### Decisions

- Actor: `{ id, name, seatPermissions, data: Record<string, unknown> }` — no more `type`, `hp`, `ac`, `level`, `class`, `isConcentrating`, `conditions`
- Token: added `name`, `imageUrl`, `data` — all required. `name`/`imageUrl` default to `""` in intent processor when omitted
- Scene: removed `mapImageUrl`, added `data`
- `actor.create` intent: `data` required, `seatPermissions` optional (defaults `{}`)
- `token.create`/`scene.create` intents: `data` required
- Three new replace-data intents: whole-blob replacement, no partial update
- Engine validates JSON.parse on `data` at intent-processing boundary — malformed data crashes loud (ruleset bug)
- Client intentionally broken — ActorPill shows name only, InitiativeTracker removed
- No snapshot migration — dev DB throwaway
- `data: Record<string, unknown>` not `data: string` — avoids serialization tax at every boundary

### Alternatives Rejected

- **`data: string` instead of `Record<string, unknown>`** — adds parse/stringify at resolver, engine, and client boundaries with no benefit
- **Keeping `mapImageUrl` as deprecated** — code burden, zero meaningful consumers
- **Keeping EntityRef/SourceRef "just in case"** — failure pattern #1 (premature abstraction)
- **Pill display descriptor DSL as interim** — ADR 011 déjà vu risk; approach C (ruleset client components) is the real solution
- **Keeping Items/Effects in EntityType** — speculative architecture without concrete consumers

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

Read path (load snapshot + replay events) shipped in Phase 3. Write path (auto-trigger + pruning) deferred pending real event-volume data.

- [ ] **Auto-snapshot trigger.** Engine emits a snapshot every N events. Trigger threshold TBD from real event-volume data. Implemented inside `PlaceholderEngine`; wired through `Storage.putSnapshot`.
- [ ] **Snapshot pruning.** Retain the latest K snapshots per campaign; prune older rows. Schema already supports multi-row retention (`(campaign_id, seq)` PK); pruning logic not yet implemented.

### Security

- **Medium:**
  - [ ] No `lastUsedAt` update on session validation (column exists but never updated)
  - [ ] Campaign GET endpoints unauthenticated [campaigns.ts](../server/src/routes/campaigns.ts#L24)
  - [ ] Setup PIN generation has modulo bias [setup-pin.ts](../server/src/auth/setup-pin.ts#L31) (256 % 30 ≠ 0)

- **Low:**
  - [ ] No validation of seat `role` against enum in [seats.ts](../server/src/routes/seats.ts#L87)
  - [ ] No validation of `rolesGranted` array values in [invites.ts](../server/src/routes/invites.ts#L98)
  - [ ] No validation of `expiresIn` range in [invites.ts](../server/src/routes/invites.ts#L98)
  - [ ] No invite PIN strength validation
  - [ ] Normalize `clearCookie` call options in [`auth.ts`](../server/src/routes/auth.ts) and [`admin-auth.ts`](../server/src/routes/admin-auth.ts) to match `setCookie` flags (`httpOnly`, `secure`, `sameSite`) for code-reading consistency.
  - [ ] Replace `console.log` in `cleanupExpiredRateLimits()` with debug-level logging in [`admin-auth.ts`](../server/src/routes/admin-auth.ts).
  - [ ] Verify `startRateLimitCleanup()` in [`admin-auth.ts`](../server/src/routes/admin-auth.ts) is called from server initialization, or remove if dead code.

### WebSocket

- [ ] No message size limit (`maxPayload`)
- [ ] No message schema validation beyond `.type` check
- [ ] No rate limiting on messages
- [ ] **Multi-connection-per-seat support**: server currently assumes (or will assume) one WS per seat. Refactor to keep `Set<WebSocket>` per `(accountId, seatId)` and broadcast state changes to all. See [realtime-ws.md](../docs/protocols/realtime-ws.md) "Multiple Connections Per Seat" section.
- [ ] **Server-authoritative prompt state**: prompts should be stored with explicit `status: 'pending' | 'resolved' | 'cancelled'` and broadcast as state changes, not delivered as one-shot messages. Required for multi-device safety. See [auth-join-flow.md](../docs/components/auth-join-flow.md) and [realtime-ws.md](../docs/protocols/realtime-ws.md).
- [ ] **Idempotent action handlers**: actions referencing resolved/cancelled prompts must return no-op, not error.

### Auth & Sessions

- [ ] **PIN cooldown change**: per-invite PIN cooldown is 60s (not "until expiry") so a typo'd PIN doesn't dead-end the invite.
- [ ] **Device-level session deduplication**: one refresh cookie per browser/device (requires a device label on sessions, e.g. user-agent hash stored at login; dedup logic in `/login` and `/claim-invite`). Prevents session accumulation when the same device logs in repeatedly without clearing cookies.
- [ ] **Active devices management UI**: surface the session list (with device hints and `lastUsedAt`) in player account settings; add "Sign out other devices" action.
- [ ] **Rate-limit productionization**: in-memory rate-limit bucket on `POST /api/auth/login`. Replace with `@fastify/rate-limit` for persistence across restarts and distributed deployments.
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
- [ ] WebSocket message handlers were stubs (console.log only) — now wired: `welcome` → sends `view.request`; `view` → `campaignState.applyView()`; `event` → `campaignState.applyEvent()`. Remaining: reconnect gap-detection path not yet exercised in client tests [ws.ts](../client/src/api/ws.ts)
- [ ] `adminFetch` in state layer should arguably be in API layer [admin.svelte.ts](../client/src/state/admin.svelte.ts#L55)
- [ ] **Admin panel: delete account** — `DELETE /api/admin/accounts/:id` currently returns 501. Intended behavior: revoke all active sessions for the account, null any `claimed_by_account_id` seat references, then hard-delete the account row. Design whether orphaned seats should auto-post a "seat available" invite or require manual re-invite. [admin-accounts.ts](../server/src/routes/admin-accounts.ts)
- [ ] **Admin panel: disconnect seat from account** — `POST /api/admin/accounts/:id/disconnect-seat` currently returns 501. Intended behavior: null `claimed_by_account_id` on the target seat row; revoke any active sessions scoped to that (account, seat) pair so the player is immediately bounced. [admin-accounts.ts](../server/src/routes/admin-accounts.ts)

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

- [x] **Notification 2×2 model (handled in Phase 2.5)**: `origin: 'server' | 'client'` × `lifetime: 'persistent' | 'ephemeral'`. Prompts are `(server, persistent)` and the client stores references to prompt state by `promptId`, not copies. Toasts are `(client, ephemeral)`. Server-driven feed entries ("X attacked Y") are `(server, ephemeral)`. The `(client, persistent)` cell is reserved (offline indicators, app errors). See [`shared/src/notification.ts`](../shared/src/notification.ts) for shared types, [`client/src/state/notifications.svelte.ts`](../client/src/state/notifications.svelte.ts) for the client store.

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

- [ ] **`/play/account` real settings UI**: password change, active sessions list (view and revoke devices), change-username. Placeholder page ships in Phase 5 (5C-9 adds logout-everywhere; full device-list deferred).
- [ ] **`/play/login` forgot-password flow**: support admin-configured contact info in the "Ask your admin" modal instead of a generic message. Requires a server-side contact-info setting.
- [ ] **`/play/<campaignId>` no-access page** _(Phase 5C-3, 5C-4)_: redirect to `/play?error=campaign-access-revoked` with a toast. See Phase 5C in Current Projects.
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
