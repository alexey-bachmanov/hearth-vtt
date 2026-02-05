# HTTP API — HearthVTT (`docs/protocols/http-api.md`)

This document defines the HTTP REST API for HearthVTT, including authentication, campaign management, and admin endpoints.

> **Terminology:** See [shared-types.md](../shared-types.md) for canonical definitions of Seat, AuthSession, Invite, and other shared types.

---

## Overview

The HTTP API provides:

- **Authentication**: Join links, invite claims, session management
- **Campaign Management**: CRUD operations for campaigns (admin-only)
- **Admin Operations**: Seat management, invite creation/revocation, session auditing
- **Health Checks**: Server status, version info

All endpoints use JSON for request/response bodies unless otherwise specified.

---

## Authentication

### Public Join Page

#### `GET /join/<inviteToken>`

Entry point for users joining via invite link.

**Response**: HTML page with claim UI (or SPA route to claim component)

**Notes**:

- Never require users to bookmark this URL
- Validate invite token and show "expired link" page if invalid/revoked
- This route is public (no auth required)

---

### Claim Invite

#### `POST /api/auth/claim-invite`

Claim an invite and create an authenticated session.

**Request Body**:

```json
{
  "inviteToken": "long-random-token-here",
  "pin": "1234",
  "deviceName": "Alice's Laptop (optional)",
  "userAgent": "Mozilla/5.0... (optional, can be extracted from headers)"
}
```

**Response** (200 OK):

```json
{
  "campaignId": "campaign-abc123",
  "seatId": "seat-xyz789",
  "role": "player",
  "redirectUrl": "/play"
}
```

**Cookies Set**:

- `hearth_refresh`: HttpOnly, Secure, SameSite=Lax refresh token

**Error Responses**:

- `404 Not Found`: Invite token not found or expired
- `401 Unauthorized`: Incorrect PIN or too many failed attempts
- `429 Too Many Requests`: Rate limit exceeded

---

### Refresh Session

#### `POST /api/auth/refresh`

Use refresh token to obtain a new access token and rotate refresh token.

**Request**: No body (uses refresh token cookie)

**Response** (200 OK):

```json
{
  "accessToken": "short-lived-jwt-or-opaque-token",
  "expiresIn": 900
}
```

**Cookies Set**:

- `hearth_refresh`: New refresh token (old one is invalidated)

**Error Responses**:

- `401 Unauthorized`: Invalid or expired refresh token
- `403 Forbidden`: Session revoked

---

### Logout

#### `POST /api/auth/logout`

Revoke current session and clear cookies.

**Request**: No body (uses refresh token cookie)

**Response** (204 No Content)

**Cookies Cleared**:

- `hearth_refresh`

---

## Campaign Management (Admin-only)

### List Campaigns

#### `GET /api/campaigns`

List all campaigns on this server.

**Auth**: Admin seat required

**Response** (200 OK):

```json
{
  "campaigns": [
    {
      "id": "campaign-abc123",
      "name": "Lost Mines of Phandelver",
      "rulesetId": "dnd5e",
      "createdAt": "2025-01-15T10:30:00Z",
      "updatedAt": "2025-02-05T14:22:00Z"
    }
  ]
}
```

---

### Create Campaign

#### `POST /api/campaigns`

Create a new campaign. Automatically creates an immutable admin seat.

**Auth**: Server admin or authenticated user (policy TBD)

**Request Body**:

```json
{
  "name": "Dragon Heist",
  "rulesetId": "dnd5e",
  "settings": {}
}
```

**Response** (201 Created):

```json
{
  "campaign": {
    "id": "campaign-xyz789",
    "name": "Dragon Heist",
    "rulesetId": "dnd5e",
    "createdAt": "2025-02-05T15:00:00Z",
    "updatedAt": "2025-02-05T15:00:00Z"
  },
  "adminSeat": {
    "id": "seat-admin-001",
    "campaignId": "campaign-xyz789",
    "name": "Admin",
    "role": "admin",
    "isImmutable": true
  },
  "adminInvite": {
    "inviteToken": "long-random-admin-invite-token",
    "inviteUrl": "https://example.com/join/long-random-admin-invite-token"
  }
}
```

**Notes**:

- Admin seat is created automatically and cannot be deleted
- Admin invite is one-time use for initial admin access

---

### Get Campaign

#### `GET /api/campaigns/<campaignId>`

Get campaign details.

**Auth**: Admin or GM of campaign

**Response** (200 OK):

```json
{
  "id": "campaign-abc123",
  "name": "Lost Mines",
  "rulesetId": "dnd5e",
  "createdAt": "2025-01-15T10:30:00Z",
  "updatedAt": "2025-02-05T14:22:00Z",
  "settings": {}
}
```

---

### Update Campaign

#### `PATCH /api/campaigns/<campaignId>`

Update campaign metadata.

**Auth**: Admin seat only

**Request Body**:

```json
{
  "name": "Updated Name",
  "settings": {
    "theme": "dark"
  }
}
```

**Response** (200 OK): Updated campaign object

---

### Delete Campaign

#### `DELETE /api/campaigns/<campaignId>`

Delete a campaign and all associated data.

**Auth**: Admin seat only

**Response** (204 No Content)

**Warning**: This is destructive and irreversible. Consider requiring confirmation.

---

## Seat Management (Admin-only)

### List Seats

#### `GET /api/campaigns/<campaignId>/seats`

List all seats in a campaign.

**Auth**: Admin or GM

**Response** (200 OK):

```json
{
  "seats": [
    {
      "id": "seat-admin-001",
      "name": "Admin",
      "role": "admin",
      "isImmutable": true,
      "createdAt": "2025-01-15T10:30:00Z"
    },
    {
      "id": "seat-player-001",
      "name": "Alice",
      "role": "player",
      "isImmutable": false,
      "createdAt": "2025-01-15T11:00:00Z"
    }
  ]
}
```

---

### Create Seat

#### `POST /api/campaigns/<campaignId>/seats`

Create a new seat.

**Auth**: Admin seat only

**Request Body**:

```json
{
  "name": "Bob",
  "role": "player"
}
```

**Response** (201 Created): Created seat object

---

### Update Seat

#### `PATCH /api/campaigns/<campaignId>/seats/<seatId>`

Update seat metadata (name, role).

**Auth**: Admin seat only

**Request Body**:

```json
{
  "name": "Robert",
  "role": "gm"
}
```

**Response** (200 OK): Updated seat object

---

### Delete Seat

#### `DELETE /api/campaigns/<campaignId>/seats/<seatId>`

Delete a seat (cannot delete admin seat).

**Auth**: Admin seat only

**Response** (204 No Content)

**Error Responses**:

- `403 Forbidden`: Cannot delete immutable admin seat

---

## Invite Management (Admin-only)

### List Invites

#### `GET /api/campaigns/<campaignId>/invites`

List all invites for a campaign.

**Auth**: Admin seat only

**Response** (200 OK):

```json
{
  "invites": [
    {
      "id": "invite-001",
      "inviteToken": "long-random-token",
      "inviteUrl": "https://example.com/join/long-random-token",
      "seatId": "seat-player-002",
      "rolesGranted": ["player"],
      "expiresAt": "2025-02-12T10:30:00Z",
      "maxClaims": 1,
      "claimedAt": null,
      "revokedAt": null,
      "createdAt": "2025-02-05T10:30:00Z"
    }
  ]
}
```

---

### Create Invite

#### `POST /api/campaigns/<campaignId>/invites`

Create a new invite for a seat.

**Auth**: Admin seat only

**Request Body**:

```json
{
  "seatId": "seat-player-002",
  "rolesGranted": ["player"],
  "pin": "1234",
  "expiresIn": 604800,
  "maxClaims": 1
}
```

**Alternative** (create seat on claim):

```json
{
  "seatTemplate": {
    "name": "New Player",
    "role": "player"
  },
  "rolesGranted": ["player"],
  "pin": "1234",
  "expiresIn": 604800,
  "maxClaims": 1
}
```

**Response** (201 Created):

```json
{
  "invite": {
    "id": "invite-002",
    "inviteToken": "newly-generated-token",
    "inviteUrl": "https://example.com/join/newly-generated-token",
    "expiresAt": "2025-02-12T15:00:00Z"
  }
}
```

---

### Revoke Invite

#### `DELETE /api/campaigns/<campaignId>/invites/<inviteId>`

Revoke an invite (mark as revoked, prevent future claims).

**Auth**: Admin seat only

**Response** (204 No Content)

---

## Session Management (Admin-only)

### List Active Sessions

#### `GET /api/campaigns/<campaignId>/sessions`

List all active AuthSessions for a campaign.

**Auth**: Admin seat only

**Response** (200 OK):

```json
{
  "sessions": [
    {
      "id": "session-001",
      "seatId": "seat-player-001",
      "deviceName": "Alice's Laptop",
      "lastUsedAt": "2025-02-05T15:30:00Z",
      "createdAt": "2025-02-05T10:00:00Z",
      "expiresAt": "2025-02-12T10:00:00Z"
    }
  ]
}
```

---

### Revoke Session

#### `DELETE /api/sessions/<sessionId>`

Revoke a specific AuthSession (force logout).

**Auth**: Admin seat or session owner

**Response** (204 No Content)

---

## Health and Status

### Health Check

#### `GET /health`

Check if server is healthy.

**Auth**: None (public)

**Response** (200 OK):

```json
{
  "status": "ok",
  "version": "0.1.0",
  "uptime": 3600
}
```

---

### Server Info

#### `GET /api/info`

Get server version and capabilities.

**Auth**: None (public)

**Response** (200 OK):

```json
{
  "version": "0.1.0",
  "protocolVersion": "1.0",
  "features": ["wss", "cookie-auth", "admin-ui"]
}
```

---

## Error Responses

All error responses follow this format:

```json
{
  "error": {
    "code": "INVITE_EXPIRED",
    "message": "This invite link has expired",
    "details": {}
  }
}
```

Common error codes:

- `INVALID_TOKEN`: Auth token invalid or expired
- `INVITE_EXPIRED`: Invite token expired
- `INVITE_CLAIMED`: Invite already claimed
- `INCORRECT_PIN`: PIN does not match
- `RATE_LIMIT`: Too many requests
- `FORBIDDEN`: Insufficient permissions
- `NOT_FOUND`: Resource not found

---

## CSRF Protection

All state-changing endpoints (POST, PATCH, DELETE) require CSRF protection:

- **Cookie-based**: Use SameSite=Lax cookies + Origin header validation
- **Token-based** (optional): CSRF token in request header

See [ADR 005](../decisions/005-networking-management.md) and [auth-join-flow.md](../components/auth-join-flow.md) for security considerations.

---
