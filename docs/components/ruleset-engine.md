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

### GameEngine vs Ruleset vs Resolver

- **GameEngine**: Authoritative orchestration and persistence. It receives Actions, validates them, uses the Resolver to process them, applies results to storage, and broadcasts outcomes. Ships with the server; does nothing without a Ruleset.
- **Ruleset**: A plugin package that defines schemas, actions, UI templates/bindings, and constrained resolver logic using a DSL. Rulesets are data-driven.
- **Resolver**: A pure function within the GameEngine that takes CampaignState + Action and produces a GameEvent using the Ruleset. **Resolvers have no side effects**—the GameEngine handles all persistence and broadcasting.

### Actions → GameEvents

An **Action** is an intent ("roll a skill check", "cast fireball"), not a state mutation. Actions are emitted by users or by chain reactions during resolution.

A **Resolution** is the computed outcome of resolving an Action:

- `events[]`: GameEvents to append to EventRecord (immutable "what happened")
- `patches[]`: validated state updates
- `prompts[]`: durable server→client affordances (buttons/choices)
- `workflow mutations[]`: create/update multi-step workflow state
- `telemetry`: optional debug fields

The GameEngine takes the Resolution, appends events to the EventRecord, applies patches, and broadcasts to connected clients.

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

2. **Load context**
   - campaign state view
   - seat role and ownership
   - active ruleset runtime + attached tomes
   - active workflows/prompts (for workflow continuation)

3. **Authorize**
   - role-based (gm/player)
   - ownership-based (player may act only on their actors unless allowed)
   - action-level and ruleset-level constraints

4. **Resolve**
   - The Resolver takes CampaignState + Action and produces a Resolution
   - **Resolvers are pure** — they have no side effects; all persistence is handled by the GameEngine
   - Optionally evaluate triggers: `resolveTriggered(event, ctx)` (see Triggers and Failure Handling for recursion limits)

5. **Apply transactionally**
   - The GameEngine generates all IDs for new entities, events, prompts, workflows
   - The GameEngine validates patches against `SchemaRegistry` before applying
   - Append GameEvents to EventRecord
   - Apply patches (storage assumes valid data after engine validation)
   - Upsert workflow state and prompt records
   - Update indexes / derived caches (optional)

6. **Broadcast**
   - deliver prompts to audiences
   - broadcast events and state deltas to relevant seats

7. **Return**
   - `EngineResult` containing applied outcomes for caller

---

## Failure Handling

All failure modes default to **cancel the current action and log an error**. The engine prioritizes safety and debuggability over partial execution.

| Failure                                       | Behavior                                                      |
| --------------------------------------------- | ------------------------------------------------------------- |
| Resolver throws or returns invalid Resolution | Cancel action, log error, return `EngineError` to caller      |
| Workflow timeout expires with no response     | Cancel workflow, log expiration, notify relevant seats        |
| Patch fails schema validation mid-Resolution  | Cancel entire action (no partial apply), log validation error |
| Tome reference points to missing entry        | Cancel action, log missing reference                          |
| RNG called more times than expected           | Log warning (audit trail may diverge on replay)               |

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

#### Engine Construction and Lifecycle

```ts
export type GameEngineOptions = {
  storage: Storage;
  rulesetLoader: RulesetLoader;
  realtime: RealtimeHub;

  rng: RngProvider;
  clock: Clock;
  logger: Logger;
};

export interface GameEngine {
  openCampaign(campaignId: CampaignId): Promise<void>;
  closeCampaign(campaignId: CampaignId): Promise<void>;

  handleAction(action: ActionEnvelope): Promise<EngineResult>;
  handleWorkflowInput(input: WorkflowInputEnvelope): Promise<EngineResult>;

  getInitialSync(seatId: SeatId, campaignId: CampaignId): Promise<SyncBundle>;
}
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
