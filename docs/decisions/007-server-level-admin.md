# 007: Server-Level Admin Authentication

## Status

Accepted

## Context

HearthVTT initially designed admin permissions as **per-campaign admin seats**: each campaign would automatically create an immutable "admin" seat on creation, and the seat holder would manage that campaign's access control (invites, seats, sessions). This model had several issues:

### Problems with Per-Campaign Admin Seats

1. **Self-hosted complexity**: In self-hosted deployments, the person running the server should inherently have admin access without going through the invite-claim flow. Per-campaign admin seats required minting special invites or bypassing the auth system entirely.

2. **Server-wide operations**: Campaign creation, deletion, import, and export are **server operations**, not campaign operations. A per-campaign admin in Campaign A shouldn't be blocked from creating Campaign B, but they also shouldn't automatically be admin of Campaign B.

3. **Unclear hierarchy**: The data model hierarchy is: Server → Campaigns → Seats → Invites. Per-campaign admin seats conflated "who runs the server" with "who participates in this campaign," making the ownership model muddy.

4. **Authentication bypass needed**: Admin UI access requires authentication, but per-campaign admin seats meant either:
   - Admin must claim an invite to access admin UI (awkward for server operator)
   - Admin UI bypasses authentication entirely (insecure)
   - Admin gets a "virtual seat" that bypasses normal auth (complex)

5. **Multi-campaign management**: Self-hosted users typically run multiple campaigns on one server. Per-campaign admin seats meant either creating an admin seat in each campaign (tedious) or special-casing server operations (inconsistent).

### Deployment Scenarios

HearthVTT supports three deployment modes:

1. **Pure self-hosted** (localhost only): Admin has physical access to server machine
2. **Tunneled self-hosted** (Cloudflare Tunnel, ngrok, etc.): Admin runs server locally but exposes endpoints to internet
3. **Cloud-hosted SaaS**: Server runs in managed infrastructure; admin never has console access

Each mode has different security requirements:

- **Localhost**: Physical access provides inherent security
- **Tunneled**: Admin UI exposed to internet, needs strong authentication
- **Cloud**: Platform account system can gate admin access, but needs server-level admin for initial setup

### Existing Auth System

HearthVTT already has a **seat-based authentication system** for players:

- Players receive invite links with PIN protection
- Claiming an invite creates a seat and session (cookie-based)
- Sessions authenticate WebSocket connections and API calls

The challenge: **How should the server operator (admin) authenticate for server-wide operations, across all three deployment modes, without conflating admin identity with seat membership?**

## Decision

**HearthVTT will use a separate server-level admin authentication system, distinct from seat-based player authentication.**

### Core Changes

1. **Server-Level Admin Entity**: Create a `server_admin` table (not per-campaign) to store admin credentials. One admin per server (extensible to multiple admins later if needed).

2. **Setup PIN Authentication**: On first server startup, generate a random 8-character alphanumeric setup PIN (128+ bits entropy). Log PIN to console and write to `DATA_DIR/admin-setup-pin.txt`. PIN expires after 24 hours.

3. **Separate Admin Sessions**: Admin sessions use different cookies (`hearth_admin_session`) and database tables (`admin_sessions`) than player sessions. Admin sessions are completely independent of seat-based sessions.

4. **Admin Routes**: All server-wide operations require admin authentication:
   - Campaign CRUD (create, delete, import, export)
   - Seat management (create, update, delete)
   - Invite management (create, revoke, list)
   - Server settings

5. **Remove Admin Seats**: Seats no longer have an "admin" role. All seats are campaign-scoped and tied to campaign participation (GM, player, spectator). Admin never appears as a seat in campaigns.

6. **Tree-Based Admin UI**: Admin UI reflects the data hierarchy:
   - Server settings (root node)
   - Campaigns (children of server)
   - Seats (children of campaigns)
   - Invites (managed within seat settings, not separate nodes)

7. **Localhost Default**: Change default `HOST` binding from `0.0.0.0` (all interfaces) to `127.0.0.1` (localhost only). Self-hosted users must explicitly enable remote access or use reverse proxy.

### Authentication Flow

#### First-Time Setup (Self-Hosted)

1. Admin starts server: `./hearth-server`
2. Server generates setup PIN, logs to console and file
3. Admin visits `http://localhost:3000/admin/setup`
4. Admin enters setup PIN, optionally sets permanent password
5. Server validates PIN, creates `ServerAdmin` record, creates `AdminSession`, sets cookie
6. Admin redirected to `/admin` (server settings page)

#### Returning Admin (Self-Hosted)

1. Admin visits `http://localhost:3000/admin`
2. Server checks for valid `hearth_admin_session` cookie
3. If valid, render admin UI
4. If invalid, redirect to `/admin/login` (password form)
5. Admin enters password, server validates, creates session, redirects to `/admin`

#### Cloud-Hosted Setup

1. Platform creates server instance
2. Platform generates admin password via `ADMIN_SETUP_PIN` environment variable (no console logging)
3. Platform provides admin credentials via secure channel (email, dashboard, etc.)
4. Admin uses credentials to access admin UI via platform dashboard or direct link

## Alternatives Considered

### Alternative 1: Per-Campaign Admin Seats (Status Quo)

**Rejected**. This was the original design, but it conflates server operations with campaign membership and requires awkward workarounds for self-hosted deployments.

### Alternative 2: Environment Variable Password Only

**Pros**:

- Simple: set `ADMIN_PASSWORD=secret` in environment
- Works in all deployment modes

**Cons**:

- Password visible in process list and environment dumps
- Requires server restart to change password
- No automated setup for self-hosted users (must remember to set password)
- Bad UX for pure localhost deployments (unnecessary security ceremony)

**Decision**: Rejected. Setup PIN is more secure (randomly generated, time-limited) and provides better UX for self-hosted users.

### Alternative 3: Localhost-Only Admin UI (No Password)

**Pros**:

- Zero-ceremony for pure self-hosted deployments
- Physical access to server machine provides inherent security

**Cons**:

- Completely breaks tunneled deployments (admin UI exposed to internet with no auth)
- Requires different authentication strategies per deployment mode
- Accidental misconfiguration (binding to `0.0.0.0`) would expose admin UI

**Decision**: Rejected. While appealing for pure self-hosted, it's too fragile for tunneled deployments.

### Alternative 4: WebAuthn/Passkey from the Start

**Pros**:

- Modern, phishing-resistant authentication
- No passwords to remember or leak

**Cons**:

- Requires HTTPS (complex for pure self-hosted)
- Requires browser WebAuthn support (limits compatibility)
- High setup ceremony for simple localhost deployments
- Overkill for self-hosted VTT server

**Decision**: Rejected for initial implementation. May add later as an option for cloud-hosted deployments.

### Alternative 5: Admin as "Virtual Seat" per Campaign

Admin has a special system-generated seat in each campaign that bypasses normal seat restrictions.

**Pros**:

- Reuses existing seat-based auth system
- Admin can participate in campaigns without separate player seat

**Cons**:

- Conflates server administration with campaign participation
- Admin seat appears in campaign seat lists (confusing for GMs/players)
- Requires special-casing throughout codebase ("is this a real seat or an admin virtual seat?")
- Multi-campaign management still awkward (admin has N virtual seats for N campaigns)

**Decision**: Rejected. Adds complexity and couples unrelated concerns.

## Consequences

### Positive

1. **Clear separation of concerns**: Admin operations (server management) are distinct from campaign operations (gameplay). Admin identity is not tied to campaign membership.

2. **Self-hosted UX**: Server operators get admin access naturally via setup PIN, without needing to claim invites or bypass auth systems.

3. **Security by default**: Localhost-only binding prevents accidental exposure. Setup PIN is randomly generated and time-limited. Admin sessions are separate from player sessions.

4. **Deployment flexibility**: Same authentication model works for pure self-hosted (console-logged PIN), tunneled (password-protected), and cloud-hosted (platform-managed credentials).

5. **Simplified data model**: Server → Campaigns → Seats → Invites hierarchy is clear. No special "admin seat" concept.

6. **Future extensibility**: Server-level admin model naturally supports multiple admin users later (e.g., for team-run servers or platform managed hosting).

### Negative

1. **Two auth systems**: Server now has dual authentication: admin sessions (server-level) and seat sessions (campaign-level). More code to maintain, test, and document.

2. **Admin can't play without seat**: Admin must create a seat and claim an invite to participate in campaigns as a player or GM. Admin identity is purely for server management, not gameplay.

3. **Setup ceremony**: First-time setup requires reading console output and entering setup PIN. While better than environment variables, it's still an extra step.

4. **Session management complexity**: Admin UI must check `hearth_admin_session` cookies; play UI must check `hearth_session` cookies. Different endpoints, different middleware.

5. **Migration path needed**: Existing documentation and stub implementations assume per-campaign admin seats. All documentation, Storage signatures, and admin UI components must be updated.

### Implementation Impact

**Files requiring updates**:

- `docs/components/data-model.md` — Remove admin seat, add ServerAdmin and AdminSession
- `docs/components/server.md` — Update Storage class with admin methods
- `docs/architecture-overview.md` — Update identity and permissions section
- `docs/components/client.md` — Update admin UI description
- `docs/components/auth-join-flow.md` — Add admin auth flow section
- `server/src/storage/storage.ts` — Add admin tables and methods
- `server/src/storage/sqlite-storage.ts` — Implement admin tables
- `server/src/routes/admin-auth.ts` — New admin auth endpoints
- `server/src/index.ts` — Setup PIN generation on first run
- `client/src/ui/admin/*` — Refactor tree-based UI
- `client/src/ui/admin/AdminSetup.svelte` — New setup page
- `client/src/ui/admin/AdminLogin.svelte` — New login page

**Database schema changes**:

- Add `server_admin` table
- Add `admin_sessions` table
- Add `seats` table (finally implement per docs)
- Add `invites` table (finally implement per docs)
- Add `auth_sessions` table (finally implement per docs)
- Remove admin seat creation from campaign creation

**Testing requirements**:

- Test setup PIN generation and validation
- Test setup PIN expiry (24 hours)
- Test admin session creation and validation
- Test admin session revocation
- Test localhost-only binding (default)
- Test admin UI guards (unauthenticated → redirect)
- Test separation of admin sessions and seat sessions (different cookies)

### Risks and Mitigations

**Risk**: Setup PIN is logged to console, visible to anyone with access to logs.

**Mitigation**: PIN expires after 24 hours. For cloud deployments, use `ADMIN_SETUP_PIN` environment variable instead of generating randomly (platform manages credentials securely).

**Risk**: Admin forgets password and loses access.

**Mitigation**: Document password reset procedure: stop server, delete `admin_sessions` and `server_admin` rows, restart server (generates new setup PIN).

**Risk**: Localhost binding breaks Docker/cloud deployments.

**Mitigation**: Document that Docker/cloud deployments must set `HOST=0.0.0.0` explicitly. Dockerfile and docs will include this guidance.

**Risk**: Admin accidentally exposes admin UI to internet (binds to `0.0.0.0` for LAN play, forgets admin UI is also exposed).

**Mitigation**: Strong authentication (password-protected) means exposure is less critical. Consider adding `ADMIN_ALLOW_REMOTE` flag that restricts `/api/admin/*` routes to localhost unless explicitly enabled.

## Future Considerations

### Multiple Admin Users

Current design supports one admin per server. To support multiple admins:

- Add `admins` table (plural) instead of `server_admin` (singular)
- Add admin user management UI (create, delete, reset password)
- Add audit logging for admin actions

This is straightforward extension of current design.

### WebAuthn/Passkey Support

For cloud-hosted deployments, WebAuthn provides better security than passwords:

- Add `webauthn_credentials` table linked to `server_admin`
- Add passkey registration and authentication flows
- Maintain password fallback for compatibility

Does not require changing core architecture.

### OAuth/Platform Account Integration

For cloud-hosted platform:

- Platform account system can validate identity before allowing admin UI access
- Server still has `server_admin` record, but authentication delegated to platform
- `AdminSession` creation happens after platform validates OAuth token

Requires platform integration layer, but core admin model remains unchanged.

### Fine-Grained Admin Permissions

Currently admin has full access to all server operations. To support role-based admin access:

- Add `admin_roles` and `admin_permissions` tables
- Implement permission checks in admin route middleware
- Add permission management UI

Deferring until multi-user admin support is needed.

---

## Decision Log

- **2026-02-05**: ADR created and accepted
- Decision replaces original per-campaign admin seat design documented in data-model.md, server.md, and architecture-overview.md
