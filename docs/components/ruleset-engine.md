# Ruleset Engine — HearthVTT (`docs/components/ruleset-engine.md`)

> **Status:** Boundary-only design. The engine _interior_ (how rulesets are loaded, executed, and sandboxed; how tomes parameterize behavior; how effects and modifiers compose) is **deferred** to a separate design pass that starts after the rest of the application is in a ready state. See [ADR 011](../decisions/011-engine-facade-and-dsl-reversal.md) for the decision that produced this state.
>
> This document defines the **engine boundary**: what is inside it, what is outside it, what the public surface looks like, and what the baseline (no-ruleset-loaded) engine does. It does **not** specify ruleset authoring, the DSL (there is no DSL), or resolver semantics. Those are explicitly out of scope.

---

## Purpose of this document

Establish, in one place:

- **What the engine owns** (and therefore what nothing outside the engine may touch directly).
- **What the engine exposes** (the facade — `dispatch`, `getView`, `subscribe`, events).
- **What the baseline engine does** before any ruleset is loaded (the VTT-universal feature set).
- **How rulesets eventually plug in** at a contract level (without specifying the contract's interior).
- **Cross-cutting invariants** the engine must maintain regardless of ruleset (determinism, durability, event ordering, audience filtering, capability checks).

---

## Background

The previous design committed to a custom JSON-based DSL with an EBNF expression language, a pure `RulesetRuntime.resolve(action) → Resolution` function, patches on the wire, and a host of overlapping concepts (workflows, prompts, triggers; effects with stacking; templates parameterized by tome data). It was reversed before implementation — see [ADR 011](../decisions/011-engine-facade-and-dsl-reversal.md) for the full rationale.

The replacement is smaller in surface area, larger in deferred work:

- Boundary first, interior later.
- Baseline engine does only VTT-universal things; no TTRPG-mechanical concepts.
- Events are the wire protocol; SeatView is the resync object; patches are an engine-internal detail.

---

## The boundary

The engine is a facade, in the same sense as `Storage`. Everything outside calls only the public surface; everything inside is private and may be reorganized without affecting consumers.

### Inside the boundary (engine-owned)

- **Ruleset, RulesetRuntime, Tomes, Compendium.** No public type for these. They are loaded at engine construction and consumed internally. Outside callers know only that an engine has a ruleset loaded.
- **CampaignState.** Entities, scenes, tokens, actors, drawings, visibility / exploration masks, measurements, labels, active workflows, active prompts. No public type. Outside callers see _projections_ via `SeatView`.
- **Patches and `applyPatches`.** Internal mutation machinery. Not exported. Not on the wire.
- **Snapshots and event-record management.** Internal persistence rhythm. Storage backend is injected; the engine decides _when_ to snapshot.
- **RNG provider and deterministic action IDs.** Sequence numbers, action IDs (`hash(campaignId, sequenceNumber, actionType, canonicalJSON(payload))`), and the RNG seed for each action are derived by the engine. Outside callers see only events with their `seq`.
- **Visibility / fog computation timing and storage.** Pure geometry math (`computeVisibility`) lives in `shared/visibility/` so the renderer can use it for optimistic lit-area overlay — but the engine decides when to update the persistent exploration mask and emits `fog.revealed` events. Geometry shared; ownership engine-side.
- **Authorization.** `canSeatDo(seatId, actionType, entityId?)` is an engine decision. Capabilities surfaced in `SeatView` are derived from this; the answer is the engine's.

### Outside the boundary (engine consumers)

- **HTTP routes.** Use the engine for action dispatch and for fetching SeatViews on explicit resync. Do not import internal engine types.
- **WebSocket transport (`RealtimeHub`).** Subscribes to the engine on behalf of connected seats; forwards events to clients; forwards `EngineInput`s from clients to `dispatch`. Does not interpret events.
- **Storage.** The engine _uses_ storage; storage knows about event rows, snapshot blobs, and prompt/workflow durability — but not about TTRPG concepts.
- **Client (in its entirety).** Renders the SeatView, applies incoming events to its derived state, dispatches user intents. Never imports patches, RulesetRuntime types, or CampaignState shape.
- **Tests of engine behavior.** Drive the engine through `dispatch` and read state through `getView`. Do not poke at internals.

---

## Public surface (sketch)

The exact shape will tighten during implementation, but the contract is:

```ts
interface GameEngine {
  /** Process a single action from a seat. Returns immediately with accept/reject + seq. */
  dispatch(input: EngineInput): Promise<DispatchResult>;

  /** Snapshot of everything the given seat is allowed to see, suitable for first-connect or resync. */
  getView(seatId: SeatId): SeatView;

  /** Subscribe to events the given seat is allowed to see. Returns an unsubscribe handle. */
  subscribe(seatId: SeatId, listener: (event: GameEvent) => void): Unsubscribe;

  /** Drain in-flight work, snapshot, and release. */
  close(): Promise<void>;
}

interface EngineInput {
  seatId: SeatId;
  actionType: ActionType; // e.g. "token.move", "chat.send", "dice.roll"
  payload: unknown; // validated inside the engine
  clientRequestId?: string; // idempotency key; same id from same seat is a no-op
}

type DispatchResult =
  | { accepted: true; seq: number; actionId: string }
  | { accepted: false; reason: string };

interface SeatView {
  seatId: SeatId;
  lastSeq: number;

  scene: {
    /* renderable scene state visible to this seat */
  };
  tokens: ReadonlyArray<{
    /* per-token public shape */
  }>;
  actors: ReadonlyArray<{
    /* actor records this seat may see */
  }>;

  fog?: {
    /* exploration mask + currently-lit polygon for owned tokens */
  };

  drawings: ReadonlyArray<{
    /* drawings visible to this seat */
  }>;
  measurements: ReadonlyArray<{
    /* measurements visible to this seat */
  }>;
  labels: ReadonlyArray<{
    /* labels visible to this seat */
  }>;

  recentEvents: ReadonlyArray<GameEvent>; // bounded history for chat/log/notif catch-up
  activePrompts: ReadonlyArray<Prompt>; // prompts targeted at this seat

  capabilities: Capabilities; // see "Capabilities"
  rulesetPanels: ReadonlyArray<PanelDef>; // see "Ruleset-contributed UI"
}
```

The full per-field shape of `SeatView` (scene/tokens/actors/etc.) is defined in [shared-types.md](../shared-types.md).

### Notes on the surface

- **`dispatch` is the only mutation entry point.** There is no `getState`, no `applyPatch`, no `setToken`. Everything mutating goes through `dispatch`.
- **`subscribe` is per-seat.** Audience filtering happens before the listener is called. The transport layer wires one subscription per connected seat (and a seat may have multiple connections sharing the subscription).
- **`getView` is for connect/reconnect/resync only.** Not for ticking. Clients consume events during steady-state play.
- **`clientRequestId`** is optional. If absent, no idempotency. If present, the engine remembers the resolved `DispatchResult` for a bounded window (e.g. last N actions or last M minutes) and replays it for duplicates.

---

## Events are the wire protocol

After connecting and receiving a `SeatView`, the client consumes a stream of `GameEvent`s. Events are the only steady-state server→client information.

- **One event = one audience.** Multi-target prompts (six saves for a fireball) are six events, each with one target seat. The engine internally correlates the responses via a workflow row; the wire format is flat.
- **Every event carries a monotonically-increasing `seq` per campaign.** The client tracks `lastSeenSeq`; a gap is the signal to call `getView` and resync.
- **Synthetic events for derived state.** When a token enters a seat's visibility, the engine emits `token.appeared`; when it leaves, `token.disappeared`. The client does not compute this from visibility math.
- **Patches do not appear on the wire.** Events are higher-level (`chat.posted`, `token.moved`, `fog.revealed`, `drawing.created`, `prompt.shown`, `prompt.resolved`, etc.). The client renders events; it does not apply patches.

### Sequence-gap detection vs. tail checksums

A simple per-campaign `seq` on every event is sufficient to detect missed events. Tail checksums and rolling state hashes were considered and deferred — sequence-gap detection catches the cases that motivated them, more cheaply.

---

## The baseline engine (no ruleset loaded)

The baseline engine implements only **VTT-universal** features. There is intentionally no TTRPG mechanics here.

The baseline engine knows about:

- **Scenes** — background image/video, grid type and spacing, walls (for visibility).
- **Tokens** — position, image, size, owning seat, optional name.
- **Actors** — `{ id, name, image?, ownerSeatId?, freeTextNotes?, freeTextGMNotes? }`. Minimal; the ruleset adds structure.
- **Dice rolls** — `dice.roll` action; rolls go through the engine's authoritative RNG so results are reproducible and unforgeable.
- **Chat** — `chat.send` action; emits `chat.posted` events.
- **Drawings** — `drawing.create` / `drawing.delete`; persistent or ephemeral; visible to all or to a chosen audience.
- **Measurements** — `measurement.start` / `measurement.update` / `measurement.end`; private or shared.
- **Labels** — `label.create` / `label.delete`.
- **Fog / exploration mask** — per-user visibility masks at baseline. GMs see no fog. The engine updates the mask when player-owned tokens move and emits `fog.revealed`.

The baseline engine **does not** know about: initiative, turn order, HP, AC, abilities, attacks, spells, slots, saves, advantage, encounters, sanity, momentum, spotlight, factions.

Those are _ruleset_ concerns. Rulesets that want them implement them and contribute UI for them.

### Built-in tool toggles

Each built-in feature has a UI affordance in the play UI (dice drawer, chat sidebar, annotation tool, measurement tool, etc.). A loaded ruleset may **hide** any of these toggles from a seat's toolbar — but the underlying engine functionality remains available. This is so a ruleset that, say, replaces the default initiative tracker with its own custom UI can hide the built-in one without breaking other ruleset code that still uses the underlying dice or chat functionality.

---

## Capabilities

Capabilities are surfaced in `SeatView` and tell the UI what the seat is _currently_ allowed to do.

```ts
interface Capabilities {
  globalActions: ReadonlySet<ActionType>;
  entityActions: ReadonlyMap<EntityId, ReadonlySet<ActionType>>;
}
```

- **`globalActions`** — actions this seat can perform without an entity target (or with any entity target), e.g. `chat.send`, `dice.roll`, `drawing.create`.
- **`entityActions`** — per-entity overrides. Only populated for entities where the seat has _special_ permissions. Empty for entities where role + ownership rules already answer.

### Baseline behavior

The baseline engine does **not** populate capabilities. Both fields are empty. The UI falls back to role + ownership: GMs can do everything; players can modify entities they own; everyone can chat / roll / draw.

### With a ruleset loaded

The ruleset populates capabilities to encode rules like "you can only attack on your turn," "you've used your reaction this round," "this prompt is targeted at you and times out in 30s." UI components check `canDispatch({ actionType, scope: entityId })` before enabling action buttons.

The semantic rule for consumers: **if `capabilities` is empty for an entity, fall back to role + ownership. Otherwise, capabilities is authoritative.**

---

## Ruleset-contributed UI

Rulesets contribute UI surfaces via `rulesetPanels` in the SeatView. A panel is a declarative description, not arbitrary code; the constrained component-tree shape is **deferred** to the ruleset-interior design pass.

```ts
interface PanelDef {
  id: string;
  title: string;
  icon?: string;
  slot: 'toolbar' | /* future: 'sidebar' | 'floating' */;
  content: PanelContent;   // shape TBD; declarative tree, not JS
}
```

The play UI's left toolbar reserves space for ruleset panels. Other surfaces (right sidebar = chat, bottom = notifications/prompts, top = actor pills) are not extensible by rulesets at this stage. See [client.md](client.md) for the UI's render contract.

---

## Workflows and prompts

> **Note:** The interior of how rulesets _create_ workflows and prompts is deferred. The engine's _external_ contract is below.

A **prompt** is an action affordance the engine has shown to a specific seat. It appears as an event (`prompt.shown`), persists in `SeatView.activePrompts`, and resolves when the seat responds (or it expires, or it's cancelled). Resolution emits `prompt.resolved`.

A **workflow** is an internal state machine the engine maintains across prompts (e.g. "six saves are pending; resolve when all six respond or after a 30s timeout"). Workflows are **engine-internal** — the wire protocol surfaces them only as the events and prompts they produce.

Pause-and-resume across user input is modeled as an **explicit workflow state machine in campaign state**, not as a host-language coroutine or promise. This is the durability constraint: a power loss mid-workflow leaves the workflow row persisted; on engine reload the workflow resumes from its row, not from a stack frame that no longer exists. See [ADR 011](../decisions/011-engine-facade-and-dsl-reversal.md) for the reasoning.

---

## Determinism and replay

The engine is deterministic given the same inputs:

- **Sequence numbers** are assigned by the engine, monotonic per campaign.
- **Action IDs** are derived: `hash(campaignId, seq, actionType, canonicalJSON(payload))`. The same payload at the same seq produces the same actionId.
- **RNG seed for an action** is derived from its actionId. The same action rolled twice produces the same dice.
- **The event log is the source of truth.** Snapshot + replay reproduces state.

### Crash recovery

Events are persisted atomically before they are broadcast. A crash before persistence drops the in-flight action (the client may retry with the same `clientRequestId` once reconnected). A crash _between_ persistence and broadcast still reaches all seats on reconnect, since the client requests `getView` and catches up.

### Replay branches

If the GM rolls back to a previous snapshot, all events after the rollback point are **discarded**, not preserved. We do not maintain a timeline tree. The next dispatched action becomes the new `seq` after the snapshot. This is the simplest model; if "undo with redo" becomes a hard requirement, it returns as a future feature.

---

## Visibility (boundary view)

Visibility computation is a pure function in `shared/visibility/`:

```ts
function computeVisibility(
  tokenPos: Point,
  visionParams: VisionParams,
  walls: WallSegment[],
  sceneBounds: Rect,
): VisibilityPolygon;
```

The engine calls it when authoritative visibility changes (token moves, walls change, vision params change). The renderer calls it to draw the currently-lit overlay optimistically.

- **Exploration mask** (the gray "previously seen" overlay): persisted in campaign state, updated server-side only, emitted as `fog.revealed` events.
- **Currently-lit polygon** (bright area around your token right now): derived from token position; the client computes it locally for snappy rendering during drag.

On optimistic token move: the client moves the token, recomputes the lit polygon from the new position, and renders both. On server accept (`token.moved` event), state matches and there's nothing visible to do. On server reject (`token.move.rejected`), the client snaps the token back and the lit polygon updates automatically because it's derived from position.

The baseline uses **per-user visibility masks**. Multi-source visibility (per-token, per-party, hidden-from-allies) is a ruleset concern and is deferred.

---

## What is explicitly deferred

These are real problems that will need design work. They are _not_ part of the engine-boundary refactor sprint.

- **Scripting runtime for rulesets** (QuickJS vs. Lua vs. direct TS imports). Final choice waits until the engine interior is being designed. The constraint that rules it: pause-and-resume must be modeled as durable workflow state, not as coroutines/promises in the host language.
- **Ruleset / Tome / Engine / Campaign relationship.** Currently tightly coupled and vaguely specified. Detangling is a separate design pass.
- **Triggers and chain reactions.** The previous design had reentrancy with a recursion limit; the new design defers triggers entirely until the engine interior is designed.
- **Per-seat / multi-source visibility masks.** Baseline has per-user masks; ruleset-driven multi-source visibility comes later.
- **`PanelContent` shape for ruleset-contributed UI.** Reserved in `SeatView` as an opaque field; concrete shape comes with the ruleset interior design.
- **Hot-reload of rulesets during play.** Useful for authoring; out of scope for now.

---

## Failure modes (boundary)

| Failure                                              | Engine behavior                                                                                                  |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `dispatch` payload fails validation                  | Reject with `{ accepted: false, reason }`. No state change, no event.                                            |
| Seat lacks capability for the requested action       | Reject. No state change, no event.                                                                               |
| Action resolution throws unexpectedly                | Reject. Rollback any in-progress patches. Log. No partial state.                                                 |
| Storage write fails                                  | Reject. The engine is the source of truth in memory; persistence is required for the event to count. Log loudly. |
| Workflow times out                                   | Engine emits `workflow.cancelled` and any associated `prompt.cancelled`. Affected seats see normal events.       |
| Client sends `clientRequestId` already seen          | Return the stored `DispatchResult` for that request id; no second event.                                         |
| Client connects with `lastSeq` ahead of engine's seq | Treat as fresh connect: send `SeatView` and resume.                                                              |

---

## Hard ruleset security constraints

Rulesets are untrusted third-party code. Even a legitimate ruleset distributed by a reputable author may be compromised via a supply-chain attack. A malicious GM could also upload a targeted ruleset designed to attack a specific player's session.

The following rules are **non-negotiable**. They apply regardless of how the ruleset interior is implemented (QuickJS, Lua, restricted TypeScript, etc.). Any implementation of the ruleset engine must enforce them — they are not merely guidelines.

### UI constraints

1. **Ruleset-supplied strings are never injected as HTML.** Ruleset-provided text content is bound as text nodes only. No `innerHTML`, `v-html`, `{@html ...}`, `dangerouslySetInnerHTML`, or any equivalent DOM mutation that interprets the string as markup.

2. **Ruleset UI templates are a closed declarative grammar.** A ruleset contributes UI by providing a declarative component tree (shape TBD during the ruleset-interior design pass). It may not supply:
   - arbitrary HTML attributes
   - `style=` string values (whitelist specific styling tokens instead)
   - event handler expressions (only `dispatch(actionType, payload)` is the permitted interaction primitive)
   - `<script>` or `<style>` tags

### Code execution constraints

3. **Ruleset code has no access to the DOM.** QuickJS (or equivalent sandbox) must not expose `document`, `window`, `navigator`, `location`, or any browser global. Code cannot read or write the DOM.

4. **Ruleset code cannot make network requests.** No `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, or any equivalent. All I/O is engine-mediated.

5. **Ruleset code must be synchronous.** No `Promise`, `async`/`await`, `setTimeout`, `setInterval`, `queueMicrotask`, or any mechanism that can defer execution or escape the synchronous call. The durability model (see [Determinism and replay](#determinism-and-replay)) requires that ruleset logic is fully resolved within a single synchronous invocation; async code would require saving and restoring host-language call stacks across persistence boundaries, which is explicitly rejected.

6. **Ruleset code cannot directly mutate campaign state.** All state changes go through engine primitives (roll, patch, prompt, emit event, etc.). Ruleset code that needs to modify state must call an engine-provided primitive; it cannot reach into the state object directly.

### Enforcement note

The mechanism for enforcing these constraints (static analysis of ruleset source, capability-based API surface, sandboxed worker with no exported globals, a security scanner run at ruleset install time, or a combination) is **explicitly deferred** to the ruleset-interior design pass. No ruleset execution exists yet. This section documents the constraints, not the implementation.

---

## Relationship to other documents

- [docs/decisions/011-engine-facade-and-dsl-reversal.md](../decisions/011-engine-facade-and-dsl-reversal.md) — the decision that produced this design.
- [docs/decisions/004-gameengine-class-architecture.md](../decisions/004-gameengine-class-architecture.md) — partially superseded by ADR 011. The "one engine per active campaign," "campaign manager," and "engine owns in-memory state" pieces survive. The RulesetRuntime-as-pure-function and Resolution-shape pieces are removed.
- [docs/shared-types.md](../shared-types.md) — canonical types. `SeatView`, `EngineInput`, `DispatchResult`, `Capabilities`, `ActionType` are defined there. `Patch` and `Resolution` are **no longer shared types**; they are engine-internal.
- [docs/architecture-overview.md](../architecture-overview.md) — high-level system map; reflects the facade.
- [docs/components/data-model.md](data-model.md) — what's in campaign state (now includes drawings, visibility masks, measurements).
- [docs/components/server.md](server.md) — how the server hosts the engine, wires it to HTTP and WS, and persists.
- [docs/components/client.md](client.md) — how the client consumes `SeatView` and events; concern-vs-element separation; ruleset panel slots.
- [docs/protocols/realtime-ws.md](../protocols/realtime-ws.md) — wire format (events + view requests + dispatch envelopes).
- [docs/implementation-strategy.md](../implementation-strategy.md) — the engine-boundary refactor phase that precedes engine-interior work.
