# WebSocket Protocol — HearthVTT (`docs/protocols/realtime-ws.md`)

This document defines the real-time WebSocket protocol for client-server communication.

> **Terminology:** See [shared-types.md](../shared-types.md) for canonical definitions of GameEvent, Action, Prompt, Audience, and other shared types.

---

## Overview

The WebSocket connection provides:

- **Server → Client:** State sync, GameEvents, Prompts, workflow updates, token movement previews
- **Client → Server:** Actions, workflow inputs, token movement (live and final)

All messages are JSON-encoded. Binary protocols (e.g., MessagePack) may be considered for performance optimization later.

---

## Connection Lifecycle

### 1. Connect

Client opens WebSocket to `/ws/session/{sessionId}`.

```
GET /ws/session/{sessionId}
Upgrade: websocket
```

Authentication token is sent as a query parameter or initial message (implementation TBD).

### 2. Initial Sync

Server sends `sync.initial` immediately after connection:

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

### 4. Disconnect

On disconnect, server cleans up any pending workflows/prompts for that seat. Client should attempt reconnection with exponential backoff.

---

## Message Types

### Server → Client

| Type                     | Description                                       |
| ------------------------ | ------------------------------------------------- |
| `sync.initial`           | Full state on connect                             |
| `sync.delta`             | JSON Patch to CampaignState                       |
| `event.new`              | New GameEvent to display in chat                  |
| `prompt.create`          | New Prompt for this seat                          |
| `prompt.cancel`          | Prompt cancelled (timeout, superseded)            |
| `workflow.update`        | WorkflowState changed                             |
| `token.move.preview`     | Another seat is dragging a token (ghost position) |
| `token.move.preview.end` | Token drag ended (clear ghost)                    |
| `error`                  | Error message (validation failure, etc.)          |

### Client → Server

| Type                 | Description                             |
| -------------------- | --------------------------------------- |
| `action`             | Dispatch an Action for resolution       |
| `workflow.input`     | Respond to a Prompt within a workflow   |
| `token.move.preview` | Live token drag position (throttled)    |
| `token.move`         | Final token position (drop)             |
| `ping`               | Keepalive (server responds with `pong`) |

---

## Message Schemas

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

1. Client opens new WebSocket
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

## Future Considerations

### Binary Protocol

MessagePack or similar binary encoding for reduced bandwidth. Would require protocol version negotiation on connect.

### Compression

WebSocket per-message deflate may be enabled for large payloads.

### Multi-Tab Support

If same user opens multiple tabs, each is a separate WebSocket connection. Server should handle gracefully (same seat, multiple connections).

---
