# Todo List Strategy

**Workflow:** Items in "Tech Debt" and "Bugs" represent known issues organized by category. Long-term objectives are detailed in [docs/implementaion-strategy.md](../docs/implementation-strategy.md). When we decide to tackle a category, we **promote it to "Current Projects"** with a comprehensive, step-by-step plan. This prevents plans from rolling out of context during implementation.

As work completes, check off tasks.

---

# Current Projects

## Play UI Tech Debt Sprint

**Goal:** Close accessibility gaps in the Play UI left over from the Play UI Overhaul sprint. All items are actionable now without pending infrastructure.

**Verification criteria:**

- `npm run build` passes after each phase
- Screen reader announces ChatLog input label
- Keyboard focus stays inside a `TabbedWindow` while it is open; `Escape` dismisses
- PlayLayout has recognizable landmark regions and a functional skip-link

### Phase 1: Accessibility

- [x] Add `aria-label="Send a message"` (or a visually-hidden `<label>`) to the ChatLog message input [ChatLog.svelte](../client/src/ui/sidebar/ChatLog.svelte)
- [x] Add `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` pointing at the window title to `TabbedWindow` [TabbedWindow.svelte](../client/src/ui/window/TabbedWindow.svelte)
- [x] Add focus trap to `TabbedWindow` — `Tab`/`Shift-Tab` cycles within the window; `Escape` focuses the title-bar close button [TabbedWindow.svelte](../client/src/ui/window/TabbedWindow.svelte)
  - Note: Tab focus trap intentionally omitted — TabbedWindow is a non-modal floating panel; trap would break the VTT workflow of keeping a window open while interacting with the canvas. `Escape` → close button retained as a deliberate keyboard dismiss shortcut.
- [x] Add landmark roles and a skip-link to `PlayLayout`:
  - `<nav aria-label="Tools">` wrapping `LeftToolbar`
  - `<main id="main-content">` wrapping the canvas area
  - `<aside aria-label="Chat">` wrapping `RightSidebar`
  - Skip-link: `<a class="skip-link" href="#main-content">Skip to canvas</a>` (off-screen by default, visible on focus) [PlayLayout.svelte](../client/src/ui/layout/PlayLayout.svelte)

---

## Testing Infrastructure Sprint (May 2026)

**Goal:** Establish a three-tier testing foundation (unit → integration → deferred E2E) that supports a spec-first agentic development workflow. See [docs/testing.md](../docs/testing.md) for full strategy and rationale.

**Decisions locked in:**

- **Test runner:** Vitest in both workspaces (already configured)
- **Client DOM:** happy-dom (already configured)
- **Component testing:** @testing-library/svelte v5 (Svelte 5 runes support)
- **E2E:** Playwright — deferred until WS game loop is non-stub
- **Storage injection:** `Storage` must accept `StorageBackend` before server unit tests are possible

**Verification criteria:**

- `npm test` passes across all workspaces after each phase
- Server unit tests run with no SQLite file on disk (InMemoryBackend only)
- Client state store tests reset singleton state cleanly between runs (no order-dependence)
- Component tests render and interact with Svelte components in happy-dom
- Coverage floors met: storage 80%, routes 60%, state stores 70%

### Phase 0: Infrastructure Fixes (prerequisite — unblocks all testing)

- [x] Refactor `Storage` constructor to accept `StorageBackend` directly (overloaded — string path keeps backward compat). See [storage.ts](../server/src/storage/storage.ts)
- [x] Implement `InMemoryBackend implements StorageBackend` using Maps — [server/src/storage/in-memory-storage.ts](../server/src/storage/in-memory-storage.ts)
- [x] Export `InMemoryBackend` (and all storage types) via [server/src/storage/index.ts](../server/src/storage/index.ts)
- [x] Add `@testing-library/svelte@^5` to `client/devDependencies` (also added `@testing-library/jest-dom` and `@testing-library/user-event`)
- [x] Configure `@sveltejs/vite-plugin-svelte` in [client/vitest.config.ts](../client/vitest.config.ts) for `.svelte` file transforms during tests
- [x] Create `client/src/test-setup.ts` — imports `@testing-library/jest-dom/vitest` to extend `expect` with DOM matchers

### Phase 1: Server Unit Tests (parallel agents, after Phase 0)

Pure functions and route handlers with injected `InMemoryBackend`. Each item is an independent test file — can be written in parallel.

- [x] `server/src/server.ts` — `parseTrustProxy` (all input cases: bool string, number string, array string, `"false"`, invalid)
- [x] `server/src/routes/admin-auth.ts` — password hashing/verification, session/CSRF token generation, `checkRateLimit` logic
- [x] `server/src/routes/admin-auth.ts` — HTTP flows: setup, login, logout, CSRF enforcement, change password, rate limit triggering
- [x] `server/src/routes/campaigns.ts` — CRUD with auth guards (unauthenticated, authenticated, missing campaign)
- [x] `server/src/routes/seats.ts` + `invites.ts` — create/list/revoke, auth guards, input validation

### Phase 2: Client Unit Tests (parallel agents, after Phase 0)

State stores are plain TypeScript classes — instantiate directly, no DOM required. Each item is an independent test file.

- [x] `client/src/app/routes.ts` — `parseRoute` (all 6 route types, trailing slashes, unknown paths, token extraction)
- [x] `client/src/state/viewport.svelte.ts` — zoom clamping (0.1–5.0), pan math, grid/snap toggles, `reset()`
- [x] `client/src/state/campaign.svelte.ts` — actor/token/scene accessors, `getPartyActors()`, `appendEvent()`, `loadMockData()`, `clear()`
- [x] `client/src/state/notifications.svelte.ts` — `push()`, `dismiss()`, ephemeral vs persistent, `info()`/`error()` helpers
- [x] `client/src/state/connection.svelte.ts` — status transitions, `handleWelcome()`, `incrementReconnectAttempts()`, `reset()`
- [x] `client/src/state/ui.svelte.ts` — `openWindow()`, `closeTab()`, `bringGroupToFront()`, `mergeGroups()`, `detachTab()`, tool drawer toggle

### Phase 3: Server Integration Tests (after Phase 0)

- [ ] `SqliteStorage` with `:memory:` — campaign CRUD lifecycle, entity CRUD, event sequencing (monotonic seq), transaction rollback
- [ ] `SqliteStorage` admin sessions — create, validate hash, revoke, cleanup expired
- [ ] `SqliteStorage` invites — create, decrement uses, revoke, per-seat listing
- [ ] Full HTTP cycle tests — `buildServer()` with `InMemoryBackend`: complete admin setup → login → CSRF → protected endpoint chain

### Phase 4: Client Component Tests (after Phase 0, @testing-library/svelte)

- [ ] `AdminLogin.svelte` — renders form, submit success (mock fetch 200), submit error (mock fetch 401), loading state
- [ ] `AdminSetup.svelte` — PIN + password form, confirm-password mismatch, submit flow
- [ ] `JoinPage.svelte` — PIN entry, submit loading/success/error states
- [ ] `ActorPill.svelte` — renders actor name/HP, dropdown open/close, `getHpPercentage` + `getHpColor` edge cases (0 HP, max HP, no maxHp)
- [ ] `NotificationCard.svelte` — renders by kind, dismiss button, action buttons
- [ ] `NotificationArea.svelte` — renders multiple notifications, dismiss removes from list

### Deferred (Phase 5 — Post Game Loop)

- **E2E with Playwright** — install at root workspace, `e2e/` directory, 5–10 critical journeys: admin setup, login, campaign create, invite, join game. Not worth investing in until WS message handlers and renderer are non-stub.

---

# Tech Debt

Known issues organized by area. Items here can be promoted to "Current Projects" when prioritized.

## Shared Package (`shared/`)

The `shared/` workspace package has been bootstrapped (Phase 0) with the full Phase 3 type catalog.

- [x] `packages/` directory doesn't exist — created as `shared/` npm workspace package
- [x] `SeatRole` type (`'gm' | 'player' | 'spectator'`) duplicated between client and server — migrated to `@hearth-vtt/shared`
- [x] WS message shapes (welcome, etc.) typed independently on client and server — migrated to `shared/src/protocol/ws.ts` with Zod validation

## Server

### Security (Not in Current Sprint)

- **Critical (Stubs — handled in Phase 1):**
  - Hardcoded PIN validation in auth.ts
  - WebSocket has no authentication
  - Session routes unauthenticated

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

### Code Quality

- [ ] Unbounded campaign DB pool — no LRU eviction or idle timeout [sqlite-storage.ts](../server/src/storage/sqlite-storage.ts#L200)
- [ ] No database migrations — schema applied via `CREATE TABLE IF NOT EXISTS`
- [ ] TransactionStorage methods throw `'not implemented'` [sqlite-storage.ts](../server/src/storage/sqlite-storage.ts#L527-L541)
- [ ] Storage facade hardcodes SqliteStorage implementation [storage.ts](../server/src/storage/storage.ts#L301) — can't inject backends for testing
- [ ] `esbuild` in devDependencies but unused (may be dead dependency)

### Input Validation

- [ ] No max length on campaign name [campaigns.ts](../server/src/routes/campaigns.ts#L63)
- [ ] `rolesGranted` and `expiresIn` not validated in invite creation
- [ ] Seat role accepts any string instead of enum validation

## Client

### CSS & Styling

- [ ] Shared button styles (`.btn` variants), form inputs, error banners, and spinner animations still duplicated across admin components — consolidate when Admin UI Overhaul is promoted

### API Layer

- [ ] All API sub-clients throw `NOT_IMPLEMENTED` — `HttpClient` built but never wired [http.ts](../client/src/api/http.ts#L141)
- [ ] `Api.http` field created but never passed to sub-clients [http.ts](../client/src/api/http.ts#L419)
- [ ] Admin components bypass API layer with raw `fetch()`:
  - [ ] AdminLogin [AdminLogin.svelte](../client/src/ui/admin/AdminLogin.svelte#L36)
  - [ ] AdminSetup [AdminSetup.svelte](../client/src/ui/admin/AdminSetup.svelte#L40)
  - [ ] JoinPage [JoinPage.svelte](../client/src/ui/auth/JoinPage.svelte#L30)
- [ ] WebSocket message handlers all stub (console.log only) [ws.ts](../client/src/api/ws.ts#L261-L342)
- [ ] `adminFetch` in state layer should arguably be in API layer [admin.svelte.ts](../client/src/state/admin.svelte.ts#L55)

### Error Handling

- [ ] AdminLogin error branch calls `response.json()` without try/catch [AdminLogin.svelte](../client/src/ui/admin/AdminLogin.svelte#L94)
- [ ] AdminSetup same issue [AdminSetup.svelte](../client/src/ui/admin/AdminSetup.svelte#L104)
- [ ] JoinPage checks `err.status` but fetch errors lack that property (handled in Phase 3)

### Accessibility

- [ ] AdminTree missing ARIA tree roles [AdminTree.svelte](../client/src/ui/admin/AdminTree.svelte#L81)
- [ ] Emoji-only buttons lack `aria-label` throughout admin UI

### Stub Implementations

- [ ] Renderer entire module is stub [render/index.ts](../client/src/render/index.ts)
- [ ] Domain module empty [domain/index.ts](../client/src/domain/index.ts)
- [ ] Util module empty [util/index.ts](../client/src/util/index.ts)
- [ ] `campaign.setInitialState()` has TODO [campaign.svelte.ts](../client/src/state/campaign.svelte.ts#L27)
- [ ] `campaign.applyDelta()` is stub [campaign.svelte.ts](../client/src/state/campaign.svelte.ts#L35)
- [ ] Several floating window and drawer components are placeholder stubs with hardcoded content: `CharacterSheet`, `DocumentReader`, `ItemInspector`, `InitiativeModal`, `CampaignPrepDrawer`, `GameSettingsDrawer`

### Console Logging

- [ ] Pervasive `console.log` in production paths across all API and state files
- [ ] No log-level gating

### Deferred Features

These play UI features were deferred from the Play UI Overhaul sprint, pending infrastructure that doesn't exist yet.

- [ ] **Radial menu** — context radial on token right-click; custom SVG/CSS; defer until renderer + token system exist
- [ ] **Pop-out windows** — detach a floating window into a separate browser window for multi-monitor setups
- [ ] **Drag-and-drop from drawers** — drag actors from Token Library to map; drag Compendium items onto character sheets; defer until renderer + character sheet system exist

## Admin UI Overhaul (Future Sprint)

The admin UI predates the Play UI Overhaul and is due for a similar pass. Items are already tracked individually in the Accessibility, API Layer, and Error Handling sections above. When promoted to a sprint, consolidate into a phased plan covering:

- Lucide icon replacement throughout (AdminTree, ServerSettings, CampaignDetail, AdminLayout, NotLoggedInPage, JoinPage)
- ARIA tree roles, focus traps, and `aria-label` on icon-only buttons
- Wire admin components to the API layer (remove raw `fetch()` from AdminLogin, AdminSetup, JoinPage)
- Error handling robustness (`try/catch` on `response.json()` in AdminLogin, AdminSetup)

## Documentation

### Drift from Implementation (handled in Phase 4)

- [ ] `check-setup` documented as GET but implemented as POST
- [ ] Cookie `sameSite` inconsistent (some docs say Lax, code is Strict)
- [ ] Invite routes don't match docs (`/api/seats/:id/invites` vs `/api/campaigns/:id/invites`)
- [ ] Storage constructor signature differs between docs and implementation
- [ ] server.md references wrong filenames and directories

### Missing Documentation

- [ ] Server-served SPA fallback behavior [server.ts](../server/src/server.ts#L136)
- [ ] Client-side routing patterns [routes.ts](../client/src/app/routes.ts), [Router.svelte](../client/src/app/Router.svelte)
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

- [x] TypeScript versions inconsistent across workspaces (root/server `^5.3.3`, client `^5.9.3`, ADR says `^5.6.3`) — now standardized to `^5.9.3`
- [ ] `declaration: true` generates unnecessary `.d.ts` files [tsconfig.json](../server/tsconfig.json)
- [ ] No `noUncheckedIndexedAccess` in tsconfig
- [ ] `moduleResolution: "bundler"` may conflict with bare `.js` imports

### Dependency Issues

- [x] No ESLint config despite lint script
- [ ] No Prettier config
- [ ] No `@fastify/rate-limit` — hand-rolled solution with issues

### Legal & Metadata

- [ ] Add per-file `SPDX-License-Identifier: AGPL-3.0-or-later` headers to all source files (`.ts`, `.svelte`, `.js`, `.css`). Baseline is covered by repo-level [LICENSE](../LICENSE) and `license` field in each `package.json`; per-file headers are nice-to-have and tracked here so we don't forget. See [ADR 008](decisions/008-licensing-and-contributions.md).

## Testing

- [x] Vitest configured in both workspaces — see Testing Infrastructure Sprint in Current Projects
- [x] `InMemoryBackend` implemented
- [x] `@testing-library/svelte` + `@testing-library/jest-dom` + `@testing-library/user-event` installed
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

# Bugs

## UI

- [ ] Admin setup page extends past the bottom of the screen and isn't scrollable.

## Backend

## GameEngine and RulesetRuntime

## Build pipeline
