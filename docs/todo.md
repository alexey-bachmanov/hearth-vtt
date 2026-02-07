# Todo List Strategy

**Workflow:** Items in "Tech Debt" represent known issues organized by category. When we decide to tackle a category, we **promote it to "Current Projects"** with a comprehensive, step-by-step plan. This prevents plans from rolling out of context during implementation.

As work completes, check off tasks and archive completed projects to keep this document focused on active and pending work.

---

# Current Projects

## Tech Debt Cleanup Sprint (Feb 2026)

**Goal:** Harden existing code, fix security gaps, sync documentation, and establish testing foundation. No new features — focus on risk reduction and maintainability.

**Verification criteria:**

- `npm run build` passes in client and server after each phase
- Docker build succeeds after Phase 5
- Manual smoke test: admin setup → login → create campaign → logout over HTTP locally

### Phase 1: Security Hardening (Highest Priority)

**Rationale:** Fix active vulnerabilities in production code and add guards to stub endpoints.

- [x] Gate stub routes with dev-only flag
  - [x] Add `NODE_ENV=development` check to top of [auth.ts](../server/src/routes/auth.ts) (return 501 in production)
  - [x] Add check to [sessions.ts](../server/src/routes/sessions.ts)
  - [x] Add check to stub portions of [seats.ts](../server/src/routes/seats.ts) and [invites.ts](../server/src/routes/invites.ts)
- [x] Restrict CORS configuration
  - [x] Change `origin: true` in [server.ts](../server/src/server.ts#L83) to function checking same-origin + `PUBLIC_BASE_URL`
- [x] Add password max-length validation (1024 bytes) in [admin-auth.ts](../server/src/routes/admin-auth.ts#L342) to prevent HashDoS
- [x] Make admin cookie `secure` conditional on environment
  - [x] Change `secure: true` to `secure: process.env.NODE_ENV === 'production'` in [admin-auth.ts](../server/src/routes/admin-auth.ts#L375)
- [x] Configure `trustProxy` from `TRUST_PROXY` env var in [server.ts](../server/src/server.ts#L79) for rate limiting behind proxies
- [ ] Add rate limit map cleanup
  - [ ] Create periodic sweep (hourly) to remove expired entries from `rateLimitMap` in [admin-auth.ts](../server/src/routes/admin-auth.ts#L33)
- [ ] Enable SQLite foreign keys
  - [ ] Add `PRAGMA foreign_keys = ON` in `SqliteStorage.init()` [sqlite-storage.ts](../server/src/storage/sqlite-storage.ts)
  - [ ] Add same pragma in `getOrCreateCampaignDb()`
- [ ] Add `campaignId` format validation
  - [ ] Verify UUID format in `getOrCreateCampaignDb` before constructing paths (defense against path traversal)

### Phase 2: Server Code Quality

- [ ] Remove debug logging — delete 6 `console.log('DEBUG: ...')` in [server.ts](../server/src/server.ts#L50-L56)
- [ ] Implement graceful shutdown
  - [ ] Register `SIGTERM`/`SIGINT` handlers in [index.ts](../server/src/index.ts)
  - [ ] Call `server.close()` on shutdown
  - [ ] Clear cleanup interval
  - [ ] Close storage connections
- [ ] Add `close()` method to Storage/SqliteStorage
  - [ ] Close `metadataDb` connection
  - [ ] Close all `campaignDbs` connections
  - [ ] Call from shutdown handler
- [ ] Enable SQLite WAL mode
  - [ ] Add `PRAGMA journal_mode=WAL` to metadata DB init
  - [ ] Add same pragma to campaign DB init
- [ ] Fix `StorageBackend.createAdminSession` interface — add missing `csrfToken` parameter in [storage.ts](../server/src/storage/storage.ts#L197)
- [ ] Read version from package.json in [health.ts](../server/src/routes/health.ts#L13) instead of hardcoding
- [ ] Persist `COOKIE_SECRET`
  - [ ] Generate to file in `DATA_DIR` if not provided via env var
  - [ ] Load from file on startup if exists
  - [ ] Ensures sessions survive restarts

### Phase 3: Client Cleanup

- [ ] Extract shared CSS
  - [ ] Create shared CSS file or component library for common button/form/error styles
  - [ ] Replace duplicated CSS in 6 admin components: AdminLogin, AdminSetup, CampaignDetail, SeatSettings, ServerSettings
- [ ] Add missing CSS custom properties to [tokens.css](../client/src/styles/tokens.css)
  - [ ] `--shadow-large`
  - [ ] `--shadow-medium`
  - [ ] `--color-accent-secondary`
  - [ ] `--color-danger`
  - [ ] `--color-error-dark`
  - [ ] `--color-bg-hover`
  - [ ] `--color-border-hover`
  - [ ] `--radius-xs`
- [ ] Fix JoinPage error handling — replace `catch` block checking `err.status` with `response.ok` pattern in [JoinPage.svelte](../client/src/ui/auth/JoinPage.svelte#L37)
- [ ] Update stale barrel files
  - [ ] Fix [canvas/index.ts](../client/src/ui/canvas/index.ts) to export MainCanvas
  - [ ] Fix [snackbar/index.ts](../client/src/ui/snackbar/index.ts) to export components
- [ ] Fix Svelte rune misuse
  - [ ] Change static `$derived` to `$state` in CampaignDetail
  - [ ] Change static `$derived` to `$state` in SeatSettings
  - [ ] Fix immutable `$state` on `const` in PlayLayout and SnackbarArea
- [ ] Remove commented-out code
  - [ ] Clean commented imports in [ws.ts](../client/src/api/ws.ts#L21)
  - [ ] Remove unused `renderer` import in [MainCanvas.svelte](../client/src/ui/canvas/MainCanvas.svelte#L17)

### Phase 4: Documentation Sync

- [ ] Update [server.md](../docs/components/server.md) directory layout
  - [ ] Change `app.ts` references to `server.ts`
  - [ ] Change `ws/` directory to `routes/ws.ts`
  - [ ] Remove references to nonexistent `config.ts`, `logger.ts`, `static.ts`
- [ ] Fix `check-setup` endpoint docs — change `GET` to `POST` in:
  - [ ] [auth-join-flow.md](../docs/components/auth-join-flow.md)
  - [ ] [http-api.md](../docs/protocols/http-api.md)
- [ ] Standardize cookie `sameSite` to `Strict` in all references in [auth-join-flow.md](../docs/components/auth-join-flow.md)
- [ ] Fix invite route paths in [auth-join-flow.md](../docs/components/auth-join-flow.md) to `/api/campaigns/:id/invites`
- [ ] Remove `role: 'admin'` from mock data in [seats.ts](../server/src/routes/seats.ts#L26)
- [ ] Document `GET /api/info` endpoint in [http-api.md](../docs/protocols/http-api.md)
- [ ] Document CORS configuration and SPA fallback behavior
- [ ] Align TypeScript versions across workspaces to single version

### Phase 5: Build Fixes

- [ ] Fix Dockerfile workspace stages
  - [ ] Copy sibling `package.json` files so `npm ci --workspace=X` resolves correctly
- [ ] Remove redundant local build from [build-docker.js](../scripts/build-docker.js)
- [ ] Add builder stage in Dockerfile for native module compilation
  - [ ] Separate compilation from runtime image
  - [ ] Remove `python3 make g++` from production image
- [ ] Fix `build-exe.js` README — change `HOST=0.0.0.0` to `127.0.0.1` default

### Phase 6: Testing Foundation

- [ ] Create `vitest.config.ts` in server workspace
- [ ] Implement `InMemoryBackend` implementing `StorageBackend` interface
- [ ] Write first test suite: Storage CRUD operations
  - [ ] Campaign create/read/update/delete
  - [ ] Seat create/list/update/delete
  - [ ] Invite create/claim/revoke
  - [ ] Admin session lifecycle
- [ ] Verify unchecked admin auth todo items:
  - [ ] Test campaign creation with new schema
  - [ ] Test seat/invite/session CRUD operations
  - [ ] Test session expiration and cleanup
  - [ ] Test routing: setup → login → dashboard flows

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

- [ ] `FloatingWindowLayer` maintains separate `$state` disconnected from `uiState.openWindows` [FloatingWindowLayer.svelte](../client/src/ui/window/FloatingWindowLayer.svelte#L10)
- [ ] `RightSidebar` maintains own `activeDrawer` instead of using `uiState` [RightSidebar.svelte](../client/src/ui/sidebar/RightSidebar.svelte#L17)

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
- [ ] SettingsDrawer checkboxes lack explicit IDs/`for` [SettingsDrawer.svelte](../client/src/ui/sidebar/SettingsDrawer.svelte#L21)
- [ ] FloatingWindow drag has no keyboard navigation [FloatingWindow.svelte](../client/src/ui/window/FloatingWindow.svelte#L55)
- [ ] No focus trap in floating windows or modals
- [ ] Emoji-only buttons lack `aria-label` throughout admin UI
- [ ] No skip navigation or landmark roles in PlayLayout
- [ ] PromptSnackbar buttons have no handlers or ARIA description
- [ ] NotificationToast close button lacks `aria-label`

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

- [ ] TypeScript versions inconsistent across workspaces (root/server `^5.3.3`, client `^5.9.3`, ADR says `^5.6.3`)
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

---
