# 011: Engine Facade Boundary and Reversal of the Custom DSL

## Status

Accepted

## Context

HUBRIS! Total, unmitigated HUBRIS! I was gearing up to create a new programming language and interpreter. Using **JavaScript**. What was I thinking?

The original ruleset-engine design — captured in [ADR 004](004-gameengine-class-architecture.md) and [docs/components/ruleset-engine.md](../components/ruleset-engine.md), with grammar and ops specified in [docs/components/domain-specific-language.md](../components/domain-specific-language.md) — committed the project to building a custom JSON-based domain-specific language for ruleset authoring, plus a pure-function `RulesetRuntime` embedded in a concrete `GameEngine` class. The engine also leaked several decisions outward: patches were a wire-protocol concept on the client; `GameEvent`, `Prompt`, and `WorkflowState` were part of the shared types package and were consumed directly by UI, storage, and the WebSocket protocol; visibility, fog, drawings, and measurements had ambiguous ownership; built-in primitives like `token.move` and `chat.send` were defined as engine concepts whose runtime bypass enabled phase-2 work to ship before any ruleset existed.

After three previous expensive refactors driven by underspecified architecture (SQLite multi-DB collapse → ADR 009; play UI overhaul; admin auth → ADR 007 / ADR 010), an adversarial review of the ruleset engine before implementation surfaced enough structural problems to warrant reversing the previous decision rather than patching it.

The problems with the previous design, in order of severity:

1. **Building a programming language inside JavaScript.** A custom DSL requires a lexer, parser, type checker, evaluator, error reporter, debugger, and eventually a visual editor. Each of these is a multi-week project. The DSL was specified before a single ruleset had been implemented; its primitives were D&D-shaped (advantage, saves, AoEs) despite the "system-agnostic" goal.
2. **Coupling that prevented incremental work.** The engine, as specified, did nothing without a ruleset. Renderer, UI, and contributor work that did not touch game mechanics still had to mock the engine's full shape, and the mock kept drifting as the engine spec churned.
3. **Workflow + Prompt + Trigger concept overlap.** Three overlapping "pause and resume" mechanisms were specified. The example resolvers in the spec did not actually pause where the spec said they would (selectAoE and queryTargets were inside a single resolver that was supposed to be a continuous program).
4. **RNG determinism + state hashing was broken at the persistence layer.** A server crash mid-resolution could leave the persisted RNG counter ahead of the persisted event log. A campaign that loaded successfully would then diverge from its own history on replay from a checkpoint. State hashing for desync detection was specified but not made tractable.
5. **Effects/modifier stacking was hand-waved.** One of the hardest problems in TTRPG automation was deferred to "the effects system" without a model.
6. **Templates-in-tomes were half a language.** Tomes carried parameter blobs that were interpreted by ruleset templates; the parameters were not data (because they referenced expressions) and not code (because they couldn't be edited as code). This is the worst-of-both-worlds state that creates language design pressure on the tome format.
7. **Patches as a wire-protocol concept.** The client had a `Patch` type, a stub `applyDelta`, and a "delta broadcast" model. This made the client a small game-engine implementation in its own right, with all the synchronization fragility that implies.
8. **No room for ruleset-contributed UI.** The play UI baked in fixed toolbar slots and assumed the engine emitted UI affordances only via Prompts. Rulesets that want to contribute persistent UI surfaces (initiative tracker, spotlight, sanity meter, momentum pool) had no slot.
9. **No client-mobile flexibility.** UI layout was committed at the component-tree level. A different form factor would require a parallel UI, not a different consumer of the same data.

## Decision

### 1. Reverse the custom DSL

Drop the JSON-based resolver DSL, the EBNF expression grammar, the op catalog (`calc`, `roll`, `emit`, `patch`, `prompt`, `if`, `foreach`, `call`, `selectTargets`, `selectAoE`, `queryTargets`, `applyEffect`, `removeEffect`, `recomputeDerived`, `encounter.*`, `awaitResponses`, `cancelPrompt`), and the parameterized-template-in-tome model. Delete [docs/components/domain-specific-language.md](../components/domain-specific-language.md).

The eventual ruleset implementation will likely use **QuickJS or Lua** for untrusted ruleset distribution, and **TypeScript modules loaded directly** during the period where rulesets are first-party. The final choice is deferred until the inside of the engine boundary is being designed; it is _not_ in scope for the next sprint.

**Constraint that drives the choice away from native JS host coroutines / promises:** the engine must be able to record actions-in-progress, not just resolved actions. A power loss mid-workflow with a persisted RNG counter at `seq=N+1` and a persisted event log at `seq=N` is a silent-corruption bug we cannot accept. Pause/resume across user input must therefore be modeled as an **explicit workflow state machine in campaign state**, not as a coroutine in the host language. Whichever scripting runtime is chosen, the contract is: resolver code runs to completion or rolls back; pausing for user input means writing a workflow row and ending the current resolution.

### 2. Engine becomes a facade with a stable, narrow boundary

Adopt the same facade pattern that the `Storage` layer uses (per [ADR 009](009-combined-sqlite-db.md) and [server.md](../components/server.md)). The engine has one public surface and a private interior; the rest of the application talks only to the surface.

**Inside the boundary** (owned by the engine, hidden from everything else):

- Ruleset, RulesetRuntime, Tomes, Compendium
- CampaignState (entities, scenes, tokens, actors, drawings, visibility masks, measurements, exploration masks, active workflows, active prompts)
- Patches, snapshot creation, event-record management, replay
- RNG provider, deterministic action IDs, sequence numbers
- Visibility computation (calls a pure geometry function in `shared/`, but ownership of _when_ to recompute and _where_ to store the result is the engine's)
- Authorization decisions (`canSeatDo`)

**Outside the boundary** (consumes the engine):

- HTTP routes
- WebSocket transport (`RealtimeHub`)
- Storage (the engine uses storage; storage does not know about game concepts beyond opaque blobs and event rows)
- The client in its entirety
- Tests against engine behavior use the public surface

**Engine public surface (sketch, final shape deferred):**

```ts
interface GameEngine {
  dispatch(input: EngineInput): Promise<DispatchResult>;
  getView(seatId: SeatId): SeatView;
  subscribe(seatId: SeatId, listener: (event: GameEvent) => void): Unsubscribe;
  close(): Promise<void>;
}
```

`DispatchResult` is `{ accepted: true } | { accepted: false, reason: string }` plus a sequence number. Successful dispatches emit one or more `GameEvent`s to all subscribed seats whose audience policy permits them; rejections do not.

### 3. Events are the steady-state wire protocol; SeatView is for connect / reconnect / explicit resync only

The previous design used a mix of `sync.delta` (patches), `sync.initial` (snapshot), and discrete events. Collapse this:

- **Events** are the only thing that flows server → client during normal play. Notifications are events. Prompts are events. Chat is events. Token moves are events. Drawings are events.
- **SeatView** is requested on first connect, on reconnect with a sequence gap, and on explicit resync.
- The client's job is to consume events and update its derived state. The client does **not** own a `CampaignState` it tries to keep in lockstep with the server. The client owns a `SeatView` and a list of recent events.

The shared `Patch` type and `applyPatches` function move _inside_ the engine and out of the shared package. The client never sees a patch.

**Sequence numbers** are mandatory on every event. The client tracks `lastSeenSeq`. A gap → request resync via `getView`. Tail-hash schemes and rolling state checksums are deferred; sequence-gap detection covers the cases that motivated them.

**Ownership of events: one event = one audience.** Multi-target prompts (e.g. six saves for a fireball) are six separate prompt events emitted by the engine, each targeted at one seat. The engine internally correlates the responses via a workflow row; the wire format stays one-event-one-seat.

### 4. Visibility / fog / drawings / measurements live inside the engine boundary

These are _campaign state_ — they need to be persisted, shared across seats, and rebuilt on reconnect. They are not ruleset-specific. The engine owns them as part of its universal baseline.

Visibility _geometry_ (the pure function `computeVisibility(tokenPos, visionParams, walls, sceneBounds) → polygon | cellset`) lives in `shared/visibility/` because both the renderer (for optimistic lit-area overlay) and the engine (for authoritative exploration updates) call it. The renderer never updates the exploration mask optimistically; only the lit overlay (which is derived from token position) is optimistic, so token snap-back on rejection produces correct visual rollback automatically.

The previous baseline of "per-user visibility masks" simplifies to **one shared player-fog mask per scene** for the engine's baseline. GMs see no fog. Multiple-vision-source rulesets (per-token party fog, hidden-from-allies, etc.) are a ruleset concern and will be layered later when the inside-the-boundary design happens.

### 5. The baseline engine implements only the VTT-universal feature set

The baseline engine has _no_ TTRPG-mechanical concepts. No initiative, no turn order, no HP, no actions-per-round, no advantage, no saves, no spell slots. All of those are ruleset concerns.

The baseline engine knows about:

- Scenes (background, grid, walls)
- Tokens (position, image, owning seat)
- Actors (id, name, image, owner seat, free-text notes, free-text GM notes) — minimal; the ruleset adds structure
- Dice (rolls go through the engine's RNG so they're authoritative and reproducible)
- Chat
- Drawings (ephemeral and persistent)
- Measurements (private and shared)
- Labels
- Fog / exploration mask (per scene)

Initiative, turn order, "spotlight," sanity, momentum, etc. — **rulesets implement these and contribute UI for them**.

### 6. Ruleset-contributed UI is part of the SeatView contract

The SeatView carries:

- The current scene and its renderable state
- The seat's owned actors and tokens
- The seat's recent events (chat / notification feed)
- The seat's active prompts
- **`capabilities`**: structured `{ globalActions: Set<ActionType>, entityActions: Map<EntityId, Set<ActionType>> }`. Reserved at baseline; populated when a ruleset is loaded. UI components check capabilities before enabling action buttons.
- **`rulesetPanels`**: an array of declarative panel definitions the ruleset wants rendered in the toolbar. The shape is `{ id, title, icon, slot, content }` where `content` is a constrained component tree (final shape deferred — declarative JSON tree, not arbitrary JS). The toolbar reserves the left side for these and for built-in tools; right is chat, bottom is notifications/prompts, top is actor pills.

A toggle exists for each _built-in_ tool: a ruleset may hide it from a seat's toolbar, but the underlying functionality (dice, chat, drawings, etc.) remains available via API so other ruleset code can still call into them. Rulesets do not get to _remove_ baseline functionality, only hide its default UI affordance.

### 7. Client separates concerns from visible elements

The client consumes the `SeatView` and event stream through a single canonical interface. It does not consume the engine's internal representation. Multiple frontends — current desktop/tablet UI, future mobile UI, future pop-out windows, future second-screen GM dashboard — all consume the same SeatView and emit the same `EngineInput`s.

Concerns the SeatView surface defines (renderable, regardless of layout):

- Map / canvas
- Chat / event log
- Notifications / prompts
- Tools
- Document container (character sheets, handouts, item cards)
- Actor status / pills

The desktop/tablet UI's three-zone layout (left tools, right chat, bottom notif, top pills) is one rendering of these concerns. A mobile UI is expected to be substantially different in layout while consuming the same data — this is acceptable, and the boundary makes it cheap.

### 8. Optimistic token move with quiet server confirmation

The client moves a token locally on drag, recomputes its own lit-area overlay from the new position (using the shared visibility function), and renders both. The server validates and emits `token.moved` + `fog.revealed` events. On accept, the client's state matches its optimistic state and the user sees nothing. On reject, the server emits a `token.move.rejected` event, the client snaps the token back, and the optimistic lit-overlay updates automatically because it's derived from token position.

The exploration mask is _never_ updated optimistically. Only the currently-lit overlay (derived) is.

### 9. `clientRequestId` on dispatch envelopes

Add an optional `clientRequestId: string` to every `EngineInput`. The engine treats this as an idempotency key: if the same `clientRequestId` from the same seat arrives twice, the second is a no-op that returns the original `DispatchResult`. This costs nothing if unused; it saves us from retry-storm bugs if used. Actions submitted without `clientRequestId` are not deduped.

### 10. Inside-the-boundary detangling is a separate, later design problem

The relationship between Engine, RulesetRuntime, Campaign, Ruleset, and Tome remains tightly coupled and underspecified. This is _acknowledged_ and _deferred_. The current sprint deals only with locking down the boundary, the baseline engine surface, and the data ownership model. Detangling the interior starts once the rest of the application is ready to actually use the engine.

## Alternatives considered

- **Patch the previous DSL design.** Rejected: every patch surfaced another problem (workflow / prompt / trigger overlap, RNG durability, effects-stacking handwave). The cost of fixing them was higher than the cost of replacing the design with a smaller one and deferring the rest.
- **Adopt an existing scripting runtime now (QuickJS, Lua, Wasm).** Rejected for _now_: choosing the runtime before the engine interior is designed locks us into the runtime's pause/resume model before we know what we need. Deferred to the engine-interior design phase.
- **Keep patches as the wire protocol.** Rejected: the client doesn't need to know about state shape granularly enough to consume patches. Events are higher-level, easier to render, and don't leak engine internals.
- **Per-seat visibility masks at baseline.** Rejected as overcomplicated for baseline. Single shared player-fog mask is the smallest thing that satisfies the universal VTT need. Per-seat masks return as a ruleset feature.
- **Engine emits Resolutions; transport layer converts to events.** Rejected: the engine already knows what's an event; making the transport layer redo that classification is duplication.

## Consequences

### Immediate consequences (this sprint)

- [docs/components/domain-specific-language.md](../components/domain-specific-language.md) is deleted.
- [docs/components/ruleset-engine.md](../components/ruleset-engine.md) is rewritten to describe the facade boundary, the baseline engine surface, the SeatView contract, and the deferred-interior model. The previous concrete interfaces (`GameEngineOptions`, `RulesetRuntime` class, `Resolution`, `WorkflowMutation`, `EffectDef`, `TomeIndex`) are removed.
- [ADR 004](004-gameengine-class-architecture.md) is partially superseded by this ADR. The "one engine per active campaign," "campaign manager," and "engine owns in-memory state" pieces survive. The "RulesetRuntime as private member with pure `resolve(action) → Resolution`" piece is replaced; the resolver-program model is gone.
- `shared/`: `Patch`, `applyPatches`, `Resolution`, `WorkflowMutation`, and DSL-program types are removed. `SeatView`, `EngineInput`, `DispatchResult`, `ActionType` (string brand), and `Capabilities` are added. `GameEvent`, `Prompt`, `WorkflowState`, and audience types remain — they are the wire vocabulary.
- The client's `campaignState` store stops trying to mirror server state via patches. It becomes a derived view over `seatView + recentEvents`. `applyDelta` is removed; `applyEvent` replaces it.
- The server's WebSocket handler stops broadcasting `sync.delta`. It broadcasts `event` and serves `view.get` requests.
- Implementation strategy gains a new phase (Engine Boundary Refactor) between current Phase 2 and the previously-planned Phase 3.

### Longer-term consequences

- Ruleset authoring is _not_ something we can do in this codebase yet. There is no DSL. There is no ruleset runtime. The next sprint produces a placeholder engine that exposes the SeatView contract and the baseline VTT-universal action surface; it does not run ruleset code.
- Rulesets, when they arrive, will distribute as code (TS module first; QuickJS/Lua-sandboxed once we ship to untrusted authors). The .ruleset file format becomes "a zip containing a manifest and code," not "a zip containing JSON resolver programs."
- The engine boundary makes a future mobile client cheap: same SeatView, different layout. It also makes a future hosted-multi-tenant deployment less risky: the boundary is the contract, the interior can be reorganized.
- The engine interior detangling (Engine ↔ Ruleset ↔ Campaign ↔ Tome) is the next _big_ design problem. It is explicitly out of scope for the boundary refactor sprint.

### Risks accepted

- Throwing out the DSL spec is a sunk-cost loss of design work. The replacement design has fewer total moving parts; the bet is that the time saved on not building a language exceeds the time spent on the DSL spec.
- Deferring the scripting-runtime choice means rulesets cannot be developed in earnest until that decision is made. We accept this; nothing else in the project is currently blocked by that decision.
- The baseline engine intentionally does no game mechanics. Until at least one ruleset is implemented, the project demonstrates VTT-as-shared-map-and-chat only. That is sufficient for several upcoming milestones and not a regression from the current state.

## References

- [ADR 004: GameEngine Class Architecture](004-gameengine-class-architecture.md) — partially superseded
- [docs/components/ruleset-engine.md](../components/ruleset-engine.md) — rewritten alongside this ADR
- [docs/components/domain-specific-language.md](../components/domain-specific-language.md) — deleted alongside this ADR
- [docs/architecture-overview.md](../architecture-overview.md) — updated
- [docs/shared-types.md](../shared-types.md) — updated (Patch removed, SeatView added)
- [docs/implementation-strategy.md](../implementation-strategy.md) — new phase inserted
