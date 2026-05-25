# WebSocket Secure (WSS) Protocol — HearthVTT (`docs/protocols/realtime-ws.md`)

This document defines the real-time WebSocket Secure (WSS) protocol for client-server communication.

> **Terminology:** See [shared-types.md](../shared-types.md) for canonical definitions of GameEvent, Action, Prompt, Audience, and other shared types.

---

## Overview

The WebSocket connection uses **WSS (WebSocket Secure)** for encrypted, secure communication. While not strictly necessary for local home servers, WSS is required for production deployment to ensure:

- Encrypted communication between client and server
- Protection against man-in-the-middle attacks
- Future-proofing for internet-facing deployments

The WebSocket connection provides:

- **Server → Client:** State sync, GameEvents, Prompts, workflow updates, token movement previews
- **Client → Server:** Actions, workflow inputs, token movement (live and final)

All messages are JSON-encoded. Binary protocols (e.g., MessagePack) may be considered for performance optimization later.

---

## Connection Lifecycle

### 1. Connect and Authenticate

Client opens secure WebSocket (WSS) to `/ws`:

```
wss://server.example.com/ws
```

For local development, the connection may use `ws://localhost:3000/ws`, but production deployments **must** use WSS with valid TLS certificates.

**Authentication**: Session cookies (refresh token) are automatically sent by the browser during WebSocket upgrade. The connection URL includes the campaign ID as a query parameter (`?campaignId=<id>`) to select which seat the connection is for, since one PlayerAccount may hold seats in multiple campaigns on the same server. The server:

1. Reads cookies from the upgrade request headers
2. Validates the AuthSession → PlayerAccount
3. Resolves the seat: `SELECT * FROM seats WHERE account_id = ? AND campaign_id = ?`
4. Maps the connection to `{accountId, campaignId, seatId, roles}`
5. Registers the connection in the seat's connection set (see Multiple Connections Per Seat below)
6. If valid, completes the upgrade and sends `welcome` message
7. If session invalid, closes with 4401; if session valid but no seat in this campaign, closes with 4403

**Important**: Auth tokens are **never** sent as query parameters or in the WebSocket URL. The `campaignId` query parameter is not a secret; it's a routing hint. The session is established via the cookie.

### 2. Welcome and Initial Sync

Server sends `welcome` immediately after successful authentication:

```json
{
  "type": "welcome",
  "protocolVersion": "1.0",
  "serverVersion": "0.1.0",
  "seatId": "seat-abc123",
  "campaignId": "campaign-xyz789"
}
```

Then server sends `sync.initial` with full state:

```json
{
  "type": "sync.initial",
  "payload": {
    "campaignState": {
      /* full CampaignState */
    },
    "recentEvents": [
      /* last N EventRecords */
    ],
    "activePrompts": [
      /* Prompts awaiting this seat */
    ],
    "activeWorkflows": [
      /* WorkflowStates involving this seat */
    ]
  }
}
```

### 3. Steady State

After initial sync, server sends incremental updates. Client sends actions and inputs.

### 4. Reconnect

On disconnect, client should attempt reconnection with exponential backoff. On reconnect:

- Client sends `{ type: "resume", lastEventSeq }` after receiving `welcome`
- Server replies with event backlog since `lastEventSeq` or full `sync.initial` if too stale
- Server re-sends any outstanding prompts for that seat

### 5. Disconnect

On disconnect, the server removes the connection from the seat's connection set. **Pending prompts and workflows are NOT cleaned up** — they remain in server-owned state and will be re-sent on the next reconnect (from this device or any other device the seat is connected from).

See [auth-join-flow.md](../components/auth-join-flow.md) for complete authentication specification.

---

## Multiple Connections Per Seat

A seat may have **multiple simultaneous WebSocket connections**: multi-tab usage (map + character sheet pop-out), multi-device (laptop + phone), or both. The server keeps a `Set<WebSocket>` per `(accountId, seatId)` and broadcasts state changes to all connections in the set.

### State authority rule

All transient interactive state is **server-owned**. Each connection is a projection of server state, not an independent state machine. State that is server-owned and broadcast to all of a seat's connections:

- Prompts (status: `pending` | `resolved` | `cancelled`)
- Workflow steps
- Initiative tracker state and "whose turn" indicator
- Token positions (after server-confirmed move)
- Fog reveals
- Chat / event log

This is the architectural answer to the "stale prompt on second device" problem: prompts are not delivered messages, they are state with a status. When one device resolves a prompt, the server updates the prompt's status and broadcasts the change to all of the seat's connections. The UI on the other devices unmounts the prompt automatically because it's a function of `promptStore[promptId].status`.

### Idempotent action handling

Actions referencing a prompt or workflow step **must be idempotent against stale state**: if a client submits an action referencing a prompt that has already been `resolved` or `cancelled`, the server returns a no-op (with an info-level `error` message) rather than mutating state. This makes the inherent network race — user clicks on device B while device A's resolution is still in flight — safe by construction.

### Optimistic UI scoping

Optimistic UI updates (e.g., live token drag preview) stay **on the originating connection only**. They are NOT broadcast to the originating account's other connections. Other devices see only server-confirmed positions.

The `token.move.preview` channel (described below) is for broadcasting _other seats'_ drags to this seat, not for broadcasting this seat's drags back to itself. The originating device renders its own preview locally; the server only sends `token.move.preview` to other seats' connections.

### Reconnect is cheap

Because all state is server-owned, opening a new connection on a new device requires only:

1. Send current `sync.initial` (campaign state, recent events, pending prompts, active workflows).
2. New connection joins the broadcast set.

There is no per-device session state to migrate.

---

## Message Types

### Server → Client

| Type                     | Description                                             |
| ------------------------ | ------------------------------------------------------- |
| `welcome`                | Sent after successful auth; includes seat/campaign info |
| `sync.initial`           | Full state on connect                                   |
| `sync.delta`             | JSON Patch to CampaignState                             |
| `event.new`              | New GameEvent to display in chat                        |
| `prompt.create`          | New Prompt for this seat                                |
| `prompt.cancel`          | Prompt cancelled (timeout, superseded)                  |
| `workflow.update`        | WorkflowState changed                                   |
| `token.move.preview`     | Another seat is dragging a token (ghost position)       |
| `token.move.preview.end` | Token drag ended (clear ghost)                          |
| `error`                  | Error message (validation failure, etc.)                |

### Client → Server

| Type                 | Description                             |
| -------------------- | --------------------------------------- |
| `resume`             | Request reconnect with event backlog    |
| `action`             | Dispatch an Action for resolution       |
| `workflow.input`     | Respond to a Prompt within a workflow   |
| `token.move.preview` | Live token drag position (throttled)    |
| `token.move`         | Final token position (drop)             |
| `ping`               | Keepalive (server responds with `pong`) |

---

## Message Schemas

### `welcome`

```ts
interface WelcomeMessage {
  type: 'welcome';
  protocolVersion: string; // e.g., "1.0"
  serverVersion: string; // e.g., "0.1.0"
  seatId: string;
  campaignId: string;
}
```

### `resume`

```ts
interface ResumeMessage {
  type: 'resume';
  lastEventSeq: number; // Last event sequence number client received
}
```

### `sync.initial`

```ts
interface SyncInitialMessage {
  type: 'sync.initial';
  payload: {
    campaignState: CampaignState;
    recentEvents: EventRecord[];
    activePrompts: Prompt[];
    activeWorkflows: WorkflowState[];
    seat: Seat; // This client's seat info
  };
}
```

### `sync.delta`

```ts
interface SyncDeltaMessage {
  type: 'sync.delta';
  payload: {
    patch: JsonPatch[]; // RFC 6902 JSON Patch
    version: number; // State version for ordering
  };
}
```

### `event.new`

```ts
interface EventNewMessage {
  type: 'event.new';
  payload: {
    event: GameEvent;
    record: EventRecord; // Includes ID, timestamp
  };
}
```

### `prompt.create`

```ts
interface PromptCreateMessage {
  type: 'prompt.create';
  payload: {
    prompt: Prompt;
    workflowId?: string; // If part of a workflow
  };
}
```

### `prompt.cancel`

```ts
interface PromptCancelMessage {
  type: 'prompt.cancel';
  payload: {
    promptId: string;
    reason: 'timeout' | 'superseded' | 'cancelled';
  };
}
```

### `workflow.update`

```ts
interface WorkflowUpdateMessage {
  type: 'workflow.update';
  payload: {
    workflowId: string;
    state: WorkflowState;
  };
}
```

### `token.move.preview` (Server → Client)

```ts
interface TokenMovePreviewMessage {
  type: 'token.move.preview';
  payload: {
    tokenId: TokenId;
    position: Position;
    seatId: string; // Who is dragging
  };
}
```

### `token.move.preview.end`

```ts
interface TokenMovePreviewEndMessage {
  type: 'token.move.preview.end';
  payload: {
    tokenId: TokenId;
  };
}
```

### `error`

```ts
interface ErrorMessage {
  type: 'error';
  payload: {
    code: string;
    message: string;
    correlationId?: string; // Matches client request if applicable
  };
}
```

### `action` (Client → Server)

```ts
interface ActionMessage {
  type: 'action';
  payload: {
    action: Action;
    correlationId?: string; // Optional, for tracking responses
  };
}
```

### `workflow.input` (Client → Server)

```ts
interface WorkflowInputMessage {
  type: 'workflow.input';
  payload: {
    workflowId: string;
    promptId: string;
    actionIndex: number; // Which PromptAction was selected
    data?: unknown; // Additional data (target selection, etc.)
  };
}
```

### `token.move.preview` (Client → Server)

```ts
interface TokenMovePreviewClientMessage {
  type: 'token.move.preview';
  payload: {
    tokenId: TokenId;
    position: Position;
  };
}
```

### `token.move` (Client → Server)

```ts
interface TokenMoveMessage {
  type: 'token.move';
  payload: {
    tokenId: TokenId;
    position: Position;
  };
}
```

---

## Throttling and Rate Limits

### Token Movement Previews

- Client sends at most **15-20 messages/sec** during drag
- Server broadcasts to other seats without validation (preview only)
- Excessive rate triggers rate-limit warning, then disconnect

### Actions

- No hard rate limit, but server may throttle if excessive
- Failed validation does not count against limits

### Keepalive

- Client sends `ping` every 30 seconds if no other traffic
- Server responds with `pong`
- No `pong` within 10 seconds = connection considered dead

---

## Audience Filtering

GameEvents have an `Audience` field. Server filters outgoing messages:

| Audience  | Visible To                                     |
| --------- | ---------------------------------------------- |
| `public`  | All seats                                      |
| `gm`      | GM seats only                                  |
| `blind`   | GM sees full, players see "something happened" |
| `private` | Only the originating seat + GM                 |

Prompts also have audience. A player should never receive a prompt with `audience: 'gm'`.

---

## Error Handling

### Validation Errors

If an action fails validation, server sends `error`:

```json
{
  "type": "error",
  "payload": {
    "code": "VALIDATION_FAILED",
    "message": "Token cannot move through walls",
    "correlationId": "abc123"
  }
}
```

Client should reconcile local state (e.g., snap token back).

### Reconnection

On reconnect:

1. Client opens new WSS connection
2. Server sends `sync.initial` with current state
3. Client reconciles — any local changes made during disconnect are lost
4. Active prompts/workflows are re-sent if still valid

---

## State Versioning

Each `sync.delta` includes a `version` number. If client receives out-of-order patches:

1. If `version` is sequential, apply patch
2. If `version` is ahead (missed patches), request full sync via HTTP fallback
3. If `version` is behind (duplicate), ignore

---

## Security Considerations

### TLS/SSL Requirements

**Production deployments must use WSS** with valid TLS certificates:

- **Hosted/Cloud:** Use certificates from Let's Encrypt, AWS Certificate Manager, or similar
- **Self-hosted (LAN only):** Self-signed certificates acceptable if all clients trust the certificate
- **Self-hosted (Internet-facing):** Use Let's Encrypt or other trusted CA certificates

### Certificate Considerations for Self-Hosting

Self-hosters have several options:

1. **Let's Encrypt** (recommended): Free, automated, widely trusted
   - Requires domain name and port 80/443 access for verification
   - Use certbot or similar ACME client for automatic renewal

2. **Reverse Proxy** (Caddy, nginx, Traefik):
   - Handle TLS termination at the proxy level
   - Proxy can communicate with server over plain HTTP/WS locally
   - Recommended approach for Docker deployments

3. **Self-signed certificates**:
   - Requires manual trust installation on all client devices
   - Not recommended for guests/players unfamiliar with certificate management
   - Browsers will show security warnings

### Development Mode

For local development only, plain `ws://` connections to `localhost` are acceptable. The client should support both protocols, with WSS required when connecting to non-localhost hosts.

---

## Future Considerations

### Binary Protocol

MessagePack or similar binary encoding for reduced bandwidth. Would require protocol version negotiation on connect.

### Compression

WebSocket per-message deflate may be enabled for large payloads.

### Multi-Tab Support

If same user opens multiple tabs, each is a separate WSS connection. Server should handle gracefully (same seat, multiple connections).

---
