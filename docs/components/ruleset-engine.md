# Ruleset Engine — HearthVTT (`docs/components/ruleset-engine.md`)

This document defines the **design intent** and **interface signatures** for the HearthVTT ruleset execution engine: how actions are defined, validated, resolved, and applied; how rulesets and tomes participate; and how the DSL and effects system work together.

---

## Goals

### System-agnostic core

Support many TTRPG systems (DnD-like, CoC-like, Daggerheart, Cyberpunk Red, etc.) without hardcoding system mechanics into the engine.

### Homebrew-first data and automation

Rulesets and tomes should allow:

- custom entities and fields (schemas)
- custom actions (catalog)
- composable automation recipes (DSL)
- portable sharing via `.ruleset` and `.tome`

### Manual play is ruleset responsibility

See [architecture-overview.md](../architecture-overview.md#manual-play-is-ruleset-responsibility) for the canonical statement of this principle.
The engine does not define any built-in actions. If a ruleset designer fails to include manual fallbacks, that is a ruleset design issue, not an engine limitation.

### Deterministic, authoritative resolution

- The server is authoritative for state.
- The ruleset runtime returns **pure resolutions** (events/patches/prompts/workflows).
- The engine applies resolutions transactionally through `Storage`.
- Inputs are validated at boundaries; outputs are logged for audit and replay.

### Clean boundaries and portability

Ruleset execution must be:

- safe (no arbitrary filesystem/network/DOM access)
- deterministic (clock/rng injected)
- testable (run ruleset resolution with in-memory state views)

---

## Concepts and mental model

> **Terminology:** See [shared-types.md](../shared-types.md) for canonical definitions of Seat, Session, CampaignState, Snapshot, GameEvent, EventRecord, Action, Ruleset, GameEngine, Resolver, Tome, and Compendium.

### GameEngine vs RulesetRuntime vs Ruleset

- **GameEngine**: A concrete class that provides authoritative orchestration and persistence. One instance exists per active campaign. It receives Actions, validates them, uses its embedded RulesetRuntime to resolve them, applies results to storage, and broadcasts outcomes. Ships with the server; does nothing without a Ruleset. GameEngine owns CampaignState in memory and processes actions sequentially via an internal queue.

- **RulesetRuntime**: A pure resolution engine embedded within GameEngine. It takes CampaignState + Action + ResolveContext and produces a Resolution (events/patches/prompts/workflows) using the loaded Ruleset. **RulesetRuntime has zero side effects**—all persistence and broadcasting is handled by GameEngine. Not accessible outside GameEngine.

- **Ruleset**: A plugin package that defines schemas, actions, UI templates/bindings, and constrained resolver logic using a DSL. Rulesets are data-driven and loaded into RulesetRuntime during GameEngine initialization. Each campaign locks to a specific ruleset version at creation.

### Actions → GameEvents

An **Action** is an intent ("roll a skill check", "cast fireball"), not a state mutation. Actions are emitted by users or by chain reactions during resolution.

A **Resolution** is the computed outcome of resolving an Action:

- `events[]`: GameEvents to append to EventRecord (immutable "what happened")
- `patches[]`: validated state updates
- `prompts[]`: durable server→client affordances (buttons/choices)
- `workflow mutations[]`: create/update multi-step workflow state
- `telemetry`: optional debug fields

RulesetRuntime returns the Resolution to GameEngine. GameEngine then:

1. Generates IDs for new entities/events/prompts/workflows (via IdGenerator)
2. Validates patches against schemas
3. Applies patches to in-memory CampaignState
4. Persists events/prompts/workflows via Storage (transactionally)
5. Broadcasts to connected clients via RealtimeHub

### Recipes can live in rulesets _and_ tomes

To avoid enumerating every spell/weapon automation in the ruleset:

- Ruleset defines generic “templates” (e.g. `spell.cast.aoe_save_damage`)
- Tome entries (e.g. Fireball) provide parameters and reference templates
- UI buttons dispatch a generic action like `spell.cast` with `spellRef`, and the ruleset expands it using the spell entry’s automation

---

## Threat model / safety constraints

Ruleset execution must be constrained:

- No direct file/network access
- No direct DOM access (server-side anyway)
- No unrestricted code evaluation
- Only allowed primitives/ops and expression language are executed
- All time and randomness come from injected providers (`Clock`, `RngProvider`)

---

## Action resolution pipeline (server)

1. **Decode + validate boundary message**
   - HTTP/WS message decoded to `ActionEnvelope`
   - basic protocol validation (schema)

2. **Enqueue** (sequential processing per campaign)
   - Action added to GameEngine's internal AsyncQueue
   - Queue ensures only one action processes at a time per campaign

3. **Load context**
   - ReadonlyStateView from GameEngine's in-memory CampaignState
   - Seat role and ownership from campaign metadata
   - Active workflows/prompts (for workflow continuation)

4. **Authorize**
   - Role-based (gm/player)
   - Ownership-based (player may act only on their actors unless allowed)
   - Action-level and ruleset-level constraints from Ruleset

5. **Resolve**
   - GameEngine calls RulesetRuntime.resolve(Action, ResolveContext) → Resolution
   - **RulesetRuntime is pure** — zero side effects; all I/O via context
   - Optionally evaluate triggers: `resolveTriggered(event, ctx)` (recursion limit: 20 calls)
   - If error: rollback transaction, return error to client

6. **Apply transactionally** (within Storage.transaction())
   - GameEngine generates IDs via IdGenerator (events, prompts, workflows, entities)
   - GameEngine validates patches via RulesetRuntime.validatePatch()
   - Apply patches to in-memory CampaignState
   - Persist: Storage.appendEvent(...) for each event
   - Persist: Storage.upsertPrompt(...) for each prompt
   - Persist: Storage.upsertWorkflow(...) for each workflow
   - Increment event counter for snapshot trigger

7. **Broadcast** (outside transaction)
   - RealtimeHub.broadcastEvents(events) — filtered by Audience per seat
   - RealtimeHub.broadcastDeltas(deltas) — state updates to all seats
   - RealtimeHub.sendPrompts(prompts) — to specific seats per Prompt.audience

8. **Check snapshot trigger**
   - If eventCounter % snapshotInterval == 0: create Snapshot
   - Prune old snapshots (keep last 3)

9. **Return**
   - `EngineResult` containing applied outcomes for caller

---

## Failure Handling

All failure modes default to **cancel the current action and log an error**. The engine prioritizes safety and debuggability over partial execution.

| Failure                                             | Behavior                                                                       |
| --------------------------------------------------- | ------------------------------------------------------------------------------ |
| RulesetRuntime throws or returns invalid Resolution | Cancel action, rollback transaction, log error, return `EngineError` to caller |
| Workflow timeout expires with no response           | Cancel workflow, log expiration, notify relevant seats                         |
| Patch fails schema validation mid-Resolution        | Cancel entire action (no partial apply), log validation error                  |
| Tome reference points to missing entry              | Cancel action, log missing reference                                           |
| RNG called more times than expected                 | Log warning (audit trail may diverge on replay)                                |

### Trigger Recursion

Triggers may fire other triggers (e.g., AOE creation triggers effect application on tokens inside). This enables flexible mechanics like:

- Exploding dice (rolling max lets you roll again)
- Aura effects that trigger on entity entry
- Chain reactions

**Maximum recursion depth: 20 calls.** If exceeded, the resolution is canceled and the failure is logged. This allows room for legitimate recursive mechanics while preventing infinite loops from missing base cases.

---

## Audience and visibility

Many flows require secrecy/partial visibility (blind insight checks, private GM prompts, whispers).

**Audience** is a first-class policy attached to:

- events
- prompts
- chat cards
- (optional later) specific state fields

Audience policy is enforced by the server; the UI should not decide visibility.

See [shared-types.md](../shared-types.md) for the canonical `Audience` type definition and visibility semantics.

---

## Triggers and multi-step workflows

Some flows require actions that pause and resume:

- AoE selection then saves then damage
- reactions with timeouts
- initiative collection
- “choose a target and a spell slot level”

These are modeled with:

- **Workflows** (durable state machines)
- **Prompts** (durable user affordances)
- Optional **trigger handlers** that run when certain events occur (token moves, damage applied, turn ends)

### Trigger Ordering and Reentrancy

Triggers may fire during resolution of other actions. For example:

1. Player creates a persistent AOE spell effect
2. The AOE entity is created in the scene
3. A trigger fires to apply effects to any tokens already inside the area
4. Each effect application may itself fire additional triggers

## This reentrancy is intentional and enables flexible game mechanics. Recursion is limited to 20 calls (see Failure Handling).

## DSL Specification

### Design intent

The resolver DSL is not a general programming language. It is a constrained “recipe bytecode” that:

- calls a limited set of operations
- uses a constrained expression language
- produces a Resolution (events/patches/prompts/workflows)
- is deterministic and testable

### Storage format

**DSL programs are stored as JSON.** This enables:

- Easy validation with JSON Schema
- Portable serialization in `.ruleset` and `.tome` packages
- Tooling for editing and debugging without custom parsers

### Program model

- A resolver is a list of operations executed sequentially
- Operations read inputs from:
  - action payload ($payload)
  - the read-only state view (state.getActor(...), etc.)
  - local variables created by prior ops ($vars)
- Operations append to resolution outputs

### Expression language

Expressions must support:

- numeric arithmetic, boolean logic, conditionals
- path lookups into payload and local vars
- whitelisted helper functions (e.g. mod(abilityScore))
- No loops in expressions (loops are foreach op).

### DSL ops

Implementation may start with a subset. New ops must be added deliberately and documented.

> **Note:** The ops listed below are design intent. Full semantics (input schema, output behavior, error conditions, examples) will be documented as each op is implemented. See [todo.md](../todo.md) for tracking.

#### Core ops

- calc: evaluate an expression and store into a local var
- roll: roll dice from formula (server-authoritative RNG)
- emit: add an event with audience
- patch: add a schema-validated patch
- prompt: create a durable prompt
- if: conditional execution
- foreach: iterate a list
- call: invoke another action resolver (internal reuse)

#### Targeting ops

- selectTargets: create or advance a workflow step that requests target selection
- selectAoE: create or advance a workflow step that requests AoE placement
- queryTargets: compute list of targets from criteria (server-side)

#### Effects ops

- applyEffect: patch effect instances onto an actor (or scene)
- removeEffect: remove effect instances by id/source
- recomputeDerived: optional hint to recalc derived caches (if used)

#### Encounter ops

- encounter.create
- encounter.advanceTurn
- encounter.collectInitiative

#### Durations and Timeouts

- awaitResponses: create a workflow step with timeout and default resolution
- cancelPrompt: cancel outstanding prompts when resolved

---

## Effects system

Effects are used for:

- AC modifiers (shield)
- advantage/disadvantage flags (prone, surprised)
- resist/vuln/immunity
- aura- and aoe-applied buffs/debuffs

Rulesets can define:

- how to compute derived stats from base state + effect modifiers
- how to compute roll modifiers from tags (attack/save/skill/damage)

---

## Tome Integration

- Ruleset runtime must be able to resolve content references (recipes and automations in a .tome)
- A tome entry may contain:
  - automation.templateId (points to a generic resolver program in ruleset)
  - automation.params (radius, save type, damage formula, etc.)

> **Note (TBD):** The API for looking up resolver templates from tome entries is not yet defined. This will be addressed once the game engine has a working implementation. The `TomeIndex` interface below provides content lookup, but template resolution mechanics are still to be determined.

---

## UI template integration (overview only)

Rulesets provide UI templates and bindings:

- safe declarative component trees (no arbitrary JS)
- bindings map UI controls to actions (dispatch actionType + payload)

UI templates must be validated against schema paths and action IDs at ruleset load time.

(See [docs/components/client.md](docs/components/client.md) for client rendering boundaries.)

---

## Storage and persistence touchpoints

The ruleset runtime never talks directly to SQLite.
Persistence occurs via:

- the engine applying patches[] and storing events[]
- the engine storing Prompt and WorkflowState records via dedicated storage methods
- the storage adapter providing a transaction boundary

See [server.md](server.md) for the `Storage` interface, which includes:

- `upsertPrompt()` / `deletePrompt()` — persist and remove prompts
- `upsertWorkflow()` / `deleteWorkflow()` — persist and remove workflow state

---

## Versioning and Migration

Ruleset versioning follows these principles:

### During development

Rulesets change frequently. Campaign state may become incompatible with new ruleset versions. This is acceptable during testing—reset campaigns as needed.

### During deployment

Rulesets should be relatively stable. Breaking changes to ruleset schemas require manual migration, similar to how TTRPG tables handle edition changes (e.g., D&D 5e to 2024 rules).

### Migration strategies

1. **Stay on old version**: Campaign continues using the ruleset version it was created with.
2. **Manual migration**: GM manually transfers characters and state to a new campaign with the updated ruleset.
3. **Migration scripts (future)**: Ruleset authors may provide optional migration scripts, but this is not a core engine feature.

> **Note:** Automated migration is explicitly out of scope for the initial engine. Each table handles version transitions in their own way.

---

## Interface Signatures

This section defines the interfaces for the ruleset engine, DSL primitives, and action resolution. Keep this section updated as the engine evolves.

> Notes:
>
> - Types below are TypeScript-flavored, but these are _contracts_, not implementation requirements.
> - Data structures should be serializable (plain objects); classes may exist as thin validators/constructors.
> - For canonical shared types (`EntityType`, `Audience`, `Patch`, `PromptKind`, `GameEvent`), see [shared-types.md](../shared-types.md).

### Shared Types Reference

The following types are defined in [shared-types.md](../shared-types.md) and used throughout this document:

- `EntityType` — `'actor' | 'token' | 'item' | 'effect' | 'workflow' | 'scene'`
- `Audience` — `'public' | 'gm' | 'blind' | 'private'`
- `PatchOp` — `'add' | 'remove'`
- `Patch` — Target + path + op + value
- `PromptKind` — `'ephemeral' | 'blocking' | 'inline'`
- `Prompt` — Durable server→client affordance (canonical definition)
- `PromptAction` — Button/choice within a Prompt
- `WorkflowState` — Multi-step resolution state (canonical definition)
- `GameEvent` — Immutable event record
- All identifier types (`CampaignId`, `SeatId`, `ActorId`, etc.)
- `SourceRef`, `EntityRef` — References to sources and tome content
- Stub types (`RollModifier`, `StatModifier`, `ResolverProgramRef`, `SyncBundle`, `RealtimeHub`, `Logger`)

### Engine-Specific Types

```ts
// Import from shared-types.md
import type {
  CampaignId,
  SeatId,
  ActorId,
  TokenId,
  SceneId,
  TomeId,
  RulesetId,
  ActionId,
  EventId,
  PromptId,
  WorkflowId,
  EntityType,
  Audience,
  PatchOp,
  Patch,
  PromptKind,
  GameEvent,
  SourceRef,
  EntityRef,
  Prompt,
  PromptAction,
  WorkflowState,
} from '../shared-types';

export type ActionMeta = {
  clientRequestId?: string; // idempotency + UX correlation
  clientVersion?: string;
  time?: number; // client timestamp (not authoritative)
};

export type ActionEnvelope<TPayload = unknown> = {
  id: ActionId; // server-generated instance id
  campaignId: CampaignId;
  seatId: SeatId;
  actionType: string; // e.g. "roll.dice"
  source?: SourceRef;
  payload: TPayload;
  meta?: ActionMeta;
};

// Note: Prompt, PromptAction, WorkflowState, GameEvent, EntityType, PatchOp,
// Patch, and PromptKind are defined in shared-types.md

export type TargetSpec = {
  mode: 'single' | 'multi';
  sourceTokenId?: TokenId;
  maxRange?: number;
  reach?: number;
  requireLineOfSight?: boolean;

  filters?: {
    disposition?: 'enemy' | 'ally' | 'any';
    includeSelf?: boolean;
    tokenTagsAny?: string[];
    actorKindsAny?: string[];
  };

  maxTargets?: number;
};

export type TargetSelection = {
  tokenIds: TokenId[];
};

export type AreaKind = 'circle' | 'cone' | 'line' | 'rect' | 'poly';

export type AreaSpec = {
  kind: AreaKind;
  // params depend on kind: radius, length, width, angle, polygon points, etc.
  params: Record<string, unknown>;
  snapToGrid?: boolean;
  mustOriginateFromTokenId?: TokenId;
};

export type AreaInstance = {
  sceneId: SceneId;
  placedBySeatId: SeatId;
  spec: AreaSpec;
  transform: Record<string, unknown>; // position/rotation
  source?: SourceRef;
  expiresAt?: number;
};

// WorkflowState is defined in shared-types.md

export type WorkflowMutation =
  | { op: 'create'; workflow: WorkflowState }
  | { op: 'update'; workflowId: WorkflowId; patch: Patch[] }
  | { op: 'complete'; workflowId: WorkflowId }
  | { op: 'cancel'; workflowId: WorkflowId };

export type Resolution = {
  events: GameEvent[]; // Append-only; see shared-types.md
  patches: Patch[]; // Append-only; see shared-types.md
  prompts: Prompt[];
  workflows: WorkflowMutation[];
  telemetry?: Record<string, unknown>;
};

// Note: Resolutions are append-only. DSL ops add to events/patches/prompts/workflows
// but cannot remove or modify already-added entries. This ensures deterministic
// replay and clean audit trails.
```

### Engine Interfaces

#### GameEngine Class

GameEngine is a concrete class (not an interface) with one instance per active campaign.

```ts
export interface GameEngineOptions {
  campaignId: CampaignId;
  storage: Storage;
  rulesetLoader: RulesetLoader;
  realtimeHub: RealtimeHub;
  idGenerator: IdGenerator;
  rng: RngProvider;
  clock: Clock;
  logger: Logger;
  config?: GameEngineConfig;
}

export interface GameEngineConfig {
  snapshotEveryNEvents: number; // default: 100
  snapshotEveryNMinutes: number; // default: 15
  maxTriggerRecursion: number; // default: 20
  retainSnapshotCount: number; // default: 3
}

export class GameEngine {
  // Private members
  private readonly campaignId: CampaignId;
  private readonly storage: Storage;
  private readonly realtimeHub: RealtimeHub;
  private readonly idGenerator: IdGenerator;
  private readonly rng: RngProvider;
  private readonly clock: Clock;
  private readonly logger: Logger;
  private readonly config: GameEngineConfig;

  // Owned components
  private readonly runtime: RulesetRuntime;
  private readonly actionQueue: AsyncQueue;

  // In-memory state
  private state: CampaignState;
  private eventCounter: number;

  private constructor(/* private - use GameEngine.create() */) {}

  /**
   * Factory method - loads campaign and initializes engine.
   *
   * Process:
   * 1. Load campaign metadata from Storage
   * 2. Load Ruleset + Tomes via RulesetLoader
   * 3. Create RulesetRuntime instance
   * 4. Load latest Snapshot + replay events
   * 5. Initialize action queue
   * 6. Return initialized GameEngine
   */
  static async create(options: GameEngineOptions): Promise<GameEngine>;

  /**
   * Process an action from a client.
   * Actions are enqueued and processed sequentially.
   */
  async handleAction(action: ActionEnvelope): Promise<EngineResult>;

  /**
   * Process workflow input (target selection, prompt response, etc).
   * Similar to handleAction but continues existing workflow.
   */
  async handleWorkflowInput(
    input: WorkflowInputEnvelope,
  ): Promise<EngineResult>;

  /**
   * Get initial sync bundle for a newly connected client.
   * Returns current CampaignState + recent events + active prompts.
   */
  async getInitialSync(seatId: SeatId): Promise<SyncBundle>;

  /**
   * Gracefully shutdown - wait for queue to drain, save final snapshot.
   */
  async close(): Promise<void>;
}
```

#### CampaignManager (Server-Level)

The server maintains one CampaignManager that creates/destroys GameEngine instances:

```ts
export class CampaignManager {
  private engines: Map<CampaignId, GameEngine> = new Map();

  /**
   * Open a campaign - creates GameEngine if not already loaded.
   */
  async openCampaign(campaignId: CampaignId): Promise<GameEngine>;

  /**
   * Close a campaign - gracefully shuts down GameEngine.
   * Triggered by:
   * - Explicit admin API call
   * - Inactivity timeout (no connected clients for N minutes)
   * - Server shutdown
   */
  async closeCampaign(campaignId: CampaignId): Promise<void>;

  /**
   * Get active GameEngine for a campaign.
   * Throws if campaign not loaded.
   */
  getEngine(campaignId: CampaignId): GameEngine;
}
```

#### RulesetRuntime Class

RulesetRuntime is a pure resolution engine embedded within GameEngine.

```ts
export class RulesetRuntime {
  private readonly ruleset: Ruleset;
  private readonly tomeIndex: TomeIndex;
  private readonly schemaRegistry: SchemaRegistry;

  constructor(ruleset: Ruleset, tomes: Tome[]) {
    this.ruleset = ruleset;
    this.tomeIndex = new TomeIndex(tomes);
    this.schemaRegistry = new SchemaRegistry(ruleset.schemas);
  }

  /**
   * Resolve an action into a Resolution.
   * Pure function - no side effects; all I/O provided via context.
   *
   * @returns Resolution on success, ResolverError on failure
   */
  resolve(action: Action, context: ResolveContext): Resolution | ResolverError;

  /**
   * Validate a patch against schemas before application.
   * Throws ValidationError if invalid.
   */
  validatePatch(patch: Patch, entityBefore: unknown): void;

  /**
   * Look up content from tomes (spells, items, effects, etc).
   */
  getEntityRef(ref: EntityRef): unknown | undefined;
}
```

#### Dependency Interfaces

GameEngine requires several injected dependencies for side effects and deterministic testing.

##### RealtimeHub

Handles WebSocket broadcasting with audience filtering.

```ts
/**
 * RealtimeHub manages WebSocket broadcasting to connected clients.
 * Implemented by the server's WebSocket manager.
 */
export interface RealtimeHub {
  /**
   * Broadcast GameEvents to connected clients.
   * Filters events per-seat based on Audience policy.
   *
   * @param campaignId - Campaign to broadcast to
   * @param events - Events to broadcast (audience filtering applied automatically)
   */
  broadcastEvents(campaignId: CampaignId, events: GameEvent[]): void;

  /**
   * Broadcast state deltas to all seats in a campaign.
   *
   * @param campaignId - Campaign to broadcast to
   * @param deltas - State updates to broadcast
   */
  broadcastDeltas(campaignId: CampaignId, deltas: StateDelta[]): void;

  /**
   * Send prompts to specific seats (based on Prompt.audience).
   *
   * @param campaignId - Campaign to send prompts for
   * @param prompts - Prompts to send (seat filtering applied automatically)
   */
  sendPrompts(campaignId: CampaignId, prompts: Prompt[]): void;

  /**
   * Get list of currently connected seatIds for a campaign.
   * Used for analytics and campaign auto-unload decisions.
   */
  getConnectedSeats(campaignId: CampaignId): SeatId[];
}
```

##### IdGenerator

Provides unique identifiers for entities, events, prompts, workflows.

```ts
/**
 * IdGenerator provides unique identifiers.
 * Can be swapped with deterministic implementation for testing.
 */
export interface IdGenerator {
  /**
   * Generate universally unique identifier (UUID v4 by default).
   */
  generateId(): string;

  /**
   * Convenience methods for typed IDs (same underlying implementation).
   */
  generateEventId(): EventId;
  generatePromptId(): PromptId;
  generateWorkflowId(): WorkflowId;
  generateEntityId(): string;
}

/**
 * Production implementation using crypto.randomUUID()
 */
export class UuidGenerator implements IdGenerator {
  generateId(): string {
    return randomUUID();
  }

  generateEventId(): EventId {
    return this.generateId();
  }
  generatePromptId(): PromptId {
    return this.generateId();
  }
  generateWorkflowId(): WorkflowId {
    return this.generateId();
  }
  generateEntityId(): string {
    return this.generateId();
  }
}

/**
 * Test implementation with deterministic IDs
 */
export class MockIdGenerator implements IdGenerator {
  private counter = 0;
  private prefix: string;

  constructor(prefix: string = 'test') {
    this.prefix = prefix;
  }

  generateId(): string {
    return `${this.prefix}-${++this.counter}`;
  }

  generateEventId(): EventId {
    return this.generateId();
  }
  generatePromptId(): PromptId {
    return this.generateId();
  }
  generateWorkflowId(): WorkflowId {
    return this.generateId();
  }
  generateEntityId(): string {
    return this.generateId();
  }
}
```

##### Logger

Provides structured logging with context.

```ts
/**
 * Logger provides structured logging with context.
 * Implementation should support JSON output for cloud aggregation.
 */
export interface Logger {
  /**
   * Log informational message (normal operations).
   */
  info(message: string, context?: Record<string, unknown>): void;

  /**
   * Log warning (unexpected but handled conditions).
   */
  warn(message: string, context?: Record<string, unknown>): void;

  /**
   * Log error (failures, exceptions).
   */
  error(
    message: string,
    error?: Error,
    context?: Record<string, unknown>,
  ): void;

  /**
   * Log debug information (verbose, disabled in production).
   */
  debug(message: string, context?: Record<string, unknown>): void;

  /**
   * Create child logger with additional context.
   * All subsequent log calls include the additional context.
   */
  child(context: Record<string, unknown>): Logger;
}

// Example usage:
// const campaignLogger = logger.child({ campaignId: 'abc-123' });
// campaignLogger.info('Action processed', { actionType: 'attack', duration: 45 });
// Output: { level: 'info', message: 'Action processed', campaignId: 'abc-123', actionType: 'attack', duration: 45 }
```

#### Engine Results

```ts
export type EngineError = {
  code: string; // e.g. "unauthorized" | "invalid_payload"
  message: string;
  details?: unknown;
};

export type StateDelta = {
  // implementation-defined: could be derived from patches or explicit diffs
  patches: Patch[];
};

export type EngineResult = {
  applied: boolean;
  events: GameEvent[]; // See shared-types.md
  prompts: Prompt[];
  deltas: StateDelta[];
  errors?: EngineError[];
};
```

#### Workflow Input (selection results / prompt submissions)

```ts
export type WorkflowInputEnvelope = {
  campaignId: CampaignId;
  seatId: SeatId;
  workflowId: WorkflowId;

  kind: 'targetSelection' | 'areaSelection' | 'formSubmit' | 'promptAction';

  payload: unknown; // validated by workflow step expectations
};
```

### Ruleset Runtime Interfaces

#### Ruleset Loader

```ts
export type RulesetPackage = {
  id: RulesetId;
  version: string;
  // raw files, manifests, compiled DSL bytecode, etc.
};

export interface RulesetLoader {
  loadRuleset(rulesetId: RulesetId, version?: string): Promise<RulesetPackage>;
  instantiateRuntime(
    pkg: RulesetPackage,
    tomes: TomeIndex,
  ): Promise<RulesetRuntime>;
}
```

#### Read-Only Views Provided to Ruleset Resolution

```ts
export type SeatContext = {
  seatId: SeatId;
  roles: ('admin' | 'gm' | 'player' | 'spectator')[];
  ownedActorIds: ActorId[];
};

export interface ReadonlyStateView {
  getActor(actorId: ActorId): unknown | undefined;
  getToken(tokenId: TokenId): unknown | undefined;
  getScene(sceneId: SceneId): unknown | undefined;
  // additional getters as needed (items, workflows, prompts)
}

export interface EffectsView {
  // ruleset-friendly queries over effects
  listEffects(actorId: ActorId): unknown[];
  // optionally: compute modifiers for a given roll/stat
  getRollModifiers(actorId: ActorId, tags: string[]): RollModifier[];
  getStatModifiers(actorId: ActorId, statPath: string): StatModifier[];
}

export interface QueryService {
  distance(a: TokenId, b: TokenId): number;
  tokensInArea(area: AreaInstance): TokenId[];
  validateTargetSelection(
    spec: TargetSpec,
    selection: TargetSelection,
  ): boolean;
  // optional later: line-of-sight, cover, etc.
}
```

#### RNG and Clock

```ts
export interface RngProvider {
  // deterministic RNG; may be seeded per campaign/session
  nextInt(minInclusive: number, maxInclusive: number): number;
}

export interface Clock {
  nowMs(): number;
}
```

#### Ruleset Runtime Contract

```ts
export type ActionDef = {
  actionType: string;
  title?: string;

  rolesAllowed: ('gm' | 'player' | 'admin')[];
  // ownership rules: e.g. "mustOwnSourceActor"
  constraints?: Record<string, unknown>;

  inputSchema: unknown; // JSON Schema (or Zod-like schema) describing payload
  resolver: ResolverProgramRef; // reference to compiled DSL program
};

export interface RulesetRuntime {
  readonly id: RulesetId;
  readonly version: string;

  getActionDef(actionType: string): ActionDef | undefined;
  validateActionPayload(actionType: string, payload: unknown): void;

  resolve(action: ActionEnvelope, ctx: ResolveContext): Resolution;

  // Triggers: optional but designed in from the start
  resolveTriggered(event: GameEvent, ctx: ResolveContext): Resolution;

  // Schema registry for validating patches and entity shapes
  readonly schemas: SchemaRegistry;
}
```

#### Resolve Context

```ts
export type ResolveContext = {
  campaignId: CampaignId;
  seat: SeatContext;
  state: ReadonlyStateView;

  effects: EffectsView;
  query: QueryService;

  rng: RngProvider;
  clock: Clock;
};
```

### Schema and Entities

#### SchemaRegistry

```ts
export interface SchemaRegistry {
  // entity-level schemas (actors/items/tokens/scenes)
  getSchema(entityType: EntityType, kind?: string): unknown | undefined;

  // validate a whole entity blob
  validateEntity(entityType: EntityType, entity: unknown): void;

  // validate a patch against a schema (path/type checks)
  validatePatch(patch: Patch, entityBefore: unknown): void;
}
```

### Effects System

```ts
export type EffectDef = {
  id: string;
  name: string;

  // classification for rules
  tags?: string[]; // e.g. ["condition:prone", "source:item"]

  stacking?: {
    mode: 'stack' | 'replace' | 'highestOnly';
    key?: string; // group key for stacking
  };

  duration?: {
    kind:
      | 'untilRemoved'
      | 'rounds'
      | 'seconds'
      | 'turnStart'
      | 'turnEnd'
      | 'saveEnds';
    value?: number;
    saveCheck?: string; // e.g. "conSave"
    dcExpr?: string;
  };

  modifiers: Array<
    | { kind: 'statAdd'; statPath: string; amountExpr: string } // +2 AC
    | { kind: 'rollAdvantage'; tagsAny: string[] } // adv on attacks
    | { kind: 'rollDisadvantage'; tagsAny: string[] }
    | { kind: 'damageResistance'; damageTypes: string[] }
    | { kind: 'damageImmunity'; damageTypes: string[] }
    | { kind: 'damageVulnerability'; damageTypes: string[] }
  >;
};

export type EffectInstance = {
  instanceId: string;
  defId: string; // references EffectDef (from ruleset/tome)
  source?: SourceRef;
  appliedAtMs: number;
  expiresAtMs?: number;

  // optional per-instance params
  params?: Record<string, unknown>;
};
```

### Tome Integration

```ts
export type EntityRef = {
  kind: 'spell' | 'item' | 'feature' | 'effect';
  tomeId: TomeId;
  id: string;
};

export interface TomeIndex {
  getSpell(ref: EntityRef): unknown | undefined;
  getItem(ref: EntityRef): unknown | undefined;
  getEffectDef(ref: EntityRef): EffectDef | undefined;
  // etc.
}
```
