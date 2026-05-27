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

- **Server → Client:** `view` (full `SeatView` snapshots on connect/resync), `event` (incremental `WireEvent` stream during play), `pong`, `error`
- **Client → Server:** `dispatch` (engine actions), `view.request` (explicit resync), `resume` (reconnect after gap), `ping`

All messages are JSON-encoded. Binary protocols (e.g., MessagePack) may be considered for performance optimization later.

---

## Connection Lifecycle

### 1. Connect and Authenticate

Client opens secure WebSocket (WSS) to `/ws`:

```
wss://server.example.com/ws
```

For local development, the connection may use `ws://localhost:3000/ws`, but production deployments **must** use WSS with valid TLS certificates.

**Authentication**: Session cookies (refresh token) are automatically sent by the browser during WebSocket upgrade. The connection URL includes the campaign ID as a query parameter (`?campaign=<id>`) to select which seat the connection is for, since one PlayerAccount may hold seats in multiple campaigns on the same server. The server:

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

Then server sends a `view` message with the full `SeatView` for this seat:

```json
{
  "type": "view",
  "view": {
    "campaignId": "campaign-xyz789",
    "seatId": "seat-abc123",
    "seatRole": "player",
    "scene": { "/* SceneView */": "..." },
    "tokens": [],
    "actors": [],
    "recentEvents": [],
    "activePrompts": [],
    "capabilities": { "globalActions": [], "entityActions": {} },
    "rulesetPanels": [],
    "lastSeq": 42
  }
}
```

### 3. Steady State

After the initial `view`, the server streams incremental `event` messages as actions are dispatched and resolved. The client applies each `WireEvent` to its local state mirror and advances `lastSeq`.

If the client detects a gap in `seq` (i.e. `event.seq > lastSeq + 1`), it sends `{ "type": "view.request" }` and the server responds with a fresh `view`.

### 4. Reconnect

On disconnect, the client attempts reconnection with exponential backoff. On reconnect:

- Client sends `{ "type": "resume", "lastEventSeq": 42 }` after receiving `welcome`
- Server responds with a full `view` message

> **Future optimization:** When the gap is small the server may replay only the events since `lastEventSeq`. For now a full `view` is always sent.

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

### Reconnect is cheap

Because all state is server-owned, opening a new connection on a new device requires only:

1. Server sends `welcome` then a full `view` (current scene, tokens, actors, recent events, active prompts).
2. New connection joins the broadcast set.

There is no per-device session state to migrate.

---

## Message Types

### Server → Client

| Type      | Description                                                         |
| --------- | ------------------------------------------------------------------- |
| `welcome` | Sent after successful auth; includes seat/campaign info             |
| `view`    | Full `SeatView` snapshot — on connect, resync, or gap repair        |
| `event`   | Incremental `WireEvent` (full or redacted) during steady-state play |
| `pong`    | Keepalive response to client `ping`                                 |
| `error`   | Protocol error or rejected action (`code` + `message`)              |

### Client → Server

| Type           | Description                                  |
| -------------- | -------------------------------------------- |
| `dispatch`     | Dispatch an engine action                    |
| `view.request` | Request a full `SeatView` resync             |
| `resume`       | Reconnect; server replies with a full `view` |
| `ping`         | Keepalive (server responds with `pong`)      |

---

## Message Schemas

### `welcome` (Server → Client)

```ts
interface WelcomeMessage {
  type: 'welcome';
  protocolVersion: string; // e.g., "1.0"
  serverVersion: string; // e.g., "0.1.0"
  seatId: string;
  seatRole: 'gm' | 'player' | 'spectator';
  campaignId: string;
}
```

### `view` (Server → Client)

Delivers a full audience-filtered `SeatView` snapshot. Sent after `welcome`, after a `resume`, and after a `view.request`.

```ts
interface ViewMessage {
  type: 'view';
  view: SeatView; // see shared-types.md → SeatView
}
```

### `event` (Server → Client)

A single incremental `WireEvent` during steady-state play. Discriminate on `event.kind`:

```ts
type WireEvent =
  | { kind: 'full'; event: GameEvent } // full event; apply to state
  | { kind: 'redacted'; seq: number }; // audience-filtered; advance lastSeq only

interface EventMessage {
  type: 'event';
  event: WireEvent;
}
```

### `pong` (Server → Client)

```ts
interface PongMessage {
  type: 'pong';
}
```

### `error` (Server → Client)

```ts
interface ErrorMessage {
  type: 'error';
  payload: {
    code: string; // e.g., 'ACTION_REJECTED', 'INVALID_MESSAGE', 'DISPATCH_ERROR'
    message: string;
  };
}
```

### `dispatch` (Client → Server)

Single entry point for all mutations. Replaces the old `action` and `token.move` types.

```ts
interface DispatchMessage {
  type: 'dispatch';
  input: EngineInput; // see shared-types.md → EngineInput
}
```

`EngineInput.clientRequestId` is an optional idempotency key. Sending the same `clientRequestId` twice on the same connection is a silent no-op.

### `view.request` (Client → Server)

Triggered automatically by the client when it detects a gap in the event sequence (`event.seq > lastSeq + 1`). Can also be sent manually for an explicit resync.

```ts
interface ViewRequestMessage {
  type: 'view.request';
}
```

### `resume` (Client → Server)

Sent after `welcome` on reconnect. Server replies with a full `view`.

```ts
interface ResumeMessage {
  type: 'resume';
  lastEventSeq: number; // last seq the client processed before disconnect
}
```

### `ping` / `pong` (Client → Server / Server → Client)

```ts
interface PingMessage {
  type: 'ping';
}
interface PongMessage {
  type: 'pong';
}
```

---

## Throttling and Rate Limits

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

1. Client opens a new WSS connection
2. Server sends `welcome` then a full `view` with current state
3. Client applies the view snapshot; any un-acknowledged optimistic changes are discarded
4. Active prompts directed at this seat are included in the `view.activePrompts` field

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
