# Shared Types — HearthVTT (`docs/shared-types.md`)

This document defines canonical type definitions shared across multiple components. All other documents should reference these definitions rather than redefining them.

---

## Terminology Glossary

The following terms have precise meanings throughout HearthVTT documentation. Use these definitions consistently.

### Seat

A persistent identity within a campaign representing a participant. Each Seat has:

- **Ownership**: One or more Actors owned by the Seat
- **Permissions**: Role-based access (admin, gm, player, spectator)
- **Persistence**: Survives server restarts and auth sessions

**Admin Seat**: Every campaign has an immutable "admin" seat created automatically on campaign creation. The admin seat:

- Cannot be deleted
- Has full campaign management permissions (create invites, manage seats, import/export, etc.)
- Uses a separate admin UI (not the play UI)
- Is distinct from GM role (admin manages access; GM manages gameplay)

**Other Seats**: Created via admin invite workflow or initial campaign setup.

### AuthSession

An authenticated client connection to the server. Distinct from the legacy "Session" concept (server run lifecycle). Key properties:

- **Refresh token**: Long-lived secret stored as HttpOnly cookie
- **Access token**: Short-lived proof for API calls and WS auth
- **Seat binding**: Each AuthSession is bound to exactly one Seat
- **Device tracking**: Optional metadata (deviceName, userAgent) for admin audit
- **Revocation**: Can be revoked by admin or via logout

See [auth-join-flow.md](components/auth-join-flow.md) for complete authentication specification.

### Invite

A capability token used to claim access to a campaign. Key properties:

- **Capability-based**: Long, unguessable token (`>= 128 bits entropy`)
- **One-time use**: Typically revoked immediately on successful claim
- **PIN-protected**: Requires PIN entry to mitigate link leakage
- **Short-lived**: Default expiry of 7 days
- **Seat binding**: Maps to a specific Seat or seat creation template

Invites are created and managed by admin seat holders. See [auth-join-flow.md](components/auth-join-flow.md) and [ADR 005](decisions/005-networking-management.md) for details.

### CampaignState

The combined, current state of all entities, effects, the latest Snapshot, etc. This is what gets saved in a Snapshot. CampaignState = Snapshot + all GameEvents in the EventRecord since that Snapshot.

### Snapshot

A saved version of a CampaignState, with all GameEvents since the previous Snapshot rolled into it. Snapshots are made periodically to keep event logs from growing to insane lengths.

### GameEvent

Anything that has been triggered, resolved, and added to the EventRecord. This includes, but is not limited to: token moves, actor state updates, entity creations (e.g., persistent spell effects) and deletions, effect applications, dice rolls, chat messages, etc.

### EventRecord

A sequence of GameEvents, kept in memory and in the connected database. A Snapshot, modified by all the GameEvents in the EventRecord, equals the current CampaignState.

### Action

An event emitted either by user interactions (in the frontend) or by a Resolver as it resolves chain reactions. Actions represent intent; they are resolved into GameEvents.

### Ruleset

A bundle that defines game-specific entity schemas, action types, and resolution behavior, layered on top of the engine's baseline VTT-universal surface. The runtime form (TS module, sandboxed QuickJS/Lua, etc.) is **deferred** — see [ADR 011](decisions/011-engine-facade-and-dsl-reversal.md). There is no DSL.

### GameEngine

A **facade** over campaign-state ownership, action dispatch, and ruleset execution. Public surface:

- `dispatch(input: EngineInput): Promise<DispatchResult>` — single entry point for mutation.
- `getView(seatId): SeatView` — for first-connect / reconnect / explicit resync.
- `subscribe(seatId, listener): Unsubscribe` — per-seat event stream.
- `close(): Promise<void>` — lifecycle shutdown.

The engine owns CampaignState, the ruleset, snapshots, patches (internal), the RNG, sequence numbers, and authorization. Outside code does not see any of those directly — it sees `SeatView` projections and `GameEvent` streams. See [components/ruleset-engine.md](components/ruleset-engine.md) and [ADR 011](decisions/011-engine-facade-and-dsl-reversal.md).

The **baseline engine** (no ruleset loaded) implements only VTT-universal features: scenes, tokens, minimal actors, dice, chat, drawings, measurements, labels, fog. TTRPG-mechanical concepts (initiative, HP, attacks, saves, etc.) are ruleset concerns.

### RulesetRuntime

Engine-internal concept. Not a public type. The mechanics of how the engine invokes ruleset code are private and **deferred** to the engine-interior design pass. Outside code never references RulesetRuntime.

### Tome

A catalog of entities, action automations, etc. Essentially a collection of DATA and MACROS, reliant on a compatible Ruleset to function. A Tome may ship with a Ruleset, but the Tome and Ruleset are separate entities.

### Compendium

A collection of Tomes and underlying Ruleset. This is ephemeral—created at the start of a Session from Tomes linked to the Campaign, kept in memory for the duration of the Session, and destroyed at server shutdown.

---

## Identifiers

All identifiers are opaque strings (typically UUIDs). Components should not parse or interpret identifier contents.

```ts
type CampaignId = string;
type SeatId = string;
type ActorId = string;
type TokenId = string;
type SceneId = string;
type TomeId = string;
type RulesetId = string;

type ActionId = string;
type EventId = string;
type PromptId = string;
type WorkflowId = string;
```

---

## EntityType

Canonical list of entity types stored and manipulated by the engine.

```ts
export type EntityType =
  | 'actor'
  | 'token'
  | 'item'
  | 'effect'
  | 'workflow'
  | 'scene';
```

| Type       | Description                                                 |
| ---------- | ----------------------------------------------------------- |
| `actor`    | A character, creature, or NPC with stats and inventory      |
| `token`    | A visual representation of an actor on a scene              |
| `item`     | Equipment, consumables, or other possessions                |
| `effect`   | A modifier, condition, or buff/debuff applied to an entity  |
| `workflow` | A multi-step resolution in progress (e.g., spell targeting) |
| `scene`    | A map or location where tokens can be placed                |

> **Note:** `campaign` is a top-level container with dedicated storage operations, not an entity type.

---

## Audience

Visibility policy for events, prompts, chat cards, and other audience-gated content.

```ts
export type Audience = 'public' | 'gm' | 'blind' | 'private';
```

| Kind      | Visible To                                |
| --------- | ----------------------------------------- |
| `public`  | All seats in the campaign                 |
| `gm`      | Triggering player + all GMs               |
| `blind`   | GMs only (triggering player cannot see)   |
| `private` | Triggering player + target player(s) only |

> **Implementation Note:** Resolving seat IDs from audience policy (especially with multiple GMs) is an implementation detail hidden behind this simplified interface. The server maintains the mapping from audience kind to concrete seat IDs.

---

## ActionType

A string brand identifying the kind of action being dispatched. Built-in baseline action types (`'token.move'`, `'chat.send'`, `'dice.roll'`, `'drawing.create'`, `'drawing.delete'`, `'measurement.start'`, `'measurement.update'`, `'measurement.end'`, `'label.create'`, `'label.delete'`) are defined by the engine. Rulesets contribute additional action types when loaded.

```ts
export type ActionType = string & { readonly __brand: 'ActionType' };
```

---

## EngineInput / DispatchResult

The envelope passed to `GameEngine.dispatch` and the result returned synchronously by the engine.

```ts
export interface EngineInput {
  seatId: SeatId;
  actionType: ActionType;
  payload: unknown; // shape per actionType; validated inside the engine
  clientRequestId?: string; // optional idempotency key per seat
}

export type DispatchResult =
  | { accepted: true; seq: number; actionId: string }
  | { accepted: false; reason: string };
```

`clientRequestId` is an idempotency key. The same `(seatId, clientRequestId)` pair processed twice returns the original `DispatchResult` and emits no second event. Absent `clientRequestId` means no idempotency.

---

## Capabilities

What a seat is _currently_ allowed to do, surfaced in `SeatView`.

```ts
export interface Capabilities {
  globalActions: ReadonlySet<ActionType>;
  entityActions: ReadonlyMap<EntityId, ReadonlySet<ActionType>>;
}
```

- **`globalActions`** — actions performable without an entity target (or with any entity), e.g. `'chat.send'`, `'dice.roll'`.
- **`entityActions`** — per-entity overrides. Empty when role + ownership already answer the question.

Semantic rule for consumers: if `capabilities` is empty for an entity, fall back to role + ownership. Otherwise, capabilities is authoritative. The **baseline engine** (no ruleset loaded) leaves both fields empty.

---

## SeatView

The full projection of the campaign visible to one seat, returned by `GameEngine.getView(seatId)`. Used for first-connect, reconnect with sequence gap, and explicit resync — **not** for steady-state play.

```ts
export interface SeatView {
  seatId: SeatId;
  campaignId: CampaignId;
  lastSeq: number; // last engine seq reflected in this view

  scene: SceneView; // current scene, renderable state
  tokens: ReadonlyArray<TokenView>;
  actors: ReadonlyArray<ActorView>;

  fog?: {
    explorationMask: unknown; // shape per renderer; opaque to non-renderer consumers
    litPolygon?: unknown; // derived; sometimes precomputed by server
  };

  drawings: ReadonlyArray<DrawingView>;
  measurements: ReadonlyArray<MeasurementView>;
  labels: ReadonlyArray<LabelView>;

  recentEvents: ReadonlyArray<GameEvent>; // bounded log catch-up
  activePrompts: ReadonlyArray<Prompt>; // prompts currently directed at this seat

  capabilities: Capabilities;
  rulesetPanels: ReadonlyArray<RulesetPanelDef>; // ruleset-contributed UI surfaces
}
```

The per-field `*View` shapes (SceneView, TokenView, ActorView, etc.) are the public, audience-filtered projections of internal entities. They are the _only_ entity shapes outside code sees; the engine's internal entity shape is private.

`RulesetPanelDef.content` is a declarative panel tree whose concrete shape is **deferred** to the ruleset-interior design pass; the field is reserved here.

---

## Patches (engine-internal)

> **Patches are not a shared type.** They were previously part of the public surface; they are now strictly engine-internal mutation machinery. The wire protocol is events, not patches. The client never sees a patch. Consumers should not import patch types from `shared/`.

---

## PromptKind

Semantic categorization of prompts. UI implementation decides presentation (toast, modal, etc.).

```ts
export type PromptKind = 'ephemeral' | 'blocking' | 'inline';
```

| Kind        | Semantics                                                            |
| ----------- | -------------------------------------------------------------------- |
| `ephemeral` | Non-blocking notification; auto-dismisses or can be ignored          |
| `blocking`  | Requires user action before continuing (e.g., reaction choice)       |
| `inline`    | Rendered within another UI element (e.g., inline in character sheet) |

---

## SourceRef

Reference to the source of an action or effect (who/what caused it).

```ts
export type SourceRef = {
  actorId?: ActorId;
  tokenId?: TokenId;
  itemRef?: EntityRef;
  spellRef?: EntityRef;
};
```

---

## EntityRef

Reference to a content entry in a tome.

```ts
export type EntityRef = {
  kind: 'spell' | 'item' | 'feature' | 'effect';
  tomeId: TomeId;
  id: string;
};
```

---

## GameEvent

Immutable record of something that happened. The **steady-state wire protocol**: after a client receives an initial `SeatView`, the server streams `GameEvent`s until the connection closes.

```ts
export type GameEvent<TData = unknown> = {
  id: EventId;
  campaignId: CampaignId;
  seq: number; // monotonically increasing per campaign; gap = client must resync
  type: string; // e.g., "chat.posted", "token.moved", "fog.revealed", "prompt.shown"
  time: number; // server timestamp (ms since epoch)
  audience: Audience;
  data: TData;
};
```

Invariants:

- One event = one audience. Multi-target prompts are multiple events.
- `seq` is per-campaign, monotonic, and gap-free under normal operation. A client that sees a gap requests `getView` and resumes from the new `lastSeq`.
- Events are persisted before they are broadcast.

---

## Prompt

A durable server→client affordance (buttons, choices, forms) delivered to specific audiences.

```ts
export type PromptAction = {
  label: string;
  dispatch: { actionType: string; payload: unknown };
  style?: 'primary' | 'secondary' | 'danger';
};

export type Prompt = {
  id: PromptId;
  campaignId: CampaignId;
  audience: Audience;
  kind: PromptKind;
  title: string;
  body?: string;
  expiresAt?: number;
  workflowId?: WorkflowId;
  actions: PromptAction[];
  inputSchema?: unknown; // JSON Schema for optional form inputs
};
```

---

## WorkflowState (engine-internal)

> **Not a shared type.** Workflows are engine-internal state machines that drive multi-step ruleset behavior across user prompts. Externally visible side effects are emitted as `GameEvent`s and `Prompt`s. Outside code does not see WorkflowState. Pause-and-resume across user input is durable workflow-state-machine, not host-language coroutines — see [ADR 011](decisions/011-engine-facade-and-dsl-reversal.md).

---

## Tags (TBD)

Tags are string identifiers used for effect/modifier matching. They appear in `EffectDef`, roll modifier queries, and target filtering.

```ts
// Example usage (structure TBD):
// - Effect tags: ["condition:prone", "source:spell"]
// - Roll modifier query: getRollModifiers(actorId, ["attack", "melee"])
// - Target filter: { tokenTagsAny: ["hostile", "undead"] }
```

> **⚠️ TBD:** Full tag taxonomy and structure will be defined during effects system implementation.

---

## Stub Types (TBD)

The following types are referenced in interfaces but not yet fully defined. Their shapes will be determined during implementation.

```ts
// Modifier applied to a roll based on effects
export type RollModifier = unknown; // TBD

// Modifier applied to a stat based on effects
export type StatModifier = unknown; // TBD

// (Removed) ResolverProgramRef — DSL was reversed; see ADR 011.
// (Removed) SyncBundle — replaced by SeatView for connect/resync.

// Interface for broadcasting realtime updates to connected clients
export type RealtimeHub = unknown; // TBD

// Structured logging interface
export type Logger = unknown; // TBD

// ID generation interface — the GameEngine generates all IDs
export interface IdGenerator {
  generateId(): string; // Returns a new unique identifier (UUID)
}

// Deterministic RNG provider — injected for testability
export interface RngProvider {
  nextInt(minInclusive: number, maxInclusive: number): number;
}

// Clock interface — injected for testability
export interface Clock {
  nowMs(): number;
}
```

See [todo.md](todo.md) for tracking the definition of these types.
