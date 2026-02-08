# Todo List Strategy

**Workflow:** Items in "Tech Debt" represent known issues organized by category. When we decide to tackle a category, we **promote it to "Current Projects"** with a comprehensive, step-by-step plan. This prevents plans from rolling out of context during implementation.

As work completes, check off tasks and archive completed projects to keep this document focused on active and pending work.

---

# Completed Sprints

<details>
<summary>Tech Debt Cleanup Sprint — Phases 1–5 (Feb 2026) ✅</summary>

**Goal:** Harden existing code, fix security gaps, sync documentation. Phases 1–5 complete; Phase 6 (Testing) moved to Tech Debt.

- [x] **Phase 1: Security Hardening** — Dev-only gates on stub routes, CORS restriction, password max-length, secure cookie conditionals, trustProxy, rate limit cleanup, SQLite foreign keys, campaignId format validation
- [x] **Phase 2: Server Code Quality** — Debug log removal, graceful shutdown, storage close(), WAL mode, StorageBackend interface fix, version from package.json, COOKIE_SECRET persistence
- [x] **Phase 3: Client Cleanup** — Shared CSS extraction, missing CSS custom properties, JoinPage error handling, barrel file fixes, Svelte rune fixes, commented code removal
- [x] **Phase 4: Documentation Sync** — server.md directory layout, check-setup endpoint, cookie sameSite, invite routes, API info endpoint, CORS docs, TypeScript version alignment
- [x] **Phase 5: Build Fixes** — Dockerfile workspace stages, redundant build removal, builder stage separation, build-exe.js HOST default

</details>

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
- After Phase 6: Actor pills and quick status visible on canvas overlays
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

- [ ] Install `lucide-svelte` in client workspace
- [ ] Create `Tooltip` component — custom positioned tooltip (hover + focus), replaces native `title` attrs
- [ ] Create `Icon` wrapper component — standardizes size/color/aria-label for Lucide icons
- [ ] Update [tokens.css](../client/src/styles/tokens.css):
  - [ ] Replace `--toolbar-bottom-height` with `--toolbar-left-width` (56px) and `--drawer-width` (320px)
  - [ ] Add `--z-drawer` layer between canvas and overlay
  - [ ] Add `--notification-height`, `--pill-height` tokens
- [ ] Add new CSS component classes to [components.css](../client/src/styles/components.css):
  - [ ] `.toolbar-icon-btn` — square icon button with hover/active/selected states
  - [ ] `.drawer-panel` — slide-out panel base styling
  - [ ] `.notification-toast` — bottom notification card
  - [ ] `.actor-pill` — split button pill

### Phase 4: Left Toolbar & Drawer System

- [ ] Create `LeftToolbar` component — narrow vertical icon bar (56px), three sections with dividers:
  - [ ] **Quick tools** (top): Dice roller, annotation, measurement, initiative toggle, jukebox
  - [ ] **Big tools** (middle): Campaign journal, player compendium, settings
  - [ ] **GM tools** (bottom, seat-gated): Lighting, obstructions, scene selector, campaign prep, token library, game settings
  - [ ] Each icon uses `Tooltip` + `Icon` components; clicking toggles `uiState.activeToolDrawer`
  - [ ] Active tool gets visual indicator (left accent bar or background highlight)
- [ ] Create `ToolDrawer` wrapper — 320px slide-out panel overlaying canvas
  - [ ] Smooth CSS transition (`transform: translateX`) for open/close
  - [ ] Click-outside or Escape to close
  - [ ] Header with drawer title + close button, scrollable content area
  - [ ] Renders correct drawer content based on `uiState.activeToolDrawer`
- [ ] Create drawer content components in `ui/toolbar/drawers/`:
  - [ ] `DiceRollerDrawer` — formula input, preset dice buttons, roll history
  - [ ] `AnnotationDrawer` — shape selection, color/weight pickers
  - [ ] `MeasurementDrawer` — mode selector, public/private toggle
  - [ ] `InitiativeDrawer` — turn order list, controls, show/hide panel
  - [ ] `JukeboxDrawer` — playlist, transport controls, volume (migrated from sidebar)
  - [ ] `JournalDrawer` — handouts/notes browser (migrated from sidebar)
  - [ ] `CompendiumDrawer` — search + browse by category/Tome (migrated from sidebar)
  - [ ] `SettingsDrawer` — audio/video/UI preferences (migrated from sidebar)
  - [ ] `LightingDrawer` — light placement/editing tools (GM only, migrated from sidebar)
  - [ ] `ObstructionDrawer` — wall/door/window tools (GM only, migrated from sidebar)
  - [ ] `SceneDrawer` — map browser/selector (GM only, migrated from sidebar)
  - [ ] `CampaignPrepDrawer` — encounter setup, NPC staging area (GM only, placeholder)
  - [ ] `TokenLibraryDrawer` — drag-to-map actor browser (GM only, migrated from sidebar)
  - [ ] `GameSettingsDrawer` — campaign-level game settings (GM only, placeholder)
- [ ] Update `uiState` — add `activeToolDrawer: string | null`, remove old `selectedTool`/`activeDrawerTab`
- [ ] Rewrite `PlayLayout` — 3-column CSS grid: `[toolbar-left] auto [canvas-area] 1fr [sidebar-right] var(--sidebar-right-width)`. Canvas area is `position: relative` for overlay anchoring. Drawer overlays absolutely over canvas
- [ ] Delete old toolbar components: `BottomToolbar`, `DiceRoller`, `DrawingTools`, `InitiativeTracker`, `MeasurementTool`, `PingTool`
- [ ] Update [toolbar/index.ts](../client/src/ui/toolbar/index.ts) barrel

### Phase 5: Right Sidebar Simplification

- [ ] Rewrite `RightSidebar` — chat/event log only (header + ChatLog + input), no DrawerTabs
- [ ] Add sidebar collapse/expand toggle — open by default, collapsible for more map space
- [ ] Wire `ChatLog` to `eventLogState` store (remove hardcoded sample events)
- [ ] Delete old sidebar components: `DrawerTabs`, `CompendiumDrawer`, `JournalDrawer`, `SettingsDrawer`, `JukeboxDrawer`, `LeftSidebar`, `SceneNavigator`, `WallEditor`, `LightEditor`, `ActorLibrary`
- [ ] Update [sidebar/index.ts](../client/src/ui/sidebar/index.ts) barrel — export only `RightSidebar`, `ChatLog`, `GameEventCard`

### Phase 6: Canvas Overlays

- [ ] Create `ActorPills` — positioned top-right of canvas area
  - [ ] Horizontal row of split-button pills for party-controlled actors
  - [ ] Main button: actor name (truncated), click to center map on token
  - [ ] Dropdown caret: flyout with quick stats (HP bar, AC, status indicators), center-on-token and open-character-sheet buttons
  - [ ] Filtered by seat permissions via `$derived` from `campaignState`
- [ ] Create `QuickStatus` — positioned top-left of canvas area
  - [ ] Compact mode (default): low opacity, shows map name + zoom % + connection dot (green/red)
  - [ ] Hover mode: opacity 1.0, expands downward with zoom slider, grid spacing, snap-to-grid toggle, connection status text
  - [ ] Reads from `viewportState` and `connectionState`
- [ ] Update [canvas/index.ts](../client/src/ui/canvas/index.ts) barrel

### Phase 7: Bottom Notifications

- [ ] Create `NotificationArea` — fixed bottom-left, horizontal flexbox row
  - [ ] Renders notifications from `notificationState`
  - [ ] Compact leftward on dismiss with CSS transition
  - [ ] Z-index between toolbar and floating window layers
- [ ] Create `NotificationCard` — individual card styled by kind:
  - [ ] **Ephemeral**: subtle bg, auto-fade, slide-up entrance
  - [ ] **Blocking**: accent border, action buttons, no auto-dismiss
  - [ ] **Persistent**: warning border, explicit dismiss button required
- [ ] Delete old snackbar components and `ui/snackbar/` directory entirely
- [ ] Create [notifications/index.ts](../client/src/ui/notifications/index.ts) barrel

### Phase 8: Tabbed Floating Windows

- [ ] Redesign window state model in `uiState`:
  - [ ] Replace `openWindows` Map with `windowGroups: Map<groupId, { tabs, activeTabId, position, size, zIndex }>`
  - [ ] Methods: `openWindow()`, `closeTab()`, `mergeWindow()`, `detachTab()`, `bringToFront()`
- [ ] Create `TabbedWindow` component:
  - [ ] Tab bar below title bar when group has >1 tab
  - [ ] Click tab to switch, context menu to detach tab
  - [ ] Single-tab groups look identical to current windows (tab bar hidden)
  - [ ] Active tab content rendered via dynamic component dispatch
- [ ] Add tab merge UI: context menu on window title bar with "Merge into..." option listing other open windows
- [ ] Rewrite `FloatingWindowLayer` — iterate `uiState.windowGroups`
- [ ] Update `FloatingWindow` — refactor as shell inside `TabbedWindow`
- [ ] Update [window/index.ts](../client/src/ui/window/index.ts) barrel
- [ ] Implement drag-to-combine: drag window title bar onto another window's tab bar to merge
- [ ] Implement drag-to-detach: drag tab out of tab bar to create new window group

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

# Future Milestones

These are planned features and improvements not currently in active development.

## Campaign Import/Export

- [ ] `.campaign` file format implementation
  - [ ] Zip unpack into working dir + SQLite + assets
  - [ ] Export packages SQLite + assets into `.campaign` zip
- [ ] Import validation and sanitization
- [ ] Export asset optimization

## Game Engine & Ruleset System

- [ ] Define stub types (see shared-types.md)
  - [ ] `RollModifier` — modifiers applied to dice rolls from effects
  - [ ] `StatModifier` — modifiers applied to derived stats from effects
  - [ ] `SyncBundle` — initial state bundle sent to clients on connect
  - [ ] `RealtimeHub` — interface for broadcasting to connected clients
  - [ ] `Logger` — structured logging interface
- [ ] Tome/Ruleset integration
  - [ ] Define template lookup API — how Tome entries reference Ruleset resolver templates
  - [ ] Define Compendium loading — how Tomes are indexed at session start
- [ ] Action engine + ruleset loading
- [ ] State delta broadcasting and prompt delivery

## Player Authentication System

- [ ] Replace stub auth.ts with real implementation
  - [ ] PIN validation against stored invites
  - [ ] Session creation and token management
  - [ ] Refresh token rotation
- [ ] Wire auth.ts to real storage layer
- [ ] Replace stub sessions.ts with authenticated session management
- [ ] Implement WebSocket authentication
  - [ ] Cookie-based auth on WS upgrade
  - [ ] Session validation per connection

## Seat & Invite Management

- [ ] Wire [seats.ts](../server/src/routes/seats.ts) to storage (currently uses mock data)
- [ ] Wire [invites.ts](../server/src/routes/invites.ts) to storage (currently uses mock data)
- [ ] Add authentication guards to campaign GET endpoints
- [ ] Replace `Math.random()` with crypto.randomBytes() for invite token generation

## Admin Session Improvements

- [ ] Reduce admin session duration from 30 days to 1 hour
- [ ] Implement sliding window session extension (extend on activity)
- [ ] Update `requireAdminAuth` middleware to extend sessions
- [ ] Use `updateAdminSession()` method on activity (method exists but unused)
- [ ] Test redirect behavior on session expiration

## Hosted Mode & Production Readiness

- [ ] `TRUST_PROXY` configuration support
- [ ] `PUBLIC_BASE_URL` configuration support
- [ ] Persistent volume configuration for Docker
- [ ] Audit logging for admin actions
- [ ] Multi-admin support with roles/permissions
- [ ] Two-factor authentication option
- [ ] Password reset via secure channel

## Services Layer Extraction

**Note:** Currently deferred until player auth and real seat management are implemented to avoid churn on stub code.

- [ ] Create `server/src/services/` directory
- [ ] Extract business logic from route handlers
- [ ] Create service interfaces for:
  - [ ] Campaign management
  - [ ] Seat/invite management
  - [ ] Session management
  - [ ] Authentication workflows
- [ ] Refactor routes to use services (thin delivery layer)
- [ ] Create `server/src/domain/` for business rules/invariants

## Shared Types Package

**Note:** Deferred until there are actual shared types to extract.

- [ ] Create `packages/shared/` directory
- [ ] Extract protocol message types
- [ ] Move shared schemas and IDs
- [ ] Set up workspace references

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

- [ ] `FloatingWindowLayer` maintains separate `$state` disconnected from `uiState.openWindows` — **addressed in Play UI Overhaul Phase 8**
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
- [ ] FloatingWindow drag has no keyboard navigation [FloatingWindow.svelte](../client/src/ui/window/FloatingWindow.svelte#L55)
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

- [ ] No ESLint config despite lint script
- [ ] No Prettier config
- [ ] No `@fastify/rate-limit` — hand-rolled solution with issues

## Testing

- [ ] Zero test files exist
- [ ] `vitest` installed but unconfigured
- [ ] `testing.md` entirely aspirational
- [ ] No `InMemoryBackend` for testing
- [ ] No test-specific mocks (MockResolveContext, TestRngProvider, TestClock)
- [ ] Create `vitest.config.ts` in server workspace
- [ ] Implement `InMemoryBackend` implementing `StorageBackend` interface
- [ ] Write first test suite: Storage CRUD operations
  - [ ] Campaign create/read/update/delete
  - [ ] Seat create/list/update/delete
  - [ ] Invite create/claim/revoke
  - [ ] Admin session lifecycle
- [ ] Verify admin auth flows:
  - [ ] Test campaign creation with new schema
  - [ ] Test seat/invite/session CRUD operations
  - [ ] Test session expiration and cleanup
  - [ ] Test routing: setup → login → dashboard flows

---
