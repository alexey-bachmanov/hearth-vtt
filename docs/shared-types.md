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

A document that defines valid entity schemas and valid actions composed of primitives exposed by the GameEngine. Rulesets are data-driven; they do not contain arbitrary code.

### GameEngine

A concrete class that provides authoritative game logic orchestration. Multiple aspects:

1. **Lifecycle**: One instance exists per active campaign, created on first connection and destroyed on inactivity/shutdown.
2. **State Management**: Owns CampaignState in memory (loaded from Snapshot + event replay), keeps it synchronized with Storage via transactional updates.
3. **Action Processing**: Accepts emitted Actions, processes them sequentially via internal queue, uses embedded RulesetRuntime to resolve them into Resolutions (events/patches/prompts/workflows).
4. **Side Effects**: Handles all persistence (Storage), broadcasting (RealtimeHub), and ID generation (IdGenerator).
5. **Pure Core**: Embeds RulesetRuntime (pure resolution logic) as a private member.

GameEngine ships with the server. It does nothing without a Ruleset loaded into its RulesetRuntime.

### RulesetRuntime

A pure resolution engine embedded within GameEngine. Takes CampaignState + Action + ResolveContext and produces a Resolution using the loaded Ruleset. **RulesetRuntime has zero side effects**—all persistence, broadcasting, and ID generation is handled by GameEngine. Not accessible outside GameEngine.

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

## Patch Operations

Operations for modifying entity state. Patches are applied atomically within a transaction.

```ts
export type PatchOp = 'add' | 'remove';

export type Patch = {
  target: { type: EntityType; id: string };
  path: string; // JSON Pointer (e.g., "/resources/hp/current")
  op: PatchOp;
  value?: unknown; // Required for 'add', ignored for 'remove'
};
```

| Op       | Description                                                                       |
| -------- | --------------------------------------------------------------------------------- |
| `add`    | Set or insert a value at the path. Creates intermediate objects/arrays as needed. |
| `remove` | Delete the value at the path. No-op if path does not exist.                       |

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

Immutable record of something that happened. Used for audit logs, event feeds, and potential replay.

```ts
export type GameEvent<TData = unknown> = {
  id: EventId;
  campaignId: CampaignId;
  type: string; // e.g., "roll.result", "damage.applied"
  time: number; // Server timestamp (ms since epoch)
  audience: Audience;
  data: TData;
};
```

> **Note:** This replaces the previously separate `EventEnvelope` and `GameEvent` types. All event-related code should use this definition.

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

## WorkflowState

Durable state for multi-step resolutions (e.g., AoE targeting → saves → damage).

```ts
export type WorkflowState = {
  id: WorkflowId;
  campaignId: CampaignId;
  ownerSeatId: SeatId; // Seat that initiated the workflow
  kind: string; // e.g., "spell.fireball"
  step: string; // e.g., "await-aoe" | "await-saves"
  context: Record<string, unknown>;
  expiresAt?: number;
};
```

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

// Reference to a compiled DSL resolver program
export type ResolverProgramRef = unknown; // TBD

// Initial state bundle sent to a client on connect
export type SyncBundle = unknown; // TBD

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
