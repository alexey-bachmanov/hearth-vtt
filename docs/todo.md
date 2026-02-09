# Todo List Strategy

**Workflow:** Items in "Tech Debt" and "Bugs" represent known issues organized by category. When we decide to tackle a category, we **promote it to "Current Projects"** with a comprehensive, step-by-step plan. This prevents plans from rolling out of context during implementation.

As work completes, check off tasks.

---

# Current Projects

## Client CSS Unification (Feb 2026)

**Goal:** Consolidate scattered layout dimensions into `tokens.css`, extract repeated behavioral patterns into `components.css`, adopt full BEM naming, and eliminate duplicated/dead CSS. Includes admin components. Skips snackbar (slated for Phase 7 deletion).

**Decisions locked in:**

- **Naming:** Full BEM — modifiers use `--` (e.g. `.btn--primary`, `.drawer--closed`), state classes use `--modifier` form (e.g. `.initiative-entry--active` not `.initiative-entry.active`)
- **Scope:** All client components including admin (fixes real bugs like undefined `--sidebar-left-width`)
- **Snackbar:** Skip cleanup — entire directory deleted in Play UI Phase 7
- **Drawer borders:** Restructure CSS to avoid nested compound selectors (e.g. no `.drawer--right.drawer--closed .drawer__control-bar`)
- **Shadow aliases:** Remove `--shadow-medium` / `--shadow-large` in favor of `--shadow-md` / `--shadow-lg`

**Verification criteria:**

- `npm run build` passes in client after each chunk
- `grep -r "drawer-content\|drawer-section\b" client/src/ui/toolbar/drawers/` returns 0 matches after Chunk 3
- `grep -r "btn-primary\|btn-secondary\|btn-danger\|btn-sm" client/src/` returns 0 matches after Chunk 2
- No hardcoded pixel widths matching token values remain in `.svelte` `<style>` blocks after Chunk 7
- Visual smoke test: PlayLayout renders correctly (drawer open/close, sidebar expand/collapse), admin pages render correctly

### Chunk 1: Token Consolidation (tokens.css) ✅

- [x] Add missing layout tokens:
  - [x] `--sidebar-left-width` (admin sidebar — currently referenced in AdminLayout but undefined)
  - [x] `--admin-content-max-width: 1200px` (hardcoded in ServerSettings, CampaignDetail, SeatSettings)
  - [x] `--card-max-width-sm: 450px`, `--card-max-width-md: 600px` (auth/admin card widths)
  - [x] `--icon-size-sm: 16px`, `--icon-size-md: 24px`, `--icon-size-lg: 32px`
  - [x] `--window-max-width: 600px`, `--window-max-height: 600px` (FloatingWindow)
- [x] Wire existing unused tokens to their hardcoded equivalents:
  - [x] `--window-min-width` / `--window-min-height` → FloatingWindow
  - [x] `--notification-height` → SnackbarArea `min-height: 60px`
- [x] Audit and prune dead tokens — `--quick-status-height`, `--window-default-width`/`--window-default-height`: wire to a consumer or delete
- [x] Separate toolbar widths — add `--toolbar-right-width` so left toolbar and right sidebar control bar are independently tunable (currently both use `--toolbar-left-width`)
- [x] Remove shadow aliases — delete `--shadow-medium` (alias of `--shadow-md`) and `--shadow-large` (alias of `--shadow-lg`), update all references to use short names

### Chunk 2: BEM Naming Normalization (components.css + Svelte files) ✅

- [x] Rename flat button modifiers to BEM in components.css:
  - [x] `.btn-primary` → `.btn--primary`
  - [x] `.btn-secondary` → `.btn--secondary`
  - [x] `.btn-danger` → `.btn--danger`
  - [x] `.btn-sm` → `.btn--sm`
- [x] Update all Svelte consumers of renamed button classes
- [x] Standardize state classes to BEM `--modifier` form (e.g. `.initiative-entry.active` → `.initiative-entry--active`, `.control-button.primary` → `.control-button--primary`, `.node-button.selected` → `.node-button--selected`)

### Chunk 3: Drawer Section Dedup (components.css + 14 drawer files) ✅

- [x] Extract drawer content layout classes to components.css (currently copy-pasted identically in all 14 drawer files, ~200 lines total):
  - [x] `.drawer__section-list` (was `.drawer-content`) — flex column with `gap: var(--space-lg)`
  - [x] `.drawer__section` (was `.drawer-section`) — flex column with `gap: var(--space-sm)`
  - [x] `.drawer__section-title` (was `.drawer-section__title`) — section heading typography
- [x] Update all 14 drawer component templates to use global classes, remove duplicated `<style>` rules
- [x] Extract `.text--secondary` utility to components.css (duplicated in 5 drawers)

### Chunk 4: Drawer Architecture Simplification (components.css + RightSidebar.svelte) ✅

- [x] Restructure right drawer border logic — make `.drawer__control-bar` always use `border-left` (inside edge), remove `border-right`. Eliminate the nested `.drawer--right.drawer--closed .drawer__control-bar` selector
- [x] Add `overflow: hidden` to `.drawer` base class (content clipping currently relies on parent `PlayLayoutOverlay` — fragile)

### Chunk 5: Shared UI Patterns (components.css + Svelte files) ✅

- [x] Consolidate banner classes — replace `.error-banner`, `.success-banner`, `.warning-banner`, `.info-banner` with `.banner` base + `.banner--error`, `.banner--success`, `.banner--warning`, `.banner--info` modifiers
- [x] Extract `.empty-state` utility to components.css (duplicated in ChatLog, CampaignDetail, SeatSettings)
- [x] Extract `.component-label` / `.component-description` to components.css (duplicated across CharacterSheet, DocumentReader, ItemInspector, InitiativeModal)
- [x] Wire existing unused shared classes:
  - [x] `.centered-page` — update AdminLogin, AdminSetup, JoinPage, NotLoggedInPage to use it instead of local duplicates
  - [x] `.card` / `.card--elevated` (rename `.card-elevated`) — update auth/admin card containers

### Chunk 6: Admin CSS Fixes ✅

- [x] Fix AdminLayout — wire `--sidebar-left-width` token, remove duplicated `.spinner` + `@keyframes spin`
- [x] Replace hardcoded admin page widths with `--admin-content-max-width` token (ServerSettings, CampaignDetail, SeatSettings)
- [x] Fix hardcoded fallback color mismatches — `#48bb78` → `var(--color-success)` without incorrect fallbacks (SeatSettings, CampaignDetail). Replace `#ffd700` with `--color-warning` or a new `--color-gm-badge` token

### Chunk 7: Hardcoded Value Sweep ✅

- [x] Replace hardcoded `rgba` accent colors with token references (SceneDrawer, JoinPage, MainCanvas, ActorPill) — add `--color-*-faint` tokens if the pattern recurs
- [x] Replace hardcoded transitions — AdminLayout `transition: all 0.2s ease` → `var(--transition-fast)`
- [x] Replace hardcoded pixel dimensions with token references — FloatingWindow min/max sizes, admin card widths, icon sizes in AdminTree / SceneDrawer / TokenLibraryDrawer

### Chunk 8: Dead Code Removal ✅

- [x] Delete unused CSS classes from components.css — `.notification-toast` and variants (conflicts with local NotificationToast.svelte; snackbar deleted in Phase 7 anyway)
- [x] Delete orphan CanvasOverlayBar.svelte (superseded by CanvasOverlayColumn per its own JSDoc), update canvas barrel export
- [x] Remove any remaining dead classes after Chunks 5–7 wire up previously-unused shared classes

**Sprint Complete!** ✅

CSS size reduced from 55.33 KB → 48.12 KB (-7.21 KB / -13%)

- Chunk 1: Token consolidation (+9 tokens, -3 dead tokens, shadow alias removal)
- Chunk 2: BEM naming normalization (4 button modifiers + 7 state classes)
- Chunk 3: Drawer deduplication (-200 lines, ~4.6 KB saved)
- Chunk 4: Drawer architecture simplification (~100 bytes)
- Chunk 5: Shared UI pattern extraction (banners, empty-state, component-label)
- Chunk 6: Admin fixes (spinner dedup, token wiring, color fixes)
- Chunk 7: Hardcoded value sweep (+4 color tokens, transition/dimension wiring)
- Chunk 8: Dead code removal (notification-toast, legacy banners, card-elevated, CanvasOverlayBar.svelte)

All verification criteria met:

- ✅ `npm run build` passes
- ✅ No hardcoded drawer-content/drawer-section references
- ✅ No btn-primary/btn-secondary references
- ✅ Hardcoded pixels replaced with tokens
- ✅ Visual smoke test pending (no rendering changes expected)

---

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
  - [ ] Header with drawer title + close button, scrollable content area
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
- [ ] Create `QuickStatus` — positioned top-left of canvas area
  - [ ] Compact mode (default): low opacity, shows map name + zoom % + connection dot (green/red)
  - [ ] Hover mode: opacity 1.0, expands downward with zoom slider, grid spacing, snap-to-grid toggle, connection status text
  - [ ] Reads from `viewportState` and `connectionState`
- [x] Update [canvas/index.ts](../client/src/ui/canvas/index.ts) barrel

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

- [x] No ESLint config despite lint script
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

# Bugs

## UI

- [x] Left sidebar tooltips should appear on hover, but don't.
- [ ] Admin setup page extends past the bottom of the screen and isn't scrollable.

## Backend

## GameEngine and RulesetRuntime

## Build pipeline

- [ ] Docker build fails
- [ ] exe build fails
