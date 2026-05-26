# 004: GameEngine as Concrete Class with Embedded RulesetRuntime

## Status

Accepted — **partially superseded by [ADR 011](011-engine-facade-and-dsl-reversal.md)**.

ADR 011 keeps:

- one `GameEngine` instance per active campaign
- `CampaignManager` lifecycle / lazy open / inactivity close
- dependency injection of `Storage`, `RealtimeHub`, `IdGenerator`, `Clock`, `Logger`

ADR 011 supersedes:

- the `RulesetRuntime.resolve(action, ctx) → Resolution` shape and the pure-function framing of the runtime
- the in-engine `applyPatches` model as a public concept (patches are now engine-internal)
- the `SyncBundle` initial-sync envelope (replaced by `SeatView` + event stream with `seq`)

The current document is preserved below for context. Treat anything that conflicts with ADR 011 as superseded.

## Context

HearthVTT requires an authoritative game engine that:

- resolves actions into GameEvents using ruleset logic
- maintains campaign state in memory for fast access
- handles persistence and side effects (storage, broadcasting)
- supports multiple concurrent campaigns with different rulesets
- ensures deterministic, transactional action resolution
- provides clear separation between pure resolution logic and side effects

The existing documentation described GameEngine as an interface, leaving implementation patterns underspecified. Key questions needed resolution:

1. **Lifecycle**: How are campaigns loaded/unloaded? Can multiple campaigns run concurrently?
2. **Concurrency**: How are concurrent actions processed? What are transaction boundaries?
3. **State Management**: Where does CampaignState live? How is it kept in sync with Storage?
4. **Ruleset Integration**: How does RulesetRuntime fit into GameEngine? Can rulesets be hot-swapped?
5. **Side Effects**: Who handles persistence, broadcasting, ID generation?

## Decision

### GameEngine as Concrete Class

Upgrade GameEngine from an interface to a **concrete class** that encapsulates all game logic. Unlike Storage (which uses a facade pattern with swappable backends), GameEngine has one canonical implementation.

### One GameEngine Instance Per Campaign

The server maintains a **CampaignManager** that creates/destroys GameEngine instances per campaign:

```typescript
class CampaignManager {
  private engines: Map<CampaignId, GameEngine> = new Map();

  async openCampaign(campaignId: CampaignId): Promise<GameEngine> {
    if (!this.engines.has(campaignId)) {
      const engine = await GameEngine.create({
        campaignId,
        storage,
        rulesetLoader,
        realtimeHub,
        idGenerator,
        rng,
        clock,
        logger,
      });
      this.engines.set(campaignId, engine);
    }
    return this.engines.get(campaignId)!;
  }

  async closeCampaign(campaignId: CampaignId): Promise<void> {
    const engine = this.engines.get(campaignId);
    if (engine) {
      await engine.close();
      this.engines.delete(campaignId);
    }
  }
}
```

**Benefits:**

- Memory isolation between campaigns
- Independent rulesets per campaign
- Simple concurrency (no cross-campaign locking)
- Clear lifecycle (create on first connection, destroy on inactivity/shutdown)

### GameEngine Owns CampaignState in Memory

GameEngine maintains the authoritative in-memory CampaignState:

- **Load**: On `GameEngine.create()`, load latest Snapshot from Storage, replay events since Snapshot to reconstruct state
- **Update**: After each action, apply patches to in-memory state, persist transactionally via Storage
- **Snapshot**: Create new Snapshot every 100 events OR on close
- **Unload**: On `GameEngine.close()`, create final snapshot if dirty, release memory

**Benefits:**

- Fast action resolution (no DB queries mid-resolution)
- Clear ownership (only GameEngine mutates state)
- Transactional consistency (state + persistence update atomically)

### RulesetRuntime as Private Member

RulesetRuntime is a **pure resolution engine** embedded within GameEngine:

```typescript
class RulesetRuntime {
  private readonly ruleset: Ruleset;
  private readonly tomeIndex: TomeIndex;
  private readonly schemaRegistry: SchemaRegistry;

  /**
   * Pure function: (Action + State) → Resolution
   * No side effects - all I/O provided via context.
   */
  resolve(action: Action, context: ResolveContext): Resolution | ResolverError {
    // Execute DSL operations
    // Return events/patches/prompts/workflows
  }

  validatePatch(patch: Patch, entityBefore: unknown): void {
    // Validate against schema
  }
}

class GameEngine {
  private readonly runtime: RulesetRuntime;
  private state: CampaignState;
  private actionQueue: AsyncQueue;

  static async create(options: GameEngineOptions): Promise<GameEngine> {
    // 1. Load campaign metadata
    // 2. Load Ruleset + Tomes
    // 3. Create RulesetRuntime instance
    // 4. Load Snapshot + replay events
    // 5. Return initialized GameEngine
  }
}
```

**Benefits:**

- Encapsulation (external code can't bypass GameEngine to call RulesetRuntime)
- Testability (RulesetRuntime can be unit tested independently)
- Clear API boundary (GameEngine.handleAction is the only entry point)

### Sequential Action Processing with Per-Campaign Queue

GameEngine processes actions **sequentially** via an internal AsyncQueue:

```typescript
async handleAction(action: ActionEnvelope): Promise<EngineResult> {
  return this.actionQueue.enqueue(async () => {
    return this.storage.transaction(async (tx) => {
      // 1. Authorize
      // 2. Resolve via RulesetRuntime
      // 3. Apply patches to in-memory state
      // 4. Persist events/patches/prompts via tx
      // 5. Broadcast via RealtimeHub
      // 6. Return EngineResult
    });
  });
}
```

**Benefits:**

- Prevents race conditions on CampaignState
- Simplifies transaction boundaries (one action = one transaction)
- Supports trigger recursion (up to 20 deep) within a single queued action
- Matches existing doc: "GameEngine manages the queue of Actions"

### No Ruleset Hot-Swapping

Campaigns **lock to a ruleset version** at creation. No in-flight ruleset changes allowed.

**Rationale:**

- Ruleset defines schemas, action definitions, resolver logic
- Changing mid-session risks schema incompatibility and state corruption
- Simplifies implementation (no migration logic needed)

**Upgrade Path:**

- Export `.campaign` file
- Upgrade server with new ruleset version
- Import campaign and run migration (if provided by ruleset)

### Defined Dependency Interfaces

GameEngine requires injected dependencies (all now fully specified):

```typescript
interface GameEngineOptions {
  campaignId: CampaignId;
  storage: Storage; // Persistence layer
  rulesetLoader: RulesetLoader; // Loads rulesets + tomes
  realtimeHub: RealtimeHub; // WebSocket broadcasting
  idGenerator: IdGenerator; // UUID generation
  rng: RngProvider; // Deterministic RNG
  clock: Clock; // Deterministic time
  logger: Logger; // Structured logging
  config?: GameEngineConfig; // Optional overrides
}
```

**New Interfaces Defined:**

- **RealtimeHub**: Broadcasts events/deltas/prompts with audience filtering
- **IdGenerator**: Generates UUIDs for entities/events/prompts/workflows
- **Logger**: Structured logging with context

See [ruleset-engine.md](../components/ruleset-engine.md) for complete interface signatures.

## Alternatives Considered

### 1. GameEngine as Singleton with Multi-Campaign State

**Approach:** One GameEngine instance managing multiple campaigns internally.

**Rejected because:**

- Shared state increases lock contention and coupling
- Harder to isolate campaign failures
- More complex resource management
- Doesn't match per-campaign ruleset requirement

### 2. RulesetRuntime as Separate Service

**Approach:** RulesetRuntime as a separate component that GameEngine calls via an interface.

**Rejected because:**

- Adds unnecessary indirection (no need for swappable implementations)
- RulesetRuntime is pure and stateless; embedding is simpler
- External access would bypass authorization and context building

### 3. Parallel Action Processing

**Approach:** Process multiple actions concurrently using optimistic locking or STM.

**Rejected because:**

- Increases complexity significantly
- Doesn't match "queue of Actions" from existing docs
- Action order matters for narrative consistency
- Most campaigns have 3-6 players; sequential processing is fast enough

### 4. Hot-Swappable Rulesets

**Approach:** Allow ruleset updates during active play.

**Rejected because:**

- Schema migrations are complex and error-prone
- State may become invalid under new schemas
- Adds significant complexity for minimal benefit (can restart campaign)
- Can be added later if truly needed

## Consequences

### Positive

- **Clear lifecycle**: Campaigns are explicitly opened/closed with obvious resource management
- **Simple concurrency**: Per-campaign instances eliminate cross-campaign locking concerns
- **Fast action resolution**: In-memory state avoids DB queries during resolution
- **Testable architecture**: Pure RulesetRuntime can be unit tested independently
- **Transaction safety**: Storage transaction API ensures atomic state updates
- **Multitenancy ready**: Multiple campaigns can run on one server with memory isolation

### Negative

- **Memory usage**: Each loaded campaign consumes memory for full CampaignState
  - _Mitigation_: Unload campaigns after inactivity timeout (e.g., 30 minutes)
- **No hot-swapping**: Ruleset upgrades require campaign restart
  - _Mitigation_: Export/import workflow is already needed for disaster recovery
- **Sequential processing**: Actions block each other within a campaign
  - _Mitigation_: Resolvers are fast (pure computation); rarely a bottleneck

### Implementation Notes

- **CampaignManager** should track last activity time and auto-unload inactive campaigns
- **Snapshot creation** should be configurable (default: 100 events OR 15 minutes)
- **RealtimeHub** must filter events by Audience before broadcasting (security critical)
- **IdGenerator** should use crypto.randomUUID() in production, deterministic mock in tests
- **Logger** should include campaignId context in all GameEngine log messages

### Migration Path

1. Implement dependency interfaces (RealtimeHub, IdGenerator, Logger)
2. Implement RulesetRuntime as pure class
3. Implement GameEngine with embedded RulesetRuntime
4. Implement CampaignManager for lifecycle management
5. Wire into Fastify server startup
6. Add integration tests with in-memory backends

---

## References

- [Architecture Overview](../architecture-overview.md) — System-level design principles
- [Ruleset Engine](../components/ruleset-engine.md) — Complete GameEngine specification
- [Shared Types](../shared-types.md) — Canonical type definitions
- [Server Component](../components/server.md) — Server initialization and wiring
