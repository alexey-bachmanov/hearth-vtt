# Architecture and Planning

## Admin Auth & Session Management (In Progress)

### Database Schema Refactor

- [x] Move seats/invites/auth_sessions from metadata.db to campaign DBs
- [x] Create token lookup index tables in metadata.db
- [x] Update Storage interface and implementation methods
- [ ] Test campaign creation with new schema
- [ ] Test seat/invite/session CRUD operations
- [ ] Verify atomic campaign deletion (entire DB file)

### Session Management & Security

- [ ] Reduce admin session duration from 30 days to 1 hour
- [ ] Implement sliding window session extension (extend on activity)
- [ ] Update `requireAdminAuth` middleware to extend sessions
- [ ] Add `updateAdminSession()` method to Storage
- [ ] Always set `secure: true` on admin cookies (even in dev)
- [ ] Change admin cookie `sameSite` from 'lax' to 'strict'

### CSRF Protection

- [ ] Add `csrf_token` column to admin_sessions table
- [ ] Generate CSRF token on login/setup (return in response body)
- [ ] Create `requireCsrfToken` middleware
- [ ] Apply CSRF middleware to all state-changing admin routes
- [ ] Create admin state Svelte store for CSRF token
- [ ] Create `adminFetch()` helper to include CSRF header
- [ ] Update all admin API calls to use `adminFetch()`

### Rate Limiting

- [ ] Create in-memory rate limit tracker (Map)
- [ ] Add rate limiting to `/api/admin/setup` (5 attempts / 10 min)
- [ ] Add rate limiting to `/api/admin/login` (5 attempts / 10 min)
- [ ] Add rate limiting to `/api/admin/change-password` (3 attempts / 10 min)
- [ ] Return 429 status on rate limit exceeded

### Admin UI Routing & Logic

- [ ] Make password mandatory in AdminSetup.svelte
- [ ] Fix AdminLogin.svelte to use GET /api/admin/check-auth
- [ ] Store CSRF token from login/setup responses
- [ ] Add logout button to AdminLayout.svelte
- [ ] Implement logout flow (POST /api/admin/logout → redirect)
- [ ] Test routing: setup → login → dashboard flows
- [ ] Verify redirect behavior on session expiration

### Session Cleanup

- [ ] Add `cleanupExpiredAdminSessions()` to Storage
- [ ] Add periodic cleanup job to server.ts (every hour)
- [ ] Update setup PIN cleanup (only delete after password set)
- [ ] Test session expiration and cleanup

## Stub types to define (see shared-types.md)

- [ ] Define shape for `RollModifier` — modifiers applied to dice rolls from effects
- [ ] Define shape for `StatModifier` — modifiers applied to derived stats from effects
- [ ] Define shape for `SyncBundle` — initial state bundle sent to clients on connect
- [ ] Define shape for `RealtimeHub` — interface for broadcasting to connected clients
- [ ] Define shape for `Logger` — structured logging interface

## Tome/Ruleset integration

- [ ] Define template lookup API — how Tome entries reference Ruleset resolver templates
- [ ] Define Compendium loading — how Tomes are indexed at session start

---

# Future milestones (not required yet)

- Campaign import/export:
  - `.campaign` zip unpack into working dir + SQLite + assets
  - export packages SQLite + assets into `.campaign`
- Action engine + ruleset loading
- State delta broadcasting and prompt delivery
- Hosted mode configuration (TRUST_PROXY, PUBLIC_BASE_URL, persistent volumes)
- Audit logging for admin actions
- Multi-admin support with roles/permissions
- Two-factor authentication option
- Password reset via secure channel

---
