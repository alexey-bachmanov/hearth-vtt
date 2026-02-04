# Domain-Specific Language — HearthVTT (`docs/components/domain-specific-language.md`)

This document defines the resolver DSL: the constrained language used to define action resolution, automation, and game mechanics in HearthVTT.

> **Terminology:** See [shared-types.md](../shared-types.md) for canonical definitions of Resolver, GameEvent, Action, Patch, and other shared types.
>
> **Context:** This document specifies the DSL grammar and semantics. For how DSL programs integrate with the engine, see [ruleset-engine.md](ruleset-engine.md).

---

## Goals

### Constrained and safe

- No arbitrary code execution
- No filesystem, network, or DOM access
- Deterministic (clock and RNG injected)
- Statically validatable at load time

### Expressive for TTRPG automation

- Support common patterns: roll + compare, target selection, conditional effects
- Parameterizable templates for reuse across spells/items/abilities
- Rich enough for complex mechanics, simple enough for non-programmers

### JSON-based and toolable

- Programs are JSON arrays of operations
- Expressions use a mini-language with defined grammar
- Validation via JSON Schema + custom expression parser
- No custom parser required for program structure

---

## Program Model

A resolver program is a **JSON array of operations** executed sequentially.

```json
[
  { "op": "calc", "var": "bonus", "expr": "mod($actor.stats.strength)" },
  { "op": "roll", "var": "attackRoll", "formula": "1d20 + $vars.bonus" },
  {
    "op": "emit",
    "eventType": "roll.result",
    "audience": "public",
    "data": { "roll": "$vars.attackRoll" }
  }
]
```

### Execution Context

Operations have access to:

| Source     | Notation   | Description                                       |
| ---------- | ---------- | ------------------------------------------------- |
| Payload    | `$payload` | Action payload (input from user/UI)               |
| Local vars | `$vars`    | Variables created by prior operations             |
| Actor      | `$actor`   | The acting entity (if applicable)                 |
| Target     | `$target`  | Current target in a `foreach` loop                |
| Params     | `$params`  | Template parameters (for parameterized resolvers) |
| State      | `$state`   | Read-only campaign state view                     |
| Effects    | `$effects` | Effect query interface                            |

### Output Accumulation

Operations append to the Resolution output:

- `events[]` — GameEvents to emit
- `patches[]` — State mutations to apply
- `prompts[]` — User prompts to create
- `workflows[]` — Workflow state mutations

Resolution outputs are **append-only**. Operations cannot modify previously appended items.

---

## Expression Language

Expressions are strings evaluated to produce values. They appear in `calc` operations, conditionals, and data fields.

### Grammar (EBNF-like)

```ebnf
expression     = conditional | logical_or ;

conditional    = logical_or "?" expression ":" expression ;

logical_or     = logical_and ( "||" logical_and )* ;
logical_and    = equality ( "&&" equality )* ;
equality       = comparison ( ( "==" | "!=" ) comparison )* ;
comparison     = additive ( ( "<" | ">" | "<=" | ">=" ) additive )* ;

additive       = multiplicative ( ( "+" | "-" ) multiplicative )* ;
multiplicative = unary ( ( "*" | "/" | "%" ) unary )* ;

unary          = ( "!" | "-" ) unary | call ;

call           = primary ( "(" arguments? ")" | "[" expression "]" | "." identifier )* ;
arguments      = expression ( "," expression )* ;

primary        = NUMBER | STRING | "true" | "false" | "null"
               | path_ref | "(" expression ")" ;

path_ref       = "$" identifier ( "." identifier | "[" expression "]" )* ;
identifier     = ALPHA ( ALPHA | DIGIT | "_" )* ;
```

### Operators

| Category       | Operators   | Precedence (low to high) |
| -------------- | ----------- | ------------------------ |
| Conditional    | `? :`       | 1                        |
| Logical OR     | `\|\|`      | 2                        |
| Logical AND    | `&&`        | 3                        |
| Equality       | `== !=`     | 4                        |
| Comparison     | `< > <= >=` | 5                        |
| Additive       | `+ -`       | 6                        |
| Multiplicative | `* / %`     | 7                        |
| Unary          | `! -`       | 8                        |
| Call/Access    | `() [] .`   | 9                        |

### Path References

Path references access data from the execution context:

```
$payload.weaponId        → Action payload field
$vars.attackRoll.total   → Local variable (roll result total)
$actor.stats.strength    → Acting entity's strength stat
$target.saves.dex        → Target's dexterity save modifier
$params.damageType       → Template parameter
$state.actors[$payload.targetId].hp.current → State lookup
```

### Literals

| Type    | Examples             |
| ------- | -------------------- |
| Number  | `42`, `3.14`, `-7`   |
| String  | `"hello"`, `'world'` |
| Boolean | `true`, `false`      |
| Null    | `null`               |

### Example Expressions

```
// Simple arithmetic
$actor.stats.strength + $vars.proficiencyBonus

// Ability modifier calculation
floor(($actor.stats.dexterity - 10) / 2)

// Conditional (ternary)
$vars.attackRoll.total >= $vars.targetAC ? "hit" : "miss"

// Boolean logic
$vars.hasAdvantage && !$vars.hasDisadvantage

// Nested path access
$state.actors[$payload.targetId].resources.hp.current

// Function call
max($vars.damage, 0)
```

---

## Whitelisted Functions

Only functions in the whitelist can be called in expressions. Functions are pure (no side effects).

### Math Functions

| Function           | Description      | Example                   |
| ------------------ | ---------------- | ------------------------- |
| `floor(n)`         | Round down       | `floor(3.7)` → `3`        |
| `ceil(n)`          | Round up         | `ceil(3.2)` → `4`         |
| `round(n)`         | Round to nearest | `round(3.5)` → `4`        |
| `abs(n)`           | Absolute value   | `abs(-5)` → `5`           |
| `min(a, b, ...)`   | Minimum value    | `min(3, 1, 4)` → `1`      |
| `max(a, b, ...)`   | Maximum value    | `max(3, 1, 4)` → `4`      |
| `clamp(n, lo, hi)` | Clamp to range   | `clamp(15, 0, 10)` → `10` |

### TTRPG Functions

| Function           | Description           | Example              |
| ------------------ | --------------------- | -------------------- |
| `mod(score)`       | D&D ability modifier  | `mod(16)` → `3`      |
| `profBonus(level)` | D&D proficiency bonus | `profBonus(5)` → `3` |

### String Functions

| Function            | Description         | Example                     |
| ------------------- | ------------------- | --------------------------- |
| `len(s)`            | String/array length | `len("hello")` → `5`        |
| `concat(a, b, ...)` | Concatenate strings | `concat("a", "b")` → `"ab"` |

### Array Functions

| Function             | Description       | Example                         |
| -------------------- | ----------------- | ------------------------------- |
| `len(arr)`           | Array length      | `len([1,2,3])` → `3`            |
| `contains(arr, val)` | Check membership  | `contains([1,2,3], 2)` → `true` |
| `sum(arr)`           | Sum numeric array | `sum([1,2,3])` → `6`            |

### Adding Functions

New functions can be added to the whitelist by:

1. Defining the function in `expressions/functions.json` within the Ruleset
2. Ensuring the function is pure (no side effects)
3. Documenting input types and return type

```json
{
  "functions": {
    "advantageMod": {
      "description": "Returns 5 for advantage, -5 for disadvantage, 0 otherwise",
      "params": ["hasAdvantage", "hasDisadvantage"],
      "returnType": "number",
      "implementation": "builtin:advantageMod"
    }
  }
}
```

---

## Operations Reference

### Core Operations

#### `calc` — Calculate and Store

Evaluate an expression and store the result in a local variable.

```json
{
  "op": "calc",
  "var": "attackBonus",
  "expr": "mod($actor.stats.strength) + $actor.derived.proficiencyBonus"
}
```

| Field  | Type       | Required | Description                   |
| ------ | ---------- | -------- | ----------------------------- |
| `var`  | string     | Yes      | Variable name to store result |
| `expr` | expression | Yes      | Expression to evaluate        |

---

#### `roll` — Dice Roll

Roll dice using the server's authoritative RNG.

```json
{
  "op": "roll",
  "var": "attackRoll",
  "formula": "1d20 + $vars.attackBonus",
  "label": "Attack Roll"
}
```

| Field       | Type   | Required | Description                                     |
| ----------- | ------ | -------- | ----------------------------------------------- |
| `var`       | string | Yes      | Variable name to store roll result              |
| `formula`   | string | Yes      | Dice formula (see Dice Formula Grammar)         |
| `label`     | string | No       | Human-readable label for display                |
| `modifiers` | array  | No       | Additional roll modifiers to query from effects |

**Roll Result Structure:**

```ts
interface RollResult {
  formula: string;
  total: number;
  dice: DieResult[];
  modifiers: RollModifier[];
  label?: string;
}

interface DieResult {
  size: number; // d20 → 20
  result: number; // Rolled value
  kept: boolean; // Whether this die counted toward total
  exploded: boolean; // Whether this die triggered explosion
}
```

---

#### `emit` — Emit GameEvent

Add a GameEvent to the resolution output.

```json
{
  "op": "emit",
  "eventType": "damage.applied",
  "audience": "public",
  "data": {
    "targetId": "$payload.targetId",
    "damage": "$vars.totalDamage",
    "damageType": "$params.damageType"
  }
}
```

| Field       | Type     | Required | Description                           |
| ----------- | -------- | -------- | ------------------------------------- |
| `eventType` | string   | Yes      | Event type identifier                 |
| `audience`  | Audience | Yes      | Visibility policy                     |
| `data`      | object   | Yes      | Event payload (expressions evaluated) |

---

#### `patch` — State Mutation

Add a state patch to the resolution output.

```json
{
  "op": "patch",
  "target": { "type": "actor", "id": "$payload.targetId" },
  "path": "/resources/hp/current",
  "patchOp": "add",
  "value": "$vars.newHp"
}
```

| Field     | Type                  | Required    | Description                    |
| --------- | --------------------- | ----------- | ------------------------------ |
| `target`  | EntityTarget          | Yes         | Entity to patch                |
| `path`    | string                | Yes         | JSON Pointer to field          |
| `patchOp` | `"add"` \| `"remove"` | Yes         | Patch operation                |
| `value`   | expression            | Conditional | New value (required for `add`) |

---

#### `prompt` — Request User Input

Create a durable prompt for user interaction.

```json
{
  "op": "prompt",
  "var": "reactionChoice",
  "audience": "$payload.targetOwner",
  "kind": "blocking",
  "title": "Opportunity Attack",
  "body": "Do you want to make an opportunity attack?",
  "actions": [
    { "label": "Attack", "value": "attack" },
    { "label": "Pass", "value": "pass" }
  ],
  "timeout": 30000
}
```

| Field      | Type           | Required | Description                          |
| ---------- | -------------- | -------- | ------------------------------------ |
| `var`      | string         | Yes      | Variable to store response           |
| `audience` | Audience       | Yes      | Who receives the prompt              |
| `kind`     | PromptKind     | Yes      | `ephemeral`, `blocking`, or `inline` |
| `title`    | string         | Yes      | Prompt title                         |
| `body`     | string         | No       | Prompt description                   |
| `actions`  | PromptAction[] | Yes      | Available choices                    |
| `timeout`  | number         | No       | Timeout in milliseconds              |

---

### Control Flow Operations

#### `if` — Conditional Execution

Execute operations conditionally.

```json
{
  "op": "if",
  "cond": "$vars.attackRoll.total >= $vars.targetAC",
  "then": [
    { "op": "roll", "var": "damage", "formula": "$vars.weapon.damageFormula" },
    {
      "op": "call",
      "action": "apply-damage",
      "payload": {
        "targetId": "$payload.targetId",
        "damage": "$vars.damage.total"
      }
    }
  ],
  "else": [
    {
      "op": "emit",
      "eventType": "attack.miss",
      "audience": "public",
      "data": { "attackerId": "$payload.attackerId" }
    }
  ]
}
```

| Field  | Type        | Required | Description         |
| ------ | ----------- | -------- | ------------------- |
| `cond` | expression  | Yes      | Boolean condition   |
| `then` | operation[] | Yes      | Operations if true  |
| `else` | operation[] | No       | Operations if false |

---

#### `foreach` — Iteration

Iterate over a list, executing operations for each item.

```json
{
  "op": "foreach",
  "list": "$vars.targets",
  "as": "target",
  "do": [
    { "op": "roll", "var": "save", "formula": "1d20 + $target.saves.dex" },
    {
      "op": "if",
      "cond": "$vars.save.total < $vars.dc",
      "then": [
        {
          "op": "call",
          "action": "apply-damage",
          "payload": { "targetId": "$target.id", "damage": "$vars.fullDamage" }
        }
      ],
      "else": [
        {
          "op": "call",
          "action": "apply-damage",
          "payload": { "targetId": "$target.id", "damage": "$vars.halfDamage" }
        }
      ]
    }
  ]
}
```

| Field   | Type        | Required | Description                     |
| ------- | ----------- | -------- | ------------------------------- |
| `list`  | expression  | Yes      | Array to iterate                |
| `as`    | string      | Yes      | Variable name for current item  |
| `index` | string      | No       | Variable name for current index |
| `do`    | operation[] | Yes      | Operations for each item        |

---

#### `call` — Invoke Another Resolver

Call another action's resolver, enabling composition and reuse.

```json
{
  "op": "call",
  "action": "apply-damage",
  "payload": {
    "targetId": "$payload.targetId",
    "damage": "$vars.damage.total",
    "damageType": "slashing",
    "source": "$payload.attackerId"
  }
}
```

| Field     | Type   | Required | Description                   |
| --------- | ------ | -------- | ----------------------------- |
| `action`  | string | Yes      | Action ID to invoke           |
| `payload` | object | Yes      | Payload for the called action |

**Note:** `call` contributes to the recursion depth limit (20 calls max).

---

### Targeting Operations

#### `selectTargets` — Request Target Selection

Pause workflow and request the user to select targets.

```json
{
  "op": "selectTargets",
  "var": "targets",
  "prompt": "Select up to 3 targets",
  "constraints": {
    "minCount": 1,
    "maxCount": 3,
    "range": 60,
    "filter": { "type": "actor", "hostile": true }
  }
}
```

| Field         | Type              | Required | Description                        |
| ------------- | ----------------- | -------- | ---------------------------------- |
| `var`         | string            | Yes      | Variable to store selected targets |
| `prompt`      | string            | Yes      | Instructions for user              |
| `constraints` | TargetConstraints | Yes      | Selection constraints              |

---

#### `selectAoE` — Request AoE Placement

Pause workflow and request the user to place an area of effect.

```json
{
  "op": "selectAoE",
  "var": "aoe",
  "prompt": "Place the fireball",
  "shape": "sphere",
  "radius": "$params.aoeRadius",
  "range": 150,
  "origin": "$actor.position"
}
```

| Field    | Type       | Required | Description                                  |
| -------- | ---------- | -------- | -------------------------------------------- |
| `var`    | string     | Yes      | Variable to store AoE data                   |
| `prompt` | string     | Yes      | Instructions for user                        |
| `shape`  | string     | Yes      | `sphere`, `cube`, `cone`, `line`, `cylinder` |
| `radius` | expression | Yes      | Size of the AoE                              |
| `range`  | expression | No       | Maximum distance from origin                 |
| `origin` | expression | No       | Starting point (default: actor position)     |

---

#### `queryTargets` — Server-Side Target Query

Compute targets based on criteria without user interaction.

```json
{
  "op": "queryTargets",
  "var": "affectedTokens",
  "inside": "$vars.aoe",
  "filter": { "type": "token", "excludeSource": true }
}
```

| Field    | Type         | Required | Description                     |
| -------- | ------------ | -------- | ------------------------------- |
| `var`    | string       | Yes      | Variable to store query results |
| `inside` | expression   | No       | AoE or area to query within     |
| `filter` | TargetFilter | Yes      | Filtering criteria              |

---

### Effects Operations

#### `applyEffect` — Apply Effect to Target

Add an effect to an entity.

```json
{
  "op": "applyEffect",
  "target": { "type": "actor", "id": "$payload.targetId" },
  "effect": {
    "name": "Prone",
    "sourceRef": { "actorId": "$payload.attackerId" },
    "tags": ["condition:prone"],
    "modifiers": [
      { "type": "rollDisadvantage", "filter": ["attack", "melee"] }
    ],
    "duration": { "type": "saveEnds", "saveType": "str", "dc": 15 }
  }
}
```

| Field    | Type         | Required | Description               |
| -------- | ------------ | -------- | ------------------------- |
| `target` | EntityTarget | Yes      | Entity to apply effect to |
| `effect` | EffectDef    | Yes      | Effect definition         |

---

#### `removeEffect` — Remove Effects

Remove effects by criteria.

```json
{
  "op": "removeEffect",
  "target": { "type": "actor", "id": "$payload.targetId" },
  "filter": { "tags": ["condition:prone"] }
}
```

| Field    | Type         | Required | Description                    |
| -------- | ------------ | -------- | ------------------------------ |
| `target` | EntityTarget | Yes      | Entity to remove effects from  |
| `filter` | EffectFilter | Yes      | Criteria for effects to remove |

---

#### `queryEffects` — Query Active Effects

Query effects on a target for modifier calculation.

```json
{
  "op": "queryEffects",
  "var": "attackModifiers",
  "target": { "type": "actor", "id": "$payload.attackerId" },
  "filter": { "modifierType": "roll", "tags": ["attack"] }
}
```

| Field    | Type         | Required | Description                       |
| -------- | ------------ | -------- | --------------------------------- |
| `var`    | string       | Yes      | Variable to store queried effects |
| `target` | EntityTarget | Yes      | Entity to query                   |
| `filter` | EffectFilter | Yes      | Filter criteria                   |

---

### Encounter Operations

#### `encounter.create` — Create Encounter

Initialize a new combat encounter.

```json
{
  "op": "encounter.create",
  "var": "encounter",
  "name": "Goblin Ambush",
  "participants": "$vars.combatants"
}
```

---

#### `encounter.collectInitiative` — Collect Initiative Rolls

Prompt all participants for initiative.

```json
{
  "op": "encounter.collectInitiative",
  "encounterId": "$vars.encounter.id",
  "timeout": 60000,
  "defaultFormula": "1d20 + $actor.derived.initiativeBonus"
}
```

---

#### `encounter.advanceTurn` — Advance Turn

Move to the next turn in initiative order.

```json
{
  "op": "encounter.advanceTurn",
  "encounterId": "$vars.encounter.id"
}
```

---

### Workflow Operations

#### `awaitResponses` — Wait for Multiple Responses

Create a workflow step that waits for responses from multiple parties.

```json
{
  "op": "awaitResponses",
  "var": "saves",
  "requests": "$vars.savePrompts",
  "timeout": 30000,
  "defaultValue": { "passed": false }
}
```

| Field          | Type       | Required | Description                 |
| -------------- | ---------- | -------- | --------------------------- |
| `var`          | string     | Yes      | Variable to store responses |
| `requests`     | expression | Yes      | Array of pending prompts    |
| `timeout`      | number     | No       | Timeout in milliseconds     |
| `defaultValue` | any        | No       | Default if timeout expires  |

---

#### `cancelPrompt` — Cancel Outstanding Prompts

Cancel prompts that are no longer relevant.

```json
{
  "op": "cancelPrompt",
  "promptIds": "$vars.pendingReactions",
  "reason": "superseded"
}
```

| Field       | Type       | Required | Description                   |
| ----------- | ---------- | -------- | ----------------------------- |
| `promptIds` | expression | Yes      | Array of prompt IDs to cancel |
| `reason`    | string     | Yes      | Cancellation reason           |

---

## Dice Formula Grammar

Dice formulas follow common TTRPG conventions.

### Grammar

```ebnf
formula     = term ( ( "+" | "-" ) term )* ;
term        = dice | number | variable ;
dice        = count? "d" size modifiers? ;
count       = number ;
size        = number ;
modifiers   = modifier+ ;
modifier    = keep | drop | reroll | explode | min | max ;
keep        = ( "kh" | "kl" ) number ;
drop        = ( "dh" | "dl" ) number ;
reroll      = "r" comparison number ;
explode     = "!" comparison? number? ;
min         = "min" number ;
max         = "max" number ;
comparison  = "<" | ">" | "<=" | ">=" | "=" ;
variable    = "$" path ;
```

### Examples

| Formula            | Description                               |
| ------------------ | ----------------------------------------- |
| `1d20`             | Roll one 20-sided die                     |
| `2d6+3`            | Roll two 6-sided dice, add 3              |
| `1d20+$vars.bonus` | Roll d20, add variable                    |
| `2d20kh1`          | Roll 2d20, keep highest 1 (advantage)     |
| `2d20kl1`          | Roll 2d20, keep lowest 1 (disadvantage)   |
| `4d6dl1`           | Roll 4d6, drop lowest 1 (stat generation) |
| `1d6!`             | Roll d6, explode on max (roll again if 6) |
| `1d20r<2`          | Roll d20, reroll if less than 2           |
| `2d6min2`          | Roll 2d6, minimum 2 per die               |

---

## Static Validation

DSL programs are validated at Ruleset load time. Validation catches errors before play begins.

### Validation Checks

| Check                   | Description                                      |
| ----------------------- | ------------------------------------------------ |
| **Schema validation**   | Program structure matches JSON Schema            |
| **Variable references** | All `$vars.x` references are defined before use  |
| **Path validation**     | `$payload`, `$actor`, etc. paths exist in schema |
| **Function whitelist**  | Only whitelisted functions are called            |
| **Type compatibility**  | Operations receive expected types                |
| **Action references**   | `call` targets exist in Ruleset                  |
| **Template params**     | Template invocations provide required params     |

### Error Reporting

Validation errors include:

- File and location (JSON path)
- Error type and message
- Suggested fix (when possible)

```
Error in actions/attack.json at /resolver/2/expr:
  Undefined variable reference: $vars.attackBonus

  The variable 'attackBonus' is used but not defined.
  Did you mean '$vars.attackRoll'?
```

---

## Example: Complete Attack Resolver

```json
{
  "id": "attack.melee",
  "name": "Melee Attack",
  "resolver": [
    {
      "op": "calc",
      "var": "attacker",
      "expr": "$state.actors[$payload.attackerId]"
    },
    {
      "op": "calc",
      "var": "target",
      "expr": "$state.actors[$payload.targetId]"
    },
    {
      "op": "calc",
      "var": "weapon",
      "expr": "$state.items[$payload.weaponId]"
    },

    {
      "op": "calc",
      "var": "abilityMod",
      "expr": "mod($vars.attacker.stats[$vars.weapon.attackAbility])"
    },
    {
      "op": "calc",
      "var": "profBonus",
      "expr": "$vars.attacker.derived.proficiencyBonus"
    },
    {
      "op": "calc",
      "var": "attackBonus",
      "expr": "$vars.abilityMod + $vars.profBonus + $vars.weapon.attackBonus"
    },

    {
      "op": "queryEffects",
      "var": "attackMods",
      "target": { "type": "actor", "id": "$payload.attackerId" },
      "filter": { "modifierType": "roll", "tags": ["attack", "melee"] }
    },

    {
      "op": "calc",
      "var": "hasAdvantage",
      "expr": "contains($vars.attackMods, 'advantage')"
    },
    {
      "op": "calc",
      "var": "hasDisadvantage",
      "expr": "contains($vars.attackMods, 'disadvantage')"
    },

    {
      "op": "calc",
      "var": "diceFormula",
      "expr": "$vars.hasAdvantage && !$vars.hasDisadvantage ? '2d20kh1' : (!$vars.hasAdvantage && $vars.hasDisadvantage ? '2d20kl1' : '1d20')"
    },

    {
      "op": "roll",
      "var": "attackRoll",
      "formula": "$vars.diceFormula + $vars.attackBonus",
      "label": "Attack Roll"
    },

    {
      "op": "emit",
      "eventType": "roll.result",
      "audience": "public",
      "data": {
        "actorId": "$payload.attackerId",
        "roll": "$vars.attackRoll",
        "type": "attack"
      }
    },

    { "op": "calc", "var": "targetAC", "expr": "$vars.target.derived.ac" },
    {
      "op": "calc",
      "var": "isHit",
      "expr": "$vars.attackRoll.total >= $vars.targetAC"
    },
    {
      "op": "calc",
      "var": "isCrit",
      "expr": "$vars.attackRoll.dice[0].result == 20"
    },

    {
      "op": "if",
      "cond": "$vars.isHit",
      "then": [
        {
          "op": "calc",
          "var": "damageFormula",
          "expr": "$vars.isCrit ? $vars.weapon.critDamageFormula : $vars.weapon.damageFormula"
        },
        {
          "op": "roll",
          "var": "damageRoll",
          "formula": "$vars.damageFormula",
          "label": "Damage"
        },

        {
          "op": "emit",
          "eventType": "roll.result",
          "audience": "public",
          "data": {
            "actorId": "$payload.attackerId",
            "roll": "$vars.damageRoll",
            "type": "damage"
          }
        },

        {
          "op": "call",
          "action": "damage.apply",
          "payload": {
            "targetId": "$payload.targetId",
            "damage": "$vars.damageRoll.total",
            "damageType": "$vars.weapon.damageType",
            "sourceId": "$payload.attackerId"
          }
        }
      ],
      "else": [
        {
          "op": "emit",
          "eventType": "attack.miss",
          "audience": "public",
          "data": {
            "attackerId": "$payload.attackerId",
            "targetId": "$payload.targetId"
          }
        }
      ]
    }
  ]
}
```

---

## Future Considerations

### Debugging Tools

- Step-through execution in development mode
- Variable inspection at each step
- Dry-run mode (no state changes)

### Visual Editor

- Node-based editor for non-programmers
- Drag-and-drop operation composition
- Live validation feedback

### Optimization

- Compile frequently-used resolvers to optimized form
- Cache expression parse trees
- Batch similar operations

---
