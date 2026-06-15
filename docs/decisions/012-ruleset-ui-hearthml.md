# 012: HearthML — Ruleset-Defined Declarative UI

## Status

Accepted

## Context

ADR 011 established the engine facade boundary, deferred ruleset execution (QuickJS) to a later design pass, and reserved `rulesetPanels: unknown[]` in `SeatView` for ruleset-contributed UI. The play UI had a fixed toolbar with no mechanism for rulesets to contribute custom interface elements. Two concrete V1 targets were identified:

1. **Actor pill customization** — ruleset-defined stat display (HP bar, AC) and action buttons in the pill dropdown
2. **Initiative tracker** — ruleset-defined floating window with turn order, advance/retreat buttons, and workflow integration

The design was explored over 3 rounds with 10 councilors, applying the adversarial patterns from `design-failure-patterns.md` (premature abstraction, concept overlap, boundary leakage, mini-language risk, happy-path-only design).

### Key tensions resolved

| Tension | Resolution |
|---------|------------|
| Widget catalog vs. compositional primitives | Composition wins — 10 primitives, not a pre-built widget set. Prefabs (progress bar) are shortcuts, not the only option. |
| String-path bindings vs. discriminated unions | Discriminated unions — no path parser, no mini-language. |
| Server-resolved panels vs. client-side binding | Hybrid — static templates + client-side binding resolution for data display; campaignData blob for campaign-level derived state. |
| Derived fields (STR mod, attack bonus) | `recomputeActorData` hook in RulesetManifest. Single monolithic function, no dependency graph engine. Convention: `actor.data.derived.*`. |
| Optimistic updates for fast interactions | `optimisticOverlay: SvelteMap` in campaignState, transparent via `getCampaignData()`. Snap-back on rejection. |
| Panel data transmission | Separate `panel.defs` WS message (once per session), not polluting SeatView resync payloads. |

## Decision

### 1. HearthML — 10 composable primitives

The ruleset UI is a JSON-serializable declarative tree with a closed set of node kinds:

| Category | Primitives | Description |
|----------|-----------|-------------|
| Layout | `hbox`, `vbox`, `grid` | Flex row, flex column, CSS grid |
| Display | `text`, `progress`, `icon`, `divider` | Text (with formatters), progress bar, icon, horizontal rule |
| Interactive | `button` | Dispatches `dispatch(actionType, payload)` |
| Flow | `forEach`, `when` | Iterate over a binding array; conditional rendering |

All 10 primitives are defined as TypeScript interfaces + Zod schemas in `shared/src/ruleset-ui.ts`. The client renders them via a single Svelte 5 interpreter component (`PanelRenderer.svelte`) that walks the tree and emits native Svelte elements. New primitives extend the discriminated union without breaking existing panels.

**Deferred to V2:** `stack` (card-hand fanned layout), `image`, `input`, `slider`, `tabs`, `select`.

### 2. Discriminated union bindings — no string paths

Data bindings are type-safe discriminated unions, not raw string paths. Four binding kinds for V1:

```ts
type Binding =
  | { kind: 'actor.data'; actorId: string; key: string }
  | { kind: 'campaignData'; key: string }
  | { kind: 'eventState'; eventType: string; path: string }
  | { kind: 'literal'; value: string | number | boolean };
```

`actor.data` bindings use `${varName}` template interpolation for scope variables (e.g., `${scope.actorId}`), resolved by the binding resolver at render time. This is NOT a template language — it only substitutes scope variable names and is bounded to a single `${}` regex.

**Rejected:** `{{path}}` string interpolation (would grow into Handlebars), per-field derived bindings (mini-language risk), expression trees (deferred to V2 if needed).

### 3. Style system — constrained tokens + CSS class escape hatch

Ruleset panels use a constrained style token palette that maps to CSS custom properties:

```ts
type StyleTokens = {
  padding?: 'none' | 'xs' | 'sm' | 'md' | 'lg';
  gap?: 'none' | 'xs' | 'sm' | 'md' | 'lg';
  flex?: number;
  textVariant?: 'body' | 'caption' | 'h3' | 'h4';
  color?: 'default' | 'muted' | 'accent' | 'danger' | 'success' | 'warning';
  bg?: 'none' | 'surface' | 'elevated';
  width?: number; height?: number;
  alignItems?: 'start' | 'center' | 'end' | 'stretch';
  justifyContent?: 'start' | 'center' | 'end' | 'between';
};
```

The `sx.class` escape hatch allows referencing a CSS class from a ruleset-supplied stylesheet (validated at load time — no `url()`, no `attr()`, no `@import`). A full `sx` CSS-property whitelist (like MUI's `sx` prop) is deferred to V2.

### 4. `campaignData` — campaign-level blob via `api.setCampaignData()`

A `Record<string, unknown>` on both `SeatView` and `CampaignState` for campaign-scoped computed state (initiative order, party resources, story flags). Resolvers write to it via `api.setCampaignData(key, value)`. The engine snapshots before dispatch, diffs after, and emits `campaignData.updated` events with only changed keys.

No `campaignData.replace` intent — the resolver sets individual keys; the engine handles diffing.

### 5. Derived field hook — `recomputeActorData`

A single monolithic function in `RulesetManifest`:

```ts
recomputeActorData?: (
  touchedActorIds: string[],
  api: ResolverApi,
) => Record<string, Record<string, unknown>>;
```

- Called after all intents from a dispatch are processed.
- Receives the set of actor IDs whose `data` was modified.
- Returns patches shallow-merged into `actor.data`.
- **Convention:** store derived values under `actor.data.derived.*` for future JSON Patch compatibility and bulk recompute.
- Hook exception rolls back the entire dispatch (no partial state persisted).

**Rejected alternatives:**
- Per-field computors with dependency graph (would require a scheduler in the engine)
- Engine-level derived field declarations (extra declaration type)
- Client-side formatters for complex formulas (resolver must pre-compute display data anyway)

### 6. Optimistic overlay — transparent SvelteMap in campaignState

A `SvelteMap<string, unknown>` (`optimisticOverlay`) in `campaignState`. `getCampaignData(key)` checks the overlay before authoritative data. Methods:

- `applyOptimistic(entries)` — set before dispatch
- `confirmOptimistic(keys)` — clear on server accept (or automatically when `campaignData.updated` arrives with matching keys)
- `revertOptimistic(keys?)` — clear on rejection (also called on reconnect with all entries)

The overlay is per-tab (client-only), not shared across the seat's connections — this is intentional.

### 7. Panel transmission — separate `panel.defs` WS message

Panel definitions are NOT in `SeatView`. Instead:

- **Server → Client:** `{ type: 'panel.defs', panels: PanelDef[] }` — sent once after `welcome`, before `view`. Client caches in `campaignState.rulesetPanels`.
- **Client → Server:** `{ type: 'panel.defs.request' }` — for re-request after `ruleset.changed` (V3).

This keeps `view` messages lean for desync recovery — panels don't change during a session.

### 8. Panel slots — three injection points for V1

```ts
type PanelSlot = 'toolbar' | 'actor-pill' | 'window';
```

- `toolbar` — icon in left toolbar, opens a drawer with PanelRenderer content
- `actor-pill` — rendered inside the actor pill dropdown, receives `{ scope: { actorId } }`
- `window` — floating `TabbedWindow` with PanelRenderer content

Future slots: `sidebar`, `token-hud`, `character-sheet`, `canvas-overlay`.

### 9. DX — TypeScript authoring with `@hearth-vtt/shared`

Ruleset authors write PanelDefs in TypeScript using types imported from `@hearth-vtt/shared`. The ruleset build process serializes to JSON for the QuickJS boundary. Full autocomplete and type-checking during authoring. No JSON-by-hand, no custom schema DSL.

### 10. Styling escape hatch — `sx.class`

```ts
type SxProps = { class?: string };
```

References a class from a ruleset-supplied, validated stylesheet. No raw CSS properties inline. Full `sx` (whitelisted CSS properties like MUI) deferred to V2.

## Architecture diagram

```
Ruleset author (TS) → panelDefs → JSON → .ruleset zip
    │
    ▼
QuickJS boundary → Engine (Zod validate) → panelDefs stored
    │
    ▼
WS: welcome → panel.defs (once) → view (with campaignData)
    │
    ▼
Client: campaignState.rulesetPanels ← panel.defs message
        campaignState.campaignData ← view + campaignData.updated events
    │
    ▼
PanelRenderer.svelte → walks PanelNode tree → resolveBinding()
    │                                            ↓
    │                              campaignState (Svelte-reactive)
    │                                            ↓
    ▼                              Svelte 5 $derived tracks reads
Renders: <span>, <button>, <progress>, <div>, etc.
    │
    ▼
User click → dispatch(actionType, payload)
    │
    ├── optimisticOverlay.set(key, value) → UI updates instantly
    │
    ▼
Server: dispatch → resolver → api.setCampaignData()
    │
    ├── campaignData.updated event (changed keys only)
    ├── actor.dataReplaced events (from recomputeActorData hook)
    │
    ▼
Client: applyEvent → merge → confirmOptimistic → UI authoritative
```

## Files created/modified

| File | Status | Purpose |
|------|--------|---------|
| `shared/src/ruleset-ui.ts` | New | All HearthML types + Zod schemas |
| `shared/src/engine.ts` | Modified | Added `campaignData` to `SeatView`, removed `rulesetPanels` |
| `shared/src/protocol/ws.ts` | Modified | Added `panel.defs` and `panel.defs.request` message types |
| `shared/src/index.ts` | Modified | Export HearthML types |
| `server/…/types.ts` | Modified | Added `setCampaignData` to `ResolverApi`, `panels` + `recomputeActorData` to `RulesetManifest` |
| `server/…/types-internal.ts` | Modified | Added `campaignData` to `CampaignState` |
| `server/…/engine-v0-2.ts` | Modified | campaignData diffing + recomputeActorData hook in dispatch pipeline |
| `server/…/intent-processor.ts` | Modified | Added `touchedActorIds` to `ProcessedIntent` |
| `server/src/routes/ws.ts` | Modified | Sends `panel.defs` after welcome, handles `panel.defs.request` |
| `client/src/state/campaign.svelte.ts` | Modified | Added campaignData, rulesetPanels, optimisticOverlay, eventState, handlePanelDefs |
| `client/src/state/ui.svelte.ts` | Modified | Added `ruleset-panel` to `WindowId`, `toggleRulesetPanel()`, removed `initiative` from `ToolDrawerId` |
| `client/src/api/ws.ts` | Modified | Added optimistic dispatch, `handlePanelDefs()`, `campaignState.revertOptimistic()` on rejection |
| `client/src/ui/ruleset/` | New | bindings.ts, styles.ts, PanelRenderer.svelte, RulesetWindow.svelte, 10 element renderers |
| `client/src/ui/canvas/ActorPill.svelte` | Modified | Renders `PanelRenderer` for `slot: 'actor-pill'` |
| `client/src/ui/toolbar/LeftToolbar.svelte` | Modified | Renders ruleset panel icons |
| `client/src/ui/toolbar/ToolDrawer.svelte` | Modified | Renders ruleset panel drawer content |
| `client/src/ui/window/TabbedWindow.svelte` | Modified | Supports `ruleset-panel` window type |
| `client/src/ui/toolbar/drawers/InitiativeDrawer.svelte` | Deleted | Replaced by ruleset-defined panel |
| `client/src/ui/window/InitiativeModal.svelte` | Deleted | Replaced by ruleset-defined panel |

## Out of scope (explicitly deferred)

| Item | Target | Rationale |
|------|--------|-----------|
| `stack`, `image`, `input`, `slider`, `tabs`, `select`, `toggle` elements | V2 | Not needed for V1 targets; architecture accommodates them as new discriminated union members |
| `sx` CSS property whitelist | V2 | `class` escape hatch sufficient for V1 |
| campaignData key-level audience filtering | V2 | Adds complexity; V1 shares all campaignData |
| PanelDef action reference validation at load time | V2 | "Everything is moving fast" |
| Server-side reactive panels (Approach A) | V2 | Upgrade path if derived field hook proves insufficient |
| `eventState` index for O(1) lookup | V3 | O(n) on 200 events is sub-millisecond |
| `canvas` / `chart` elements | V3+ | Qualitatively different — mini-renderer subsystem |
| Ruleset-supplied Svelte components | V3+ | Requires component sandbox + compilation pipeline |
| Campaign macros (QuickJS scripts) | V3+ | Requires macro execution model design |
| Hot-reload of PanelDefs during play | V3 | Requires `ruleset.changed` event |

## Alternatives considered

### Widget catalog (Round 1 C1)
A fixed set of pre-built widgets (text, progress, list, icon-list). **Rejected:** limits ruleset authors to our imagination. Prefabs are useful but the base language must be compositional.

### Fully server-resolved panels (Round 1 C4)
All panel content computed server-side, client is pure renderer. **Rejected for data display**, **kept for campaignData**. Data display benefits from client-side binding resolution (Svelte reactivity, no round-trip). But campaign-level derived state (campaignData) is server-authoritative.

### Three concentric rings (Round 1 C3)
Ring 1 (declarative JSON), Ring 2 (ruleset Svelte components), Ring 3 (campaign macros). **Partially kept.** Rings 2 and 3 are valid concepts but deferred. Ring 1 is HearthML. The "escape hatch" concept is preserved — constrained to "see your SeatView, dispatch whatever action you want."

### Expression trees (Round 3)
JSON-serializable AST for derived field formulas that evaluates in both server (compute mode) and client (display mode). **Deferred to V2.** The 14-node expression tree is a well-bounded mini-language but unnecessary for V1 — the derived field hook solves the concrete use case with 25 lines of engine code.

### `{{path}}` string interpolation (Round 1 C1, Round 2)
Template strings like `"HP: {{actor.data.hp}}/{{actor.data.maxHp}}"` with path resolution. **Rejected.** Looks simple but inevitably grows into Handlebars (conditionals, helpers, expressions). ADR 011 déjà vu risk.

### Engine-level derived field declarations
Ruleset declares `derivedFields: { strMod: '(str - 10) // 2' }` in manifest. **Rejected.** Creates a second declaration type, requires an expression evaluator, and panels must reference declarations by name. The monolithic `recomputeActorData` hook is simpler — one function, no dependency graph.

## Consequences

- Ruleset authors now have a complete UI system — toolbar panels, floating windows, actor pill customization — all driven by declarative JSON trees.
- The hard-coded InitiativeDrawer and InitiativeModal have been removed. Initiative is now a ruleset concern.
- The binding system (discriminated unions + scope interpolation) is bounded: no path parser, no expression language, no template engine.
- Three new WS message types: `panel.defs`, `panel.defs.request`, `campaignData.updated` (implicit via GameEvent).
- Optimistic overlay enables snappy interactions (HP +/- buttons) with server-authoritative snap-back on rejection.
- Derived field computation is a single function call per dispatch, with zero new wire types or client changes.
- The `seats` field on `SeatView` for full-campaign views is a future optimization possibility (user is open to it).

## References

- [ADR 011: Engine Facade Boundary](011-engine-facade-and-dsl-reversal.md) — the decision that created the boundary this ADR fills
- [ADR 004: GameEngine Class Architecture](004-gameengine-class-architecture.md) — partially superseded
- [docs/components/ruleset-engine.md](../components/ruleset-engine.md) — engine boundary document
- [docs/components/client.md](../components/client.md) — client architecture
- [docs/shared-types.md](../shared-types.md) — canonical type definitions
- [docs/implementation-strategy.md](../implementation-strategy.md) — implementation phases
- [design-council-state.md](../../../memories/session/design-council-state.md) — session notes from the 3-round design process
