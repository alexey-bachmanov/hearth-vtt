# Todo List Strategy

**Workflow:** Items in "Tech Debt" and "Bugs" represent known issues organized by category. Long-term objectives are detailed in [docs/implementaion-strategy.md](../docs/implementation-strategy.md). When we decide to tackle a category, we **promote it to "Current Projects"** with a comprehensive, step-by-step plan. This prevents plans from rolling out of context during implementation.

As work completes, check off tasks.

---

# Current Projects

## Play UI Overhaul (Feb 2026)

**Goal:** Restructure the play interface from a 5-zone grid layout to a modern 3-zone layout with left icon toolbar, canvas overlays, bottom notification toasts, and tabbed floating windows. Admin UI is untouched.

**Decisions locked in:**

- **Icons:** Lucide via `lucide-svelte` (tree-shakeable, Svelte-native)
- **Drawer behavior:** Overlays canvas (no layout push), one drawer open at a time
- **Notifications:** Bottom-left anchored, horizontal stack with leftward compaction
- **Tabbed windows:** Context menu to combine initially, then drag-to-combine
- **Radial menu:** Custom SVG/CSS, deferred until renderer and token system exist
- **Target screens:** Desktop and large-format tablets; plan for touch but defer mobile layout
- **Admin UI:** Completely untouched — all changes scoped to `/play` path

**Verification criteria:**

- `npm run build` passes in client after each phase
- After Phase 2: PlayLayout renders with new 3-zone grid
- After Phase 4: Left toolbar renders icons, clicking opens/closes drawer overlay
- After Phase 5: Right sidebar shows only chat log
- After Phase 6: Actor pills visible top-right with dropdowns, quick status top-left
- After Phase 7: Notifications render bottom-left and stack correctly
- After Phase 8: Can open multiple windows, combine into tab groups, detach tabs
- After Phase 9: Right-click drag pans, scroll zooms (updates viewport state)
- Manual smoke test: Load `/play` → see new layout → verify all toolbar icons → open/close drawers → verify chat sidebar → verify admin UI unchanged at `/admin`

### Phase 1: Documentation

- [x] Update [client.md](../docs/components/client.md) with new UI layout, component hierarchy, and architecture
- [x] Update [todo.md](../docs/todo.md) with new sprint plan, archive completed sprint, move testing to tech debt

### Phase 2: CampaignState & Mock Data

- [x] Implement `CampaignState` as a concrete reactive store with typed entity collections
  - [x] Define types: `Actor`, `Token`, `Scene`, `Effect`, seat role/permissions
  - [x] Populate with rich D&D-flavored mock data (party actors, GM actors, scenes, tokens)
  - [x] Methods: `getActor(id)`, `getToken(id)`, `getScene(id)`, `getActorsForSeat(seatId)`, `getPartyActors()`
- [x] Add `seatRole` (`'gm' | 'player' | 'spectator'`) to `connectionState` or `campaignState`
- [x] Add `viewportState` store — `zoom`, `panOffset`, `gridSpacing`, `gridType`, `snapToGrid`, `mapName`
- [x] Add `notificationState` store — ordered notification array with `push()`, `dismiss(id)`, auto-remove for ephemeral
- [x] Wire existing `eventLogState` to `ChatLog` (replace hardcoded sample events) and populate with mock events

### Phase 3: Setup & Shared Components

- [x] Install `lucide-svelte` in client workspace
- [x] Create `Tooltip` component — custom positioned tooltip (hover + focus), replaces native `title` attrs
- [x] Create `Icon` wrapper component — standardizes size/color/aria-label for Lucide icons
- [x] Update [tokens.css](../client/src/styles/tokens.css):
  - [x] Replace `--toolbar-bottom-height` with `--toolbar-left-width` (56px) and `--drawer-width` (320px)
  - [x] Add `--z-drawer` layer between canvas and overlay
  - [x] Add `--notification-height`, `--pill-height` tokens
- [x] Add new CSS component classes to [components.css](../client/src/styles/components.css):
  - [x] `.toolbar-icon-btn` — square icon button with hover/active/selected states
  - [x] `.drawer-panel` — slide-out panel base styling
  - [x] `.notification-toast` — bottom notification card
  - [x] `.actor-pill` — split button pill

### Phase 4: Left Toolbar & Drawer System

- [x] Create `LeftToolbar` component — narrow vertical icon bar (56px), three sections with dividers:
  - [x] **Quick tools** (top): Dice roller, annotation, measurement, initiative toggle, jukebox
  - [x] **Big tools** (middle): Campaign journal, player compendium, settings
  - [x] **GM tools** (bottom, seat-gated): Lighting, obstructions, scene selector, campaign prep, token library, game settings
  - [x] Each icon uses `Tooltip` + `Icon` components; clicking toggles `uiState.activeToolDrawer`
  - [x] Active tool gets visual indicator (left accent bar or background highlight)
- [x] Create `ToolDrawer` wrapper — 320px slide-out panel overlaying canvas
  - [x] Smooth CSS transition (`transform: translateX`) for open/close
  - [x] Click-outside or Escape to close
  - [x] Header with drawer title + close button, scrollable content area
  - [x] Renders correct drawer content based on `uiState.activeToolDrawer`
- [x] Create drawer content components in `ui/toolbar/drawers/`:
  - [x] `DiceRollerDrawer` — preset dice buttons (simple mode), and custom formula editor (advanced mode)
  - [x] `AnnotationDrawer` — shape selection, color/weight pickers
  - [x] `MeasurementDrawer` — mode selector, public/private toggle
  - [x] `InitiativeDrawer` — turn order list, controls, show/hide panel
  - [x] `JukeboxDrawer` — playlist, transport controls, volume (migrated from sidebar)
  - [x] `JournalDrawer` — handouts/notes browser (migrated from sidebar)
  - [x] `CompendiumDrawer` — search + browse by category/Tome (migrated from sidebar)
  - [x] `SettingsDrawer` — audio/video/UI preferences (migrated from sidebar)
  - [x] `LightingDrawer` — light placement/editing tools (GM only, migrated from sidebar)
  - [x] `ObstructionDrawer` — wall/door/window tools (GM only, migrated from sidebar)
  - [x] `SceneDrawer` — map browser/selector (GM only, migrated from sidebar)
  - [x] `CampaignPrepDrawer` — encounter setup, NPC staging area (GM only, placeholder)
  - [x] `TokenLibraryDrawer` — drag-to-map actor browser (GM only, migrated from sidebar)
  - [x] `GameSettingsDrawer` — campaign-level game settings (GM only, placeholder)
- [x] Update `uiState` — add `activeToolDrawer: string | null`, remove old `selectedTool`/`activeDrawerTab`
- [x] Rewrite `PlayLayout` — 3-column CSS grid: `[toolbar-left] auto [canvas-area] 1fr [sidebar-right] var(--sidebar-right-width)`. Canvas area is `position: relative` for overlay anchoring. Drawer overlays absolutely over canvas
- [x] Delete old toolbar components: `BottomToolbar`, `DiceRoller`, `DrawingTools`, `InitiativeTracker`, `MeasurementTool`, `PingTool`
- [x] Update [toolbar/index.ts](../client/src/ui/toolbar/index.ts) barrel

### Phase 5: Right Sidebar Simplification

- [x] Rewrite `RightSidebar` — chat/event log only (header + ChatLog + input), no DrawerTabs
- [x] Add sidebar collapse/expand toggle — open by default, collapsible for more map space
- [x] Wire `ChatLog` to `campaignState.events` (remove hardcoded sample events)
- [x] Delete old sidebar components: `DrawerTabs`, `CompendiumDrawer`, `JournalDrawer`, `SettingsDrawer`, `JukeboxDrawer`, `LeftSidebar`, `SceneNavigator`, `WallEditor`, `LightEditor`, `ActorLibrary`
- [x] Update [sidebar/index.ts](../client/src/ui/sidebar/index.ts) barrel — export only `RightSidebar`, `ChatLog`, `GameEventCard`

### Phase 6: Canvas Overlays

- [x] Create `ActorPills` — positioned top-right of canvas area
  - [x] Horizontal row of split-button pills for party-controlled actors
  - [x] Main button: actor name (truncated), click to center map on token
  - [x] Dropdown caret: flyout with quick stats (HP bar, AC, status indicators), center-on-token and open-character-sheet buttons
  - [x] Filtered by seat permissions via `$derived` from `campaignState`
- [x] Create `QuickStatus` — positioned top-left of canvas area
  - [x] Compact mode (default): low opacity, shows map name + zoom % + connection dot (green/red)
  - [x] Hover mode: opacity 1.0, expands downward with zoom slider, grid spacing, snap-to-grid toggle, connection status text
  - [x] Reads from `viewportState` and `connectionState`
- [x] Update [canvas/index.ts](../client/src/ui/canvas/index.ts) barrel

### Phase 7: Bottom Notifications

- [x] Create `NotificationArea` — fixed bottom-left, horizontal flexbox row
  - [x] Renders notifications from `notificationState`
  - [x] Compact leftward on dismiss with CSS transition
  - [x] Z-index between toolbar and floating window layers
- [x] Create `NotificationCard` — individual card styled by kind:
  - [x] **Ephemeral**: subtle bg, auto-fade, slide-up entrance
  - [x] **Blocking**: accent border, action buttons, no auto-dismiss
  - [x] **Persistent**: warning border, explicit dismiss button required
- [x] Delete old snackbar components and `ui/snackbar/` directory entirely
- [x] Create [notifications/index.ts](../client/src/ui/notifications/index.ts) barrel

### Phase 8: Tabbed Floating Windows

- [x] Redesign window state model in `uiState`:
  - [x] Replace `openWindows` Map with `windowGroups: Map<groupId, { tabs, activeTabId, position, size, zIndex }>`
  - [x] Methods: `openWindow()`, `closeTab()`, `mergeGroups()`, `detachTab()`, `bringGroupToFront()`
- [x] Create `TabbedWindow` component:
  - [x] Tab bar below title bar when group has >1 tab
  - [x] Click tab to switch, context menu to detach tab
  - [x] Single-tab groups look identical to current windows (tab bar hidden)
  - [x] Active tab content rendered via dynamic component dispatch
- [x] Add tab merge UI: context menu on window title bar with "Merge into..." option listing other open windows
- [x] Rewrite `FloatingWindowLayer` — iterate `uiState.windowGroups`
- [x] Replace `FloatingWindow` with `TabbedWindow` shell; delete old component
- [x] Update [window/index.ts](../client/src/ui/window/index.ts) barrel
- [x] Implement drag-to-combine: drag window title bar onto another window's tab bar to merge
- [x] Implement drag-to-detach: drag tab out of tab bar to create new window group

### Phase 9: Canvas Input & Viewport

- [ ] Update `MainCanvas` — add pointer event handlers:
  - [ ] Left click: token selection / tool interaction (delegates to current tool mode)
  - [ ] Middle scroll: zoom in/out toward cursor, update `viewportState.zoom`
  - [ ] Right click + drag: pan map, suppress context menu, update `viewportState.panOffset`
  - [ ] Left click + drag on token: token drag (renderer API calls, no-op until renderer is real)
- [ ] Wire `viewportState` to `QuickStatus` for reactive zoom/pan display

### Phase 10: Seat Permissions

- [ ] Add `seatPermissions` derived state — computes `canSeeGMTools`, `canDragToken(actorId)`, `canOpenRadialMenu(actorId)`, `visibleActorPills`
- [ ] Gate GM-only UI: `LeftToolbar` GM section, `ActorPills` filtering
- [ ] Gate token interactions: drag handlers and radial menu check permissions

### Phase 11: Cleanup & Final Documentation

- [ ] Replace remaining emoji icons in play-UI components with Lucide icons
- [ ] Update all barrel files across `toolbar/`, `sidebar/`, `canvas/`, `notifications/`, `window/`
- [ ] Update [client.md](../docs/components/client.md) to reflect actual implementation
- [ ] Update [todo.md](../docs/todo.md) — check off completed phases, note any deferred items

### Deferred (Post-Sprint)

- **Radial menu** — custom SVG/CSS radial on token click; needs renderer + token system first
- **Pop-out windows** — open floating window in separate browser window for multi-monitor
- **Drag-and-drop from drawers** — drag Compendium items to sheets, drag actors to map

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

- [ ] `server/src/server.ts` — `parseTrustProxy` (all input cases: bool string, number string, array string, `"false"`, invalid)
- [ ] `server/src/routes/admin-auth.ts` — password hashing/verification, session/CSRF token generation, `checkRateLimit` logic
- [ ] `server/src/routes/admin-auth.ts` — HTTP flows: setup, login, logout, CSRF enforcement, change password, rate limit triggering
- [x] `server/src/routes/campaigns.ts` — CRUD with auth guards (unauthenticated, authenticated, missing campaign)
- [ ] `server/src/routes/seats.ts` + `invites.ts` — create/list/revoke, auth guards, input validation

### Phase 2: Client Unit Tests (parallel agents, after Phase 0)

State stores are plain TypeScript classes — instantiate directly, no DOM required. Each item is an independent test file.

- [ ] `client/src/app/routes.ts` — `parseRoute` (all 6 route types, trailing slashes, unknown paths, token extraction)
- [ ] `client/src/state/viewport.svelte.ts` — zoom clamping (0.1–5.0), pan math, grid/snap toggles, `reset()`
- [ ] `client/src/state/campaign.svelte.ts` — actor/token/scene accessors, `getPartyActors()`, `appendEvent()`, `loadMockData()`, `clear()`
- [x] `client/src/state/notifications.svelte.ts` — `push()`, `dismiss()`, ephemeral vs persistent, `info()`/`error()` helpers
- [ ] `client/src/state/connection.svelte.ts` — status transitions, `handleWelcome()`, `incrementReconnectAttempts()`, `reset()`
- [ ] `client/src/state/ui.svelte.ts` — `openWindow()`, `closeTab()`, `bringGroupToFront()`, `mergeGroups()`, `detachTab()`, tool drawer toggle

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

- **Duplicated CSS (handled in Phase 3):**
  - Button styles (`.btn`, `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.btn-sm`)
  - Form styles
  - Error banner styles
  - Spinner animations

- **Missing CSS custom properties (handled in Phase 3):**
  - All listed in Phase 3

### State Management

- [x] `FloatingWindowLayer` maintains separate `$state` disconnected from `uiState.openWindows` — **addressed in Play UI Overhaul Phase 8**
- [ ] `RightSidebar` maintains own `activeDrawer` instead of using `uiState` — **addressed in Play UI Overhaul Phase 5**

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
- [ ] ChatLog input has no label [ChatLog.svelte](../client/src/ui/sidebar/ChatLog.svelte#L36)
  - [x] FloatingWindow drag has no keyboard navigation [FloatingWindow.svelte](../client/src/ui/window/FloatingWindow.svelte#L55)
- [ ] No focus trap in floating windows or modals
- [ ] Emoji-only buttons lack `aria-label` throughout admin UI
- [ ] No skip navigation or landmark roles in PlayLayout

### Stub Implementations

- [ ] Renderer entire module is stub [render/index.ts](../client/src/render/index.ts)
- [ ] Domain module empty [domain/index.ts](../client/src/domain/index.ts)
- [ ] Util module empty [util/index.ts](../client/src/util/index.ts)
- [ ] `campaign.setInitialState()` has TODO [campaign.svelte.ts](../client/src/state/campaign.svelte.ts#L27)
- [ ] `campaign.applyDelta()` is stub [campaign.svelte.ts](../client/src/state/campaign.svelte.ts#L35)
- [ ] Many placeholder UI components with hardcoded content (SceneNavigator, WallEditor, ActorLibrary, etc.)

### Console Logging

- [ ] Pervasive `console.log` in production paths across all API and state files
- [ ] No log-level gating

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

### Package Info

- [ ] `packages/` directory referenced in docs but doesn't exist

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

## Testing

- [x] Vitest configured in both workspaces — see Testing Infrastructure Sprint in Current Projects
- [x] `InMemoryBackend` implemented
- [x] `@testing-library/svelte` + `@testing-library/jest-dom` + `@testing-library/user-event` installed
- [ ] No test-specific mocks (MockResolveContext, TestRngProvider, TestClock) — deferred until ruleset engine

---

# Bugs

## UI

- [ ] Admin setup page extends past the bottom of the screen and isn't scrollable.

## Backend

## GameEngine and RulesetRuntime

## Build pipeline
