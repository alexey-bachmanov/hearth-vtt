# Ruleset Authoring Guide — HearthVTT (`docs/components/ruleset-authoring.md`)

> **Status:** Starting point. This document will evolve as the engine, HearthML, and file formats mature.
>
> This guide is **self-contained** — it includes all the types, conventions, and examples needed to write a ruleset from scratch. "Further reading" links point to design rationale, not required context.

---

## Table of contents

1. [What is a ruleset?](#what-is-a-ruleset)
2. [Quick start: a minimal ruleset](#quick-start-a-minimal-ruleset)
3. [Resolvers](#resolvers)
4. [ResolverIntent catalog](#resolverintent-catalog)
5. [Custom data](#custom-data)
6. [Derived data](#derived-data)
7. [Campaign-level data](#campaign-level-data)
8. [Data flow: dispatch to event](#data-flow-dispatch-to-event)
9. [HearthML UI panels](#hearthml-ui-panels)
10. [Multi-ruleset composition](#multi-ruleset-composition)
11. [Prompts and workflows](#prompts-and-workflows)
12. [Complete example: D&D 5e-style ruleset](#complete-example-dd-5e-style-ruleset)
13. [Reference appendix](#reference-appendix)

---

## What is a ruleset?

A ruleset is a **TypeScript module** that exports a `RulesetManifest` object. The manifest tells the engine:

- **What actions exist** — action types like `actor.takeDamage`, `attack.roll`, plus the resolver functions that handle them.
- **How to compose** — when multiple sources (baseline engine + ruleset, or ruleset + ruleset) define handlers for the same action, how to merge results.
- **What UI to show** — declarative panel definitions (HearthML) for toolbar widgets, actor pills, and floating windows.
- **How to compute derived data** — a hook that recalculates `actor.data.derived.*` fields after every mutation.

The engine loads the ruleset at campaign open time and wires it into the dispatch loop. Rulesets do **not** have direct access to the network, filesystem, DOM, or Node APIs — they run inside the engine boundary and interact with campaign state exclusively through the `ResolverApi` helpers and `ResolverIntent` return values.

### The `RulesetManifest` contract

```ts
// server/src/domain/engine/v0-2/types.ts

export interface RulesetManifest {
  /** Unique identifier for this ruleset. */
  id: string;

  /** Semver version string. */
  version: string;

  /** Map of action type → resolver binding. */
  actions: Record<string, ActionBinding>;

  /** Optional per-action-type merger for multi-resolver composition. */
  mergers?: Record<string, Merger>;

  /** Declarative panel definitions contributed by this ruleset. */
  panels?: PanelDef[];

  /** Optional hook: recompute derived fields for modified actors. */
  recomputeActorData?: (
    touchedActorIds: string[],
    api: ResolverApi,
  ) => Record<string, Record<string, unknown>>;
}
```

| Field                | Required | Purpose                                                                                                                                                                      |
| -------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                 | Yes      | Unique ruleset identifier (e.g. `'dnd-5.5-srd'`)                                                                                                                             |
| `version`            | Yes      | Semver string (e.g. `'0.1.0'`)                                                                                                                                               |
| `actions`            | Yes      | Every action your ruleset handles. Keys are `ActionType` strings; values are `ActionBinding` objects containing a resolver function.                                         |
| `mergers`            | No       | Custom merge policies for actions with multiple registered resolvers. If omitted for a composed action, the engine applies a default last-write-wins + concatenation policy. |
| `panels`             | No       | HearthML panel definitions. Transmitted to clients via the `panel.defs` WebSocket message.                                                                                   |
| `recomputeActorData` | No       | Hook called after every dispatch that modifies actor data. Returns patches shallow-merged into `actor.data`.                                                                 |

### How the engine loads rulesets

1. Baseline actions are registered first (one resolver per built-in action type).
2. Ruleset actions are appended — if a ruleset registers for an action type the baseline already handles, the ruleset's resolver is appended to the resolver list for that action.
3. Ruleset mergers are registered; a collision (two rulesets both registering a merger for the same action type) is a **hard load-time error**.
4. Panels are collected from all rulesets and sent to clients in the `panel.defs` message.

---

## Quick start: a minimal ruleset

Here is the smallest possible ruleset — it adds no actions, no UI, just declares its identity:

```ts
// my-ruleset.ts
import type { RulesetManifest } from './types.js';

export const ruleset: RulesetManifest = {
  id: 'my-first-ruleset',
  version: '0.0.1',
  actions: {},
};
```

A ruleset with one action that extends the baseline `token.move`:

```ts
import type {
  ActionBinding,
  ResolverIntent,
  ResolverResult,
  RulesetManifest,
} from './types.js';

const tokenMoveBinding: ActionBinding = {
  resolver(args, helpers): ResolverResult {
    // args includes: seatId, isGm, seatDisplayName, tokenId, position
    const { isGm, seatDisplayName, tokenId, position } = args as Record<
      string,
      unknown
    >;

    if (typeof tokenId !== 'string') {
      throw new Error('token.move requires { tokenId: string }');
    }

    const token = helpers.getToken(tokenId);
    if (!token) {
      throw new Error(`Token not found: ${tokenId}`);
    }

    // Authorization: GM bypasses; player must control the actor
    if (!isGm) {
      const actor = helpers.getActor(token.actorId);
      const seatId = args.seatId as string;
      if (actor?.seatPermissions[seatId] !== 'control') {
        throw new Error('Not authorized to move this token');
      }
    }

    const intents: ResolverIntent[] = [
      {
        kind: 'token.move',
        tokenId,
        from: token.position,
        to: position as { x: number; y: number },
      },
    ];

    return { intents };
  },
};

export const ruleset: RulesetManifest = {
  id: 'my-first-ruleset',
  version: '0.0.1',
  actions: {
    'token.move': tokenMoveBinding,
  },
};
```

---

## Resolvers

A resolver is a **pure function** that validates input, checks authorization, performs lookups via the `ResolverApi`, and returns an array of `ResolverIntent`s.

### Signature

```ts
type Resolver = (args: unknown, helpers: ResolverApi) => ResolverResult;

interface ResolverResult {
  intents: ResolverIntent[];
}
```

### The `args` object

The engine spreads the action's `payload` together with **injected seat context**:

```ts
// What the resolver receives (pseudocode):
const resolverArgs = {
  seatId: input.seatId, // string — the calling seat
  isGm: seat?.role === 'gm', // boolean
  seatDisplayName: seat?.displayName ?? input.seatId, // string
  ...input.payload, // the user's payload fields spread in
};
```

So if a user dispatches `{ actionType: 'attack.roll', payload: { targetId: 'goblin-3', weapon: 'longsword' } }`, the resolver's `args` will be:

```ts
{
  seatId: 'seat-abc',
  isGm: false,
  seatDisplayName: 'Kael',
  targetId: 'goblin-3',
  weapon: 'longsword',
}
```

### Validation and errors

Resolvers signal rejection by **throwing an Error**. The engine catches the error and returns `{ accepted: false, reason: error.message }` to the caller.

```ts
// ❌ Bad — don't return a rejected-like object
// ✅ Good — throw on invalid input
if (typeof tokenId !== 'string') {
  throw new Error('token.move requires { tokenId: string }');
}
```

A resolver that returns `{ intents: [] }` is an accepted no-op (valid, just no mutations). Use this for actions that are "acknowledged" but produce no visible change.

### Authorization pattern

```ts
const { seatId, isGm } = args as SeatContext;

// GMs bypass all authorization checks
if (!isGm) {
  const actor = helpers.getActor(targetActorId);
  if (!actor) {
    throw new Error(`Actor not found: ${targetActorId}`);
  }
  if (actor.seatPermissions[seatId] !== 'control') {
    throw new Error('Not authorized to modify this actor');
  }
}
```

`actor.seatPermissions` is a `Record<string, 'control' | 'read'>`. Players with `'control'` can modify the actor; `'read'` is view-only.

### ResolverApi helpers

```ts
export interface ResolverApi {
  // ── Entity lookups ──────────────────────────────
  getActor(actorId: string): Actor | undefined;
  getToken(tokenId: string): Token | undefined;
  getScene(sceneId: string): Scene | undefined;

  // ── Spatial ─────────────────────────────────────
  tokensInRadius(
    sceneId: string,
    x: number,
    y: number,
    radius: number,
  ): Token[];

  // ── RNG ────────────────────────────────────────
  rollDice(formula: string, actionId: string): RollDiceResult;

  // ── Campaign data ──────────────────────────────
  getCustomData(key: string): unknown;
}

type RollDiceResult =
  | { ok: true; rolls: number[]; total: number }
  | { ok: false; reason: string };
```

| Helper                                  | Returns              | Notes                                                                                                                                                                 |
| --------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getActor(id)`                          | `Actor \| undefined` | Read-only lookup. `Actor` shape: `{ id, name, seatPermissions, data }`                                                                                                |
| `getToken(id)`                          | `Token \| undefined` | Read-only lookup. `Token` shape: `{ id, actorId, sceneId, name, imageUrl, position, size, rotation?, hidden?, data }`                                                 |
| `getScene(id)`                          | `Scene \| undefined` | Read-only lookup. `Scene` shape: `{ id, name, background?, gridType, gridSize, gridScale, width, height, data }`                                                      |
| `tokensInRadius(sceneId, x, y, radius)` | `Token[]`            | **May throw until wired.** Returns tokens within `radius` pixels of `(x, y)`.                                                                                         |
| `rollDice(formula, actionId)`           | `RollDiceResult`     | Authoritative RNG. `formula` uses standard dice notation (e.g. `'2d6+3'`, `'1d20+5'`). `actionId` is provided by the engine (derived from campaign+seq+payload hash). |
| `getCustomData(key)`                    | `unknown`            | Read a campaign-level value. Writes use the `campaignData.set` intent (see Campaign-level data below).                                                                |

### Resolver templates

**Simple mutation** (validate + return one intent):

```ts
const myResolver: ActionBinding = {
  resolver(args, helpers): ResolverResult {
    // 1. Validate payload shape
    const { targetId, value } = args as {
      targetId?: unknown;
      value?: unknown;
    } & SeatContext;
    if (typeof targetId !== 'string') throw new Error('...');
    if (typeof value !== 'number') throw new Error('...');

    // 2. Look up entity
    const actor = helpers.getActor(targetId);
    if (!actor) throw new Error(`Actor not found: ${targetId}`);

    // 3. Authorize
    if (!(args as SeatContext).isGm) {
      if (actor.seatPermissions[(args as SeatContext).seatId] !== 'control') {
        throw new Error('Not authorized');
      }
    }

    // 4. Return intents
    return {
      intents: [
        {
          kind: 'actor.replaceData',
          actorId: targetId,
          data: { ...actor.data, myKey: value },
        },
      ],
    };
  },
};
```

**Dice + data mutation** (roll, then use result):

```ts
const attackResolver: ActionBinding = {
  resolver(args, helpers): ResolverResult {
    const { targetId, actionId } = args as {
      targetId: string;
      actionId: string;
    };

    const target = helpers.getActor(targetId);
    if (!target) throw new Error(`Actor not found: ${targetId}`);

    // Roll the d20
    const result = helpers.rollDice('1d20+5', actionId);
    if (!result.ok) throw new Error(result.reason);

    const intents: ResolverIntent[] = [
      {
        kind: 'chat.send',
        text: `Attack roll: ${result.total} (${result.rolls.join(', ')})`,
        displayName: (args as SeatContext).seatDisplayName,
      },
    ];

    return { intents };
  },
};
```

**Campaign-data mutation** (initiative tracker example):

```ts
const advanceTurnResolver: ActionBinding = {
  resolver(args, helpers): ResolverResult {
    const initiativeOrder =
      (helpers.getCustomData('initiativeOrder') as string[]) ?? [];
    if (initiativeOrder.length === 0)
      throw new Error('No initiative order set');

    const currentIdx = (helpers.getCustomData('currentTurnIdx') as number) ?? 0;
    const nextIdx = (currentIdx + 1) % initiativeOrder.length;
    const roundNumber = (helpers.getCustomData('roundNumber') as number) ?? 0;

    return {
      intents: [
        { kind: 'campaignData.set', key: 'currentTurnIdx', value: nextIdx },
        {
          kind: 'campaignData.set',
          key: 'roundNumber',
          value:
            currentIdx === initiativeOrder.length - 1
              ? roundNumber + 1
              : roundNumber,
        },
      ],
    };
  },
};
```

---

## ResolverIntent catalog

Resolvers return arrays of `ResolverIntent` — a discriminated union of **semantic mutations**. Each intent maps 1:1 to a state mutation + stored event + wire event.

**Key rule:** any resolver (baseline or custom) can emit any intent (baseline or custom). The intent catalog is a shared vocabulary. A ruleset-defined action can emit `chat.send`. A baseline action (overridden by a ruleset) can emit a ruleset-only intent (future). There is no gate on who emits what.

### Token intents

| Intent              | Fields                                                                                                                  | Description                                                             |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `token.move`        | `tokenId`, `from: Position`, `to: Position`                                                                             | Move a token on the active scene. Engine updates `token.position`.      |
| `token.create`      | `tokenId`, `actorId`, `sceneId`, `position: Position`, `name?`, `imageUrl?`, `hidden?`, `data: Record<string, unknown>` | Create a new token on a scene.                                          |
| `token.delete`      | `tokenId`                                                                                                               | Remove a token from a scene.                                            |
| `token.replaceData` | `tokenId`, `data: Record<string, unknown>`                                                                              | Replace the entire `token.data` blob. Use for atomic state transitions. |
| `token.linkToActor` | `tokenId`, `actorId`                                                                                                    | Change which actor a token represents.                                  |

### Actor intents

| Intent              | Fields                                                                 | Description                                                                                                                                                                       |
| ------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `actor.create`      | `actorId`, `name`, `data: Record<string, unknown>`, `seatPermissions?` | Create a new actor.                                                                                                                                                               |
| `actor.delete`      | `actorId`                                                              | Remove an actor.                                                                                                                                                                  |
| `actor.replaceData` | `actorId`, `data: Record<string, unknown>`                             | Replace the entire `actor.data` blob. **This is the primary mutation primitive for ruleset state.** The ruleset reads current data, modifies it, and writes the full replacement. |
| `actor.linkSeat`    | `actorId`, `seatId`, `permission: 'control' \| 'read'`                 | Grant or change a seat's permission on an actor.                                                                                                                                  |

### Scene intents

| Intent              | Fields                                             | Description                            |
| ------------------- | -------------------------------------------------- | -------------------------------------- |
| `scene.create`      | `sceneId`, `name`, `data: Record<string, unknown>` | Create a new scene.                    |
| `scene.delete`      | `sceneId`                                          | Remove a scene.                        |
| `scene.setActive`   | `sceneId`                                          | Set the active scene for the campaign. |
| `scene.replaceData` | `sceneId`, `data: Record<string, unknown>`         | Replace the entire `scene.data` blob.  |

### Universal intents

| Intent          | Fields                                                                       | Description                                                                 |
| --------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `chat.send`     | `text: string`, `displayName: string`                                        | Post a message to the chat log. No state mutation.                          |
| `dice.result`   | `formula: string`, `rolls: number[]`, `total: number`, `displayName: string` | Record a dice roll result. No state mutation.                               |
| `workflow.open` | `id: string`, `continuationActionType: string`, `data: unknown`              | Open a multi-step workflow. **TODO:** workflow state machine not yet wired. |

### Important: `actor.replaceData` pattern

Since `actor.data` is opaque to the engine, rule sets use `actor.replaceData` as their primary mutation primitive. The pattern is:

```ts
const actor = helpers.getActor(actorId);
if (!actor) throw new Error(`Actor not found: ${actorId}`);

const newData = { ...actor.data }; // shallow clone
newData.hp = (newData.hp as number) - damage;
newData.conditions = [...((newData.conditions as string[]) ?? []), 'prone'];

return {
  intents: [{ kind: 'actor.replaceData', actorId, data: newData }],
};
```

The engine replaces the entire `data` blob. The `recomputeActorData` hook then fires to update `derived.*` fields.

---

## Custom data

Every entity carries an opaque `data` blob that the core engine never inspects. The ruleset fully owns these schemas.

### Entity data blobs

```ts
// shared/src/entities.ts — relevant fields only
interface Actor {
  id: string;
  name: string;
  seatPermissions: Record<string, 'control' | 'read'>;
  data: Record<string, unknown>; // ← ruleset-owned
}

interface Token {
  id: string;
  actorId: string;
  sceneId: string;
  // ...position, size, etc...
  data: Record<string, unknown>; // ← ruleset-owned
}

interface Scene {
  id: string;
  name: string;
  // ...background, grid, etc...
  data: Record<string, unknown>; // ← ruleset-owned
}
```

### Convention: flat key-value

Store data as a shallow `Record<string, unknown>`. This allows the engine to shallow-merge derived field patches and keeps the shape predictable. Avoid nested objects where possible; use namespaced keys if you must nest.

```ts
// ✅ Good — flat, predictable
actor.data = {
  strength: 16,
  dexterity: 12,
  constitution: 14,
  hp: 34,
  maxHp: 34,
  conditions: ['blinded', 'prone'],
  derived: {
    ac: 15,
    initiativeMod: 1,
    strengthMod: 3,
  },
};

// ❌ Avoid — deeply nested, harder to patch
actor.data = {
  abilities: {
    strength: { score: 16, modifier: 3 },
    dexterity: { score: 12, modifier: 1 },
  },
};
```

### Convention: `actor.data.derived.*`

The `derived` key within `actor.data` is reserved for **computed values** (see next section). Rulesets should never set `derived.*` fields directly in resolvers — they should be set by the `recomputeActorData` hook only. This namespacing ensures future JSON Patch compatibility and bulk recompute safety.

### Validation

There is no Zod schema for `actor.data` at the engine level. Validate in your resolvers:

```ts
const hp = actor.data.hp;
if (typeof hp !== 'number') {
  throw new Error(`Actor ${actorId} has invalid hp: expected number`);
}
```

---

## Derived data

The `recomputeActorData` hook recalculates computed fields after every mutation.

### When it fires

After **all intents** from a dispatch are processed (state mutations applied), but **before events are broadcast** and **before the dispatch result is returned**. The hook receives the set of actor IDs whose `data` was modified by the dispatch.

### Signature

```ts
recomputeActorData?: (
  touchedActorIds: string[],
  api: ResolverApi,
) => Record<string, Record<string, unknown>>;
```

- **Input:** list of actor IDs whose `.data` was replaced or whose actor was created during this dispatch.
- **Output:** a map of `actorId → { key: value }` patches. The engine shallow-merges each patch into `actor.data`.
- **Errors:** if the hook throws, the **entire dispatch is rolled back** — no partial state is persisted.

### Convention

Store derived values under `actor.data.derived.*`. This namespace is reserved for computed fields.

```ts
recomputeActorData(touchedActorIds, api) {
  const patches: Record<string, Record<string, unknown>> = {};

  for (const actorId of touchedActorIds) {
    const actor = api.getActor(actorId);
    if (!actor) continue;

    const dex = (actor.data.dexterity as number) ?? 10;
    const armorBonus = (actor.data.armorBonus as number) ?? 0;
    const shieldBonus = (actor.data.shieldBonus as number) ?? 0;

    patches[actorId] = {
      derived: {
        ac: 10 + Math.floor((dex - 10) / 2) + armorBonus + shieldBonus,
        initiativeMod: Math.floor((dex - 10) / 2),
      },
    };
  }

  return patches;
}
```

### Derived field events

When the hook produces patches, the engine stores and broadcasts `actor.dataReplaced` events for each modified actor. The client receives these and updates its local `actor.data`.

---

## Campaign-level data

Campaign-scoped state (initiative order, round number, party resources, story flags) lives in `campaignData` — a `Record<string, unknown>` on both the server's `CampaignState` and the client's `CampaignState` store.

### Writing: `campaignData.set` intent

Resolvers write campaign data by returning `campaignData.set` intents — there is no write-capable helper on `ResolverApi`:

```ts
return {
  intents: [
    {
      kind: 'campaignData.set',
      key: 'initiativeOrder',
      value: ['kael-1', 'merric-2', 'goblin-3'],
    },
    { kind: 'campaignData.set', key: 'currentTurnIdx', value: 0 },
    { kind: 'campaignData.set', key: 'roundNumber', value: 1 },
  ],
};
```

Each intent produces one `campaignData.updated` stored event + wire broadcast:

```ts
// Per-intent event (conceptual)
{
  type: 'campaignData.updated',
  data: { key: 'initiativeOrder', value: ['kael-1', 'merric-2', 'goblin-3'] },
}
```

### Reading: `api.getCustomData()`

```ts
const order = helpers.getCustomData('initiativeOrder') as string[] | undefined;
```

### Client-side: `campaignData` binding

HearthML panels bind to campaign data via the `campaignData` binding kind:

```ts
{ kind: 'campaignData', key: 'currentTurnIdx' }
```

The client's `CampaignState.getCampaignData(key)` checks the optimistic overlay first (for pending mutations), then the authoritative `campaignData` blob.

### Optimistic overlay

The client provides an optimistic overlay for fast local UI updates:

```ts
// Client-side (in a Svelte component or action handler)
campaignState.applyOptimistic({ currentTurnIdx: 3 });
ws.dispatch('initiative.advance', {}, true); // optimistic=true

// On server accept: overlay auto-clears when campaignData.updated arrives
// On server reject: campaignState.revertOptimistic(['currentTurnIdx']);
```

---

## Data flow: dispatch to event

Understanding when your code runs is critical for correct resolvers. Here is the full dispatch loop:

```
1. Client sends dispatch { actionType: 'attack.roll', payload: {...} }
   ↓
2. Engine enqueues dispatch (FIFO serialization)
   ↓
3. Engine looks up resolver(s) for actionType
   ↓
4. Engine prepares resolverArgs (spread payload + inject seatId/isGm/seatDisplayName)
   ↓
5. Engine calls each resolver(args, resolverApi) → collects ResolverIntent[][]
   ↓
6. Engine merges intent arrays (registered merger or default LWW+concat)
   ↓
7. For each merged intent:
   a. processIntent() → stateMutation() applied in-memory
   b. Event appended to Storage (SQLite)
   c. Event broadcast to subscribed seats (audience-filtered)
   ↓
8. If recomputeActorData hook exists and actors were touched:
   a. Hook runs: recomputeActorData(touchedActorIds, api)
   b. Patches shallow-merged into actor.data
   c. actor.dataReplaced events stored + broadcast
   ↓
9. Engine returns { accepted: true, seq, actionId } to caller
```

Key implications for ruleset authors:

- **Resolvers run synchronously inside step 5.** You get the state as it was when the dispatch started. If two dispatches touch the same actor, they are serialized by the FIFO queue.
- **`campaignData.set` intents are processed like any other intent in step 7.** They produce `campaignData.updated` stored events + wire broadcasts, one per key.
- **`recomputeActorData` runs in step 9, after all intents.** You can safely read any actor's data (including actors not in `touchedActorIds`) via `api.getActor()`.
- **A hook exception in step 9 rolls back the entire dispatch.** All state mutations from step 7a are discarded.

---

## HearthML UI panels

HearthML is a **declarative, JSON-serializable component tree** for ruleset-defined UI. Rulesets define panels in TypeScript (using types from `@hearth-vtt/shared`); the server transmits them to clients in a one-time `panel.defs` WebSocket message.

### PanelDef structure

```ts
interface PanelDef {
  id: string; // Unique panel identifier
  title: string; // Display title
  icon?: string; // Optional icon name (for toolbar slot)
  slot: PanelSlot; // Where the panel appears
  content: PanelNode; // The component tree
  replaces?: string; // Optional: ID of a built-in panel to replace
}

type PanelSlot = 'toolbar' | 'actor-pill' | 'window';
```

| Slot         | Behavior                                                                                                   |
| ------------ | ---------------------------------------------------------------------------------------------------------- |
| `toolbar`    | Renders an icon in the left toolbar. Clicking opens a drawer containing the panel content.                 |
| `actor-pill` | Rendered inside the actor pill dropdown. Receives `{ scope: { actorId } }` — use `${actorId}` in bindings. |
| `window`     | Floating `TabbedWindow`. Multiple window panels are tabbed together.                                       |

### The 10 primitives

#### Leaf nodes

**`text`** — Display a bound value with optional formatting.

```ts
interface TextNode {
  kind: 'text';
  binding: Binding;
  format?: 'none' | 'plusMinus' | 'fraction' | 'diceFormula' | 'diceWithMods';
  formatArgs?: Record<string, string | number | boolean>;
  style?: StyleTokens;
  sx?: SxProps;
}
```

Format options:
| Format | Example input | Rendered |
|---|---|---|
| `none` | `42` | `42` |
| `plusMinus` | `3` | `+3` |
| `fraction` | `{ numerator: 34, denominator: 50 }` | `34 / 50` |
| `diceFormula` | `'2d6+3'` | `2d6+3` (styled dice icon) |
| `diceWithMods` | `{ formula: '1d20', modifier: 5 }` | `1d20 + 5` |

---

**`progress`** — A progress bar.

```ts
interface ProgressNode {
  kind: 'progress';
  value: Binding; // Current value
  max: Binding; // Maximum value
  style?: StyleTokens;
  sx?: SxProps;
}
```

---

**`button`** — Dispatches an action on click.

```ts
interface ButtonNode {
  kind: 'button';
  label: string;
  action: { actionType: string; payload: Record<string, unknown> };
  disabledWhen?: Binding; // Truthy → button disabled
  variant?: 'primary' | 'secondary' | 'danger';
  style?: StyleTokens;
  sx?: SxProps;
}
```

---

**`icon`** — Render a named icon.

```ts
interface IconNode {
  kind: 'icon';
  name: string;
  style?: StyleTokens;
  sx?: SxProps;
}
```

---

**`divider`** — Horizontal rule.

```ts
interface DividerNode {
  kind: 'divider';
  style?: StyleTokens;
  sx?: SxProps;
}
```

#### Container nodes (recursive)

**`hbox`** — Horizontal flex row.

```ts
interface HBoxNode {
  kind: 'hbox';
  children: PanelNode[];
  style?: StyleTokens;
  sx?: SxProps;
}
```

**`vbox`** — Vertical flex column.

```ts
interface VBoxNode {
  kind: 'vbox';
  children: PanelNode[];
  style?: StyleTokens;
  sx?: SxProps;
}
```

**`grid`** — CSS Grid layout.

```ts
interface GridNode {
  kind: 'grid';
  columns: number; // 1–12
  children: PanelNode[];
  style?: StyleTokens;
  sx?: SxProps;
}
```

**`forEach`** — Iterate over a binding that resolves to an array.

```ts
interface ForEachNode {
  kind: 'forEach';
  source: Binding; // Must resolve to an iterable
  as: string; // Variable name for each item (e.g. 'item')
  children: PanelNode[];
  style?: StyleTokens;
  sx?: SxProps;
}
```

**`when`** — Conditionally render children.

```ts
interface WhenNode {
  kind: 'when';
  condition: Binding; // Must resolve to truthy/falsy
  children: PanelNode[];
  style?: StyleTokens;
  sx?: SxProps;
}
```

### Bindings

Bindings are **discriminated unions** — not string paths. Four kinds exist:

```ts
type Binding =
  | { kind: 'actor.data'; actorId: string; key: string }
  | { kind: 'campaignData'; key: string }
  | { kind: 'eventState'; eventType: string; path: string }
  | { kind: 'literal'; value: string | number | boolean };
```

#### `actor.data`

Reads a top-level key from an actor's `data` blob. The `actorId` field supports `${varName}` template interpolation for scope variables:

```ts
// Static actor ID
{ kind: 'actor.data', actorId: 'kael-1', key: 'hp' }
// → reads campaignState.actors.get('kael-1')?.data?.hp

// Dynamic: inside an actor-pill panel, ${actorId} resolves from scope
{ kind: 'actor.data', actorId: '${actorId}', key: 'derived.ac' }
// → reads campaignState.actors.get(scope.actorId)?.data?.derived?.ac
```

**Template interpolation is bounded:** only `${varName}` is supported (single regex, no recursion). This is NOT a template language.

#### `campaignData`

Reads a key from the campaign-level data blob:

```ts
{ kind: 'campaignData', key: 'currentTurnIdx' }
// → reads campaignState.getCampaignData('currentTurnIdx')
```

Checks the optimistic overlay before authoritative data.

#### `eventState`

Reads from the most recent `GameEvent` of a given type via dotted-path traversal:

```ts
{ kind: 'eventState', eventType: 'dice.rolled', path: 'data.total' }
// → scans sharedGameEvents in reverse for type 'dice.rolled', returns event.data.total
```

The client maintains a buffer of recent `GameEvent` objects (capped at 200). `eventState` bindings are Svelte 5 `$state`-reactive — they automatically re-render when a matching event arrives.

#### `literal`

A hardcoded value:

```ts
{ kind: 'literal', value: 42 }
{ kind: 'literal', value: 'Kael the Bold' }
{ kind: 'literal', value: true }
```

### Style tokens

A constrained palette mapped to CSS custom properties:

```ts
interface StyleTokens {
  padding?: 'none' | 'xs' | 'sm' | 'md' | 'lg';
  gap?: 'none' | 'xs' | 'sm' | 'md' | 'lg';
  flex?: number;
  textVariant?: 'body' | 'caption' | 'h3' | 'h4';
  color?: 'default' | 'muted' | 'accent' | 'danger' | 'success' | 'warning';
  bg?: 'none' | 'surface' | 'elevated';
  width?: number;
  height?: number;
  alignItems?: 'start' | 'center' | 'end' | 'stretch';
  justifyContent?: 'start' | 'center' | 'end' | 'between';
}
```

All tokens are optional. Omitted tokens inherit defaults from the parent or the theme.

#### The `sx.class` escape hatch

```ts
interface SxProps {
  class?: string;
}
```

References a CSS class from a ruleset-supplied stylesheet. No raw CSS properties inline. Full `sx` (whitelisted CSS properties) is deferred to V2.

### Composite UI examples

#### Example 1: Initiative tracker (toolbar panel)

```ts
import type { PanelDef } from '@hearth-vtt/shared';

export const initiativePanel: PanelDef = {
  id: 'initiative-tracker',
  title: 'Initiative',
  icon: 'swords',
  slot: 'toolbar',
  content: {
    kind: 'vbox',
    style: { gap: 'sm', padding: 'md' },
    children: [
      {
        kind: 'text',
        binding: { kind: 'literal', value: 'Round' },
        style: { textVariant: 'caption', color: 'muted' },
      },
      {
        kind: 'text',
        binding: { kind: 'campaignData', key: 'roundNumber' },
        style: { textVariant: 'h3' },
      },
      { kind: 'divider' },
      {
        kind: 'forEach',
        source: { kind: 'campaignData', key: 'initiativeOrder' },
        as: 'actorId',
        children: [
          {
            kind: 'hbox',
            style: { gap: 'sm', padding: 'xs' },
            children: [
              {
                kind: 'text',
                binding: {
                  kind: 'actor.data',
                  actorId: '${actorId}',
                  key: 'name',
                },
                style: { flex: 1 },
              },
              {
                kind: 'text',
                binding: {
                  kind: 'actor.data',
                  actorId: '${actorId}',
                  key: 'initiative',
                },
                style: { color: 'muted' },
              },
            ],
          },
        ],
      },
      { kind: 'divider' },
      {
        kind: 'button',
        label: 'Next Turn',
        variant: 'primary',
        action: { actionType: 'initiative.advance', payload: {} },
        style: { width: 100 },
      },
    ],
  },
};
```

#### Example 2: Actor pill — HP + attack button

```ts
import type { PanelDef } from '@hearth-vtt/shared';

export const actorPillPanel: PanelDef = {
  id: 'actor-stats',
  title: 'Stats',
  slot: 'actor-pill',
  content: {
    kind: 'vbox',
    style: { gap: 'sm', padding: 'md' },
    children: [
      {
        kind: 'text',
        binding: { kind: 'actor.data', actorId: '${actorId}', key: 'name' },
        style: { textVariant: 'h4' },
      },
      {
        kind: 'progress',
        value: { kind: 'actor.data', actorId: '${actorId}', key: 'hp' },
        max: { kind: 'actor.data', actorId: '${actorId}', key: 'maxHp' },
        style: { width: 200 },
      },
      {
        kind: 'hbox',
        style: { gap: 'sm' },
        children: [
          {
            kind: 'text',
            binding: { kind: 'literal', value: 'AC' },
            style: { color: 'muted', textVariant: 'caption' },
          },
          {
            kind: 'text',
            binding: {
              kind: 'actor.data',
              actorId: '${actorId}',
              key: 'derived.ac',
            },
            style: { textVariant: 'h3' },
          },
        ],
      },
      { kind: 'divider' },
      {
        kind: 'button',
        label: 'Attack',
        variant: 'primary',
        action: {
          actionType: 'attack.roll',
          payload: { attackerId: '${actorId}' },
        },
      },
    ],
  },
};
```

#### Example 3: Party status window

```ts
import type { PanelDef } from '@hearth-vtt/shared';

export const partyStatusPanel: PanelDef = {
  id: 'party-status',
  title: 'Party',
  icon: 'users',
  slot: 'window',
  content: {
    kind: 'vbox',
    style: { gap: 'sm', padding: 'md' },
    children: [
      {
        kind: 'text',
        binding: { kind: 'literal', value: 'Party Status' },
        style: { textVariant: 'h3' },
      },
      { kind: 'divider' },
      {
        kind: 'forEach',
        source: { kind: 'campaignData', key: 'partyActorIds' },
        as: 'actorId',
        children: [
          {
            kind: 'hbox',
            style: { gap: 'sm', padding: 'xs', alignItems: 'center' },
            children: [
              {
                kind: 'text',
                binding: {
                  kind: 'actor.data',
                  actorId: '${actorId}',
                  key: 'name',
                },
                style: { flex: 1 },
              },
              {
                kind: 'progress',
                value: { kind: 'actor.data', actorId: '${actorId}', key: 'hp' },
                max: {
                  kind: 'actor.data',
                  actorId: '${actorId}',
                  key: 'maxHp',
                },
                style: { width: 100, height: 12 },
              },
              {
                kind: 'when',
                condition: {
                  kind: 'actor.data',
                  actorId: '${actorId}',
                  key: 'conditions',
                },
                children: [
                  {
                    kind: 'text',
                    binding: {
                      kind: 'actor.data',
                      actorId: '${actorId}',
                      key: 'conditions',
                    },
                    style: { color: 'danger', textVariant: 'caption' },
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
};
```

---

## Multi-ruleset composition

When multiple sources register resolvers for the same action type, the engine collects all intent arrays and merges them.

### Default behavior: LWW + concat

- **Same-kind + same-target collisions** (e.g. two `token.move` intents for the same `tokenId`): **last write wins** — later intent replaces earlier.
- **All other intents:** concatenated in registration order (baseline first, then rulesets in declaration order).

### Custom mergers

Provide a `Merger` function in the manifest:

```ts
type Merger = (results: ResolverIntent[][]) => ResolverIntent[];

// Example: only keep the first resolver's intents, ignore the rest
const firstWinsMerger: Merger = (results) => results[0] ?? [];

export const ruleset: RulesetManifest = {
  id: 'my-ruleset',
  version: '0.1.0',
  actions: {
    /* ... */
  },
  mergers: {
    'token.move': firstWinsMerger,
  },
};
```

### Merger collision

If two rulesets both register a merger for the same action type, the engine throws at **load time**:

```
Merger collision for action "token.move": two rulesets both register a merger.
Remove one or provide a custom combined merger.
```

### No-merger warning

If an action has multiple resolvers but no registered merger, the engine logs a console warning and applies the default LWW+concat policy. This is safe but noisy — register a merger to silence it.

---

## Prompts and workflows

> **TODO:** The `Prompt` type, `PromptAction`, and `workflow.open` intent are defined, but the engine does **not yet wire prompt/workflow creation from resolver results**. The creation mechanism (how a resolver says "show this prompt to these seats and wait for a response") is the next implementation challenge. This section documents the _intended_ data shapes; the plumbing is tracked in the project todo.

### Prompt structure

```ts
interface Prompt {
  id: string; // Unique prompt identifier
  campaignId: string;
  audience: 'public' | 'gm' | 'blind' | 'private';
  kind: 'ephemeral' | 'blocking' | 'inline';
  title: string; // Short heading
  body?: string; // Optional markdown body
  expiresAt?: string; // ISO 8601 auto-resolve timestamp
  workflowId?: string; // If part of a multi-step workflow
  actions: PromptAction[]; // Buttons to show
  inputSchema?: unknown; // JSON Schema for freeform input
}

interface PromptAction {
  label: string;
  dispatch: {
    actionType: string;
    payload: unknown;
  };
  style?: 'primary' | 'secondary' | 'danger';
}
```

Prompts appear in `SeatView.activePrompts` and are rendered by the client's notification system.

### Workflow intent

```ts
// Conceptual — not yet wired
{
  kind: 'workflow.open',
  id: 'workflow-fireball-001',
  continuationActionType: 'spell.fireball.save',
  data: { spellId: 'fireball', casterId: 'merric-2', targetIds: ['goblin-1', 'goblin-2'] },
}
```

The workflow state machine (pause/resume across user input) is deferred to the engine-interior design pass per ADR 011.

---

## Complete example: D&D 5e-style ruleset

This example demonstrates a realistic ruleset covering stats, HP, attacks, derived stats, and an initiative tracker panel.

```ts
// dnd-ruleset.ts
import type {
  ActionBinding,
  Merger,
  ResolverIntent,
  ResolverResult,
  RulesetManifest,
} from './types.js';
import { mergeIntents } from './intent-processor.js';

// ─── Seat context (injected by engine) ─────────────────────────────────────

interface SeatContext {
  seatId: string;
  isGm: boolean;
  seatDisplayName: string;
}

// ─── Merger ────────────────────────────────────────────────────────────────

export const lwwMerger: Merger = mergeIntents;

// ─── actor.takeDamage resolver ─────────────────────────────────────────────

const takeDamageBinding: ActionBinding = {
  resolver(args, helpers): ResolverResult {
    const { seatId, isGm, targetId, amount } = args as {
      targetId?: unknown;
      amount?: unknown;
    } & SeatContext;

    if (typeof targetId !== 'string') {
      throw new Error('actor.takeDamage requires { targetId: string }');
    }
    if (typeof amount !== 'number' || amount < 0) {
      throw new Error('actor.takeDamage requires { amount: number >= 0 }');
    }

    const actor = helpers.getActor(targetId);
    if (!actor) throw new Error(`Actor not found: ${targetId}`);

    if (!isGm && actor.seatPermissions[seatId] !== 'control') {
      throw new Error('Not authorized to modify this actor');
    }

    const currentHp = (actor.data.hp as number) ?? 0;
    const newHp = Math.max(0, currentHp - amount);

    const intents: ResolverIntent[] = [
      {
        kind: 'actor.replaceData',
        actorId: targetId,
        data: { ...actor.data, hp: newHp },
      },
      {
        kind: 'chat.send',
        text: `${actor.name} takes ${amount} damage (HP: ${newHp})`,
        displayName: seatDisplayName,
      },
    ];

    if (newHp <= 0) {
      intents.push({
        kind: 'chat.send',
        text: `${actor.name} is down!`,
        displayName: 'System',
      });
    }

    return { intents };
  },
};

// ─── attack.roll resolver ──────────────────────────────────────────────────

const attackRollBinding: ActionBinding = {
  resolver(args, helpers): ResolverResult {
    const { seatId, isGm, seatDisplayName, attackerId, targetId, weaponId } =
      args as {
        attackerId?: unknown;
        targetId?: unknown;
        weaponId?: unknown;
        actionId?: string;
      } & SeatContext & { actionId?: string };

    if (typeof attackerId !== 'string') {
      throw new Error('attack.roll requires { attackerId: string }');
    }
    if (typeof targetId !== 'string') {
      throw new Error('attack.roll requires { targetId: string }');
    }

    const attacker = helpers.getActor(attackerId);
    if (!attacker) throw new Error(`Attacker not found: ${attackerId}`);

    const target = helpers.getActor(targetId);
    if (!target) throw new Error(`Target not found: ${targetId}`);

    if (!isGm && attacker.seatPermissions[seatId] !== 'control') {
      throw new Error('Not authorized to attack with this actor');
    }

    // Determine attack modifier from derived data
    const attackMod =
      (attacker.data.derived as Record<string, unknown> | undefined)
        ?.attackMod ?? 0;

    // Roll d20
    const actionId = (args as { actionId?: string }).actionId ?? 'fallback';
    const d20Result = helpers.rollDice('1d20', actionId);
    if (!d20Result.ok) throw new Error(d20Result.reason);

    const total = d20Result.total + (attackMod as number);
    const targetAc =
      (target.data.derived as Record<string, unknown> | undefined)?.ac ?? 10;

    const intents: ResolverIntent[] = [];

    if (total >= (targetAc as number)) {
      // Hit! Roll damage.
      // Determine damage dice from weapon (simplified: default to 1d8+STR)
      const strMod =
        (attacker.data.derived as Record<string, unknown> | undefined)
          ?.strengthMod ?? 0;
      const dmgResult = helpers.rollDice(`1d8+${strMod}`, actionId + '_damage');
      if (!dmgResult.ok) throw new Error(dmgResult.reason);

      const currentHp = (target.data.hp as number) ?? 0;
      const newHp = Math.max(0, currentHp - dmgResult.total);

      intents.push(
        {
          kind: 'chat.send',
          text: `${attacker.name} hits ${target.name}! (${total} vs AC ${targetAc}) — ${dmgResult.total} damage`,
          displayName: seatDisplayName,
        },
        {
          kind: 'actor.replaceData',
          actorId: targetId,
          data: { ...target.data, hp: newHp },
        },
      );

      if (newHp <= 0) {
        intents.push({
          kind: 'chat.send',
          text: `${target.name} is down!`,
          displayName: 'System',
        });
      }
    } else {
      intents.push({
        kind: 'chat.send',
        text: `${attacker.name} misses ${target.name} (${total} vs AC ${targetAc})`,
        displayName: seatDisplayName,
      });
    }

    return { intents };
  },
};

// ─── initiative.roll resolver ──────────────────────────────────────────────

const initiativeRollBinding: ActionBinding = {
  resolver(args, helpers): ResolverResult {
    const { isGm, seatDisplayName, actorIds } = args as {
      actorIds?: unknown;
      actionId?: string;
    } & SeatContext & { actionId?: string };

    if (!isGm) throw new Error('Only GMs can roll initiative');

    if (!Array.isArray(actorIds) || actorIds.length === 0) {
      throw new Error('initiative.roll requires { actorIds: string[] }');
    }

    const actionId = (args as { actionId?: string }).actionId ?? 'fallback';

    const entries: { actorId: string; roll: number; dexMod: number }[] = [];

    for (const actorId of actorIds as string[]) {
      const actor = helpers.getActor(actorId);
      if (!actor) {
        throw new Error(`Actor not found: ${actorId}`);
      }

      const dexMod =
        (actor.data.derived as Record<string, unknown> | undefined)
          ?.initiativeMod ?? 0;

      const result = helpers.rollDice(
        `1d20+${dexMod}`,
        actionId + '_' + actorId,
      );
      if (!result.ok) throw new Error(result.reason);

      entries.push({
        actorId,
        roll: result.total,
        dexMod: dexMod as number,
      });
    }

    // Sort by roll descending
    entries.sort((a, b) => b.roll - a.roll);

    const order = entries.map((e) => e.actorId);

    const orderText = entries
      .map((e, i) => {
        const actor = helpers.getActor(e.actorId);
        return `${i + 1}. ${actor?.name ?? e.actorId} (${e.roll})`;
      })
      .join(', ');

    return {
      intents: [
        {
          kind: 'campaignData.set',
          key: 'initiativeOrder',
          value: order,
        },
        { kind: 'campaignData.set', key: 'currentTurnIdx', value: 0 },
        { kind: 'campaignData.set', key: 'roundNumber', value: 1 },
        {
          kind: 'chat.send',
          text: `Initiative: ${orderText}`,
          displayName: seatDisplayName,
        },
      ],
    };
  },
};

// ─── initiative.advance resolver ───────────────────────────────────────────

const advanceTurnBinding: ActionBinding = {
  resolver(args, helpers): ResolverResult {
    const { isGm } = args as SeatContext;
    if (!isGm) throw new Error('Only GMs can advance turns');

    const order = helpers.getCustomData('initiativeOrder') as
      | string[]
      | undefined;
    if (!order || order.length === 0) {
      throw new Error('No initiative order set');
    }

    const currentIdx = (helpers.getCustomData('currentTurnIdx') as number) ?? 0;
    const nextIdx = (currentIdx + 1) % order.length;

    const intents: ResolverIntent[] = [
      { kind: 'campaignData.set', key: 'currentTurnIdx', value: nextIdx },
    ];

    if (nextIdx === 0) {
      const round = ((helpers.getCustomData('roundNumber') as number) ?? 0) + 1;
      intents.push({
        kind: 'campaignData.set',
        key: 'roundNumber',
        value: round,
      });
    }

    return { intents };
  },
};

// ─── Derived field hook ────────────────────────────────────────────────────

function recomputeActorData(
  touchedActorIds: string[],
  api: import('./types.js').ResolverApi,
): Record<string, Record<string, unknown>> {
  const patches: Record<string, Record<string, unknown>> = {};

  for (const actorId of touchedActorIds) {
    const actor = api.getActor(actorId);
    if (!actor) continue;

    const str = (actor.data.strength as number) ?? 10;
    const dex = (actor.data.dexterity as number) ?? 10;
    const con = (actor.data.constitution as number) ?? 10;
    const armorBonus = (actor.data.armorBonus as number) ?? 0;
    const shieldBonus = (actor.data.shieldBonus as number) ?? 0;
    const proficiency = (actor.data.proficiencyBonus as number) ?? 2;

    const strMod = Math.floor((str - 10) / 2);
    const dexMod = Math.floor((dex - 10) / 2);
    const conMod = Math.floor((con - 10) / 2);

    patches[actorId] = {
      derived: {
        ac: 10 + dexMod + armorBonus + shieldBonus,
        initiativeMod: dexMod,
        strengthMod: strMod,
        dexterityMod: dexMod,
        constitutionMod: conMod,
        attackMod: strMod + proficiency,
      },
    };
  }

  return patches;
}

// ─── HearthML panels ───────────────────────────────────────────────────────

import type { PanelDef } from '@hearth-vtt/shared';

const initiativePanel: PanelDef = {
  id: 'dnd-initiative',
  title: 'Initiative',
  icon: 'swords',
  slot: 'toolbar',
  content: {
    kind: 'vbox',
    style: { gap: 'sm', padding: 'md' },
    children: [
      {
        kind: 'hbox',
        style: { gap: 'sm', alignItems: 'center' },
        children: [
          {
            kind: 'text',
            binding: { kind: 'literal', value: 'Round' },
            style: { textVariant: 'caption', color: 'muted' },
          },
          {
            kind: 'text',
            binding: { kind: 'campaignData', key: 'roundNumber' },
            style: { textVariant: 'h3' },
          },
        ],
      },
      { kind: 'divider' },
      {
        kind: 'forEach',
        source: { kind: 'campaignData', key: 'initiativeOrder' },
        as: 'actorId',
        children: [
          {
            kind: 'hbox',
            style: { gap: 'sm', padding: 'xs', alignItems: 'center' },
            children: [
              {
                kind: 'text',
                binding: {
                  kind: 'actor.data',
                  actorId: '${actorId}',
                  key: 'name',
                },
                style: { flex: 1 },
              },
              {
                kind: 'progress',
                value: {
                  kind: 'actor.data',
                  actorId: '${actorId}',
                  key: 'hp',
                },
                max: {
                  kind: 'actor.data',
                  actorId: '${actorId}',
                  key: 'maxHp',
                },
                style: { width: 80, height: 10 },
              },
            ],
          },
        ],
      },
      { kind: 'divider' },
      {
        kind: 'button',
        label: 'Next Turn',
        variant: 'primary',
        action: { actionType: 'initiative.advance', payload: {} },
        style: { width: 100 },
      },
    ],
  },
};

const actorPillPanel: PanelDef = {
  id: 'dnd-actor-pill',
  title: 'Stats',
  slot: 'actor-pill',
  content: {
    kind: 'vbox',
    style: { gap: 'sm', padding: 'md' },
    children: [
      {
        kind: 'text',
        binding: {
          kind: 'actor.data',
          actorId: '${actorId}',
          key: 'name',
        },
        style: { textVariant: 'h4' },
      },
      {
        kind: 'progress',
        value: {
          kind: 'actor.data',
          actorId: '${actorId}',
          key: 'hp',
        },
        max: {
          kind: 'actor.data',
          actorId: '${actorId}',
          key: 'maxHp',
        },
        style: { width: 200 },
      },
      {
        kind: 'hbox',
        style: { gap: 'md' },
        children: [
          {
            kind: 'hbox',
            style: { gap: 'xs', alignItems: 'center' },
            children: [
              {
                kind: 'text',
                binding: { kind: 'literal', value: 'AC' },
                style: { color: 'muted', textVariant: 'caption' },
              },
              {
                kind: 'text',
                binding: {
                  kind: 'actor.data',
                  actorId: '${actorId}',
                  key: 'derived.ac',
                },
                style: { textVariant: 'h3' },
              },
            ],
          },
          {
            kind: 'hbox',
            style: { gap: 'xs', alignItems: 'center' },
            children: [
              {
                kind: 'text',
                binding: { kind: 'literal', value: 'Hit' },
                style: { color: 'muted', textVariant: 'caption' },
              },
              {
                kind: 'text',
                binding: {
                  kind: 'actor.data',
                  actorId: '${actorId}',
                  key: 'derived.attackMod',
                },
                format: 'plusMinus',
                style: { textVariant: 'h3' },
              },
            ],
          },
        ],
      },
      { kind: 'divider' },
      {
        kind: 'button',
        label: 'Attack',
        variant: 'primary',
        action: {
          actionType: 'attack.roll',
          payload: { attackerId: '${actorId}' },
        },
      },
    ],
  },
};

// ─── Manifest ──────────────────────────────────────────────────────────────

export const ruleset: RulesetManifest = {
  id: 'dnd-5e-example',
  version: '0.1.0',
  actions: {
    'actor.takeDamage': takeDamageBinding,
    'attack.roll': attackRollBinding,
    'initiative.roll': initiativeRollBinding,
    'initiative.advance': advanceTurnBinding,
  },
  mergers: {
    'actor.takeDamage': lwwMerger,
    'attack.roll': lwwMerger,
    'initiative.roll': lwwMerger,
    'initiative.advance': lwwMerger,
  },
  panels: [initiativePanel, actorPillPanel],
  recomputeActorData,
};
```

---

## Reference appendix

### All ResolverIntents

| `kind`              | Key fields                                                                           | Touches                 |
| ------------------- | ------------------------------------------------------------------------------------ | ----------------------- |
| `token.move`        | `tokenId`, `from`, `to`                                                              | `token.position`        |
| `token.create`      | `tokenId`, `actorId`, `sceneId`, `position`, `data`, `name?`, `imageUrl?`, `hidden?` | new token               |
| `token.delete`      | `tokenId`                                                                            | removes token           |
| `token.replaceData` | `tokenId`, `data`                                                                    | `token.data`            |
| `token.linkToActor` | `tokenId`, `actorId`                                                                 | `token.actorId`         |
| `actor.create`      | `actorId`, `name`, `data`, `seatPermissions?`                                        | new actor               |
| `actor.delete`      | `actorId`                                                                            | removes actor           |
| `actor.replaceData` | `actorId`, `data`                                                                    | `actor.data`            |
| `actor.linkSeat`    | `actorId`, `seatId`, `permission`                                                    | `actor.seatPermissions` |
| `scene.create`      | `sceneId`, `name`, `data`                                                            | new scene               |
| `scene.delete`      | `sceneId`                                                                            | removes scene           |
| `scene.setActive`   | `sceneId`                                                                            | active scene            |
| `scene.replaceData` | `sceneId`, `data`                                                                    | `scene.data`            |
| `chat.send`         | `text`, `displayName`                                                                | none (event only)       |
| `dice.result`       | `formula`, `rolls`, `total`, `displayName`                                           | none (event only)       |
| `workflow.open`     | `id`, `continuationActionType`, `data`                                               | workflow state (TODO)   |

### All binding kinds

| `kind`         | Shape                                                     | Resolves from                                                             |
| -------------- | --------------------------------------------------------- | ------------------------------------------------------------------------- |
| `actor.data`   | `{ kind: 'actor.data', actorId: string, key: string }`    | `campaignState.actors.get(actorId)?.data?.[key]`                          |
| `campaignData` | `{ kind: 'campaignData', key: string }`                   | `campaignState.getCampaignData(key)` (checks optimistic overlay first)    |
| `eventState`   | `{ kind: 'eventState', eventType: string, path: string }` | Reverse-scans `sharedGameEvents` for `eventType`, then dotted-path access |
| `literal`      | `{ kind: 'literal', value: string \| number \| boolean }` | The value itself                                                          |

### All PanelNode kinds

| `kind`     | Type      | Children? | Key props                                      |
| ---------- | --------- | --------- | ---------------------------------------------- |
| `text`     | Leaf      | No        | `binding`, `format?`, `formatArgs?`            |
| `progress` | Leaf      | No        | `value`, `max`                                 |
| `button`   | Leaf      | No        | `label`, `action`, `disabledWhen?`, `variant?` |
| `icon`     | Leaf      | No        | `name`                                         |
| `divider`  | Leaf      | No        | —                                              |
| `hbox`     | Container | Yes       | `children`                                     |
| `vbox`     | Container | Yes       | `children`                                     |
| `grid`     | Container | Yes       | `columns`, `children`                          |
| `forEach`  | Container | Yes       | `source`, `as`, `children`                     |
| `when`     | Container | Yes       | `condition`, `children`                        |

### Style tokens (full palette)

| Token            | Values                                                                   | CSS mapping                |
| ---------------- | ------------------------------------------------------------------------ | -------------------------- |
| `padding`        | `'none'`, `'xs'`, `'sm'`, `'md'`, `'lg'`                                 | `--space-{value}`          |
| `gap`            | `'none'`, `'xs'`, `'sm'`, `'md'`, `'lg'`                                 | `--space-{value}`          |
| `flex`           | `number`                                                                 | `flex: {value}`            |
| `textVariant`    | `'body'`, `'caption'`, `'h3'`, `'h4'`                                    | `--text-{variant}`         |
| `color`          | `'default'`, `'muted'`, `'accent'`, `'danger'`, `'success'`, `'warning'` | `--color-text-{value}`     |
| `bg`             | `'none'`, `'surface'`, `'elevated'`                                      | `--color-bg-{value}`       |
| `width`          | `number`                                                                 | `width: {value}px`         |
| `height`         | `number`                                                                 | `height: {value}px`        |
| `alignItems`     | `'start'`, `'center'`, `'end'`, `'stretch'`                              | `align-items: {value}`     |
| `justifyContent` | `'start'`, `'center'`, `'end'`, `'between'`                              | `justify-content: {value}` |

### Text format options

| `format`         | Input type                                   | Example input         | Rendered   |
| ---------------- | -------------------------------------------- | --------------------- | ---------- |
| `none` (default) | `string \| number`                           | `42`                  | `42`       |
| `plusMinus`      | `number`                                     | `3`                   | `+3`       |
| `fraction`       | `{ numerator: number, denominator: number }` | `{ n: 34, d: 50 }`    | `34 / 50`  |
| `diceFormula`    | `string`                                     | `'2d6+3'`             | `2d6+3`    |
| `diceWithMods`   | `{ formula: string, modifier: number }`      | `{ f: '1d20', m: 5 }` | `1d20 + 5` |

### Panel slots

| Slot         | Rendered as            | Receives scope        |
| ------------ | ---------------------- | --------------------- |
| `toolbar`    | Icon → drawer          | none                  |
| `actor-pill` | Actor pill dropdown    | `{ actorId: string }` |
| `window`     | Tabbed floating window | none                  |

---

## `.ruleset` file format

> **TODO:** The `.ruleset` file format (zip archive containing manifest + code + assets) is still evolving. The QuickJS boundary, the split between what belongs in a `.ruleset` vs. a `.tome`, and the exact zip structure are not yet stabilized. For now, rulesets are TypeScript modules loaded directly by the server.

---

## Further reading

- [ADR 011: Engine Facade Boundary and Reversal of the Custom DSL](../decisions/011-engine-facade-and-dsl-reversal.md) — Design rationale for why there is no DSL
- [ADR 012: HearthML — Ruleset-Defined Declarative UI](../decisions/012-ruleset-ui-hearthml.md) — Design rationale for the 10-primitive UI model
- [Ruleset Engine Design](ruleset-engine.md) — Engine boundary spec, baseline features, public surface
- [Data Model](data-model.md) — Snapshot/event structures, file formats
- [Shared Types](../shared-types.md) — Canonical type definitions and glossary
