# Data Model — HearthVTT (`docs/components/data-model.md`)

This document defines the core data structures, file formats, storage architecture, and schemas used throughout HearthVTT.

> **Terminology:** See [shared-types.md](../shared-types.md) for canonical definitions of CampaignState, Snapshot, GameEvent, EventRecord, Tome, Ruleset, and other shared types.

---

## Goals

### Durable, recoverable state

- Campaign state survives server crashes and power outages
- Multiple recovery points (Snapshots) allow rollback if needed
- Storage backend can be swapped (SQLite now, potentially others later)

### Portable import/export

- `.campaign` files allow backup, sharing, and disaster recovery
- `.character` files allow players to transfer characters between campaigns
- `.tome` files allow content creators to distribute rule content
- `.ruleset` files define game mechanics separate from content

### Hackable file formats

- All file formats are `.zip` archives under the hood
- JSON-based data allows manual editing and tooling
- Clear separation between data (JSON) and assets (images/audio)

---

## Storage Architecture

### In-Memory vs. Durable State

The server maintains two synchronized copies of campaign state:

| Location    | Purpose                 | Contents                             |
| ----------- | ----------------------- | ------------------------------------ |
| **Memory**  | Fast access during play | Full CampaignState + working indexes |
| **Storage** | Durability and recovery | Snapshot chain + EventRecord         |

### Snapshot Chain

Storage maintains a rolling window of the last **3 Snapshots** plus connecting GameEvents:

```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│ Snap 1  │────▶│ Snap 2  │────▶│ Snap 3  │────▶│  NOW    │
└─────────┘     └─────────┘     └─────────┘     └─────────┘
     │               │               │               │
     ▼               ▼               ▼               ▼
  Events          Events          Events          Events
   1-3             4-5             6-7            8-now
```

**On new Snapshot creation:**

1. Roll current events into new Snapshot
2. Append new Snapshot to chain
3. Remove oldest Snapshot and its preceding events
4. Prune EventRecord to only include events after oldest retained Snapshot

**Example transition (Snapshot 4 created after Event 9):**

Before: `Snap1 → [E1,E2,E3] → Snap2 → [E4,E5] → Snap3 → [E6,E7,E8,E9]`

After: `Snap2 → [E4,E5] → Snap3 → [E6,E7] → Snap4 → []`

### Event Durability

GameEvents are written to Storage **immediately** when they occur, not batched. This ensures:

- Crash recovery loses at most the in-flight action
- EventRecord can reconstruct CampaignState from any retained Snapshot
- Audit trail is always complete

### Recovery Flow

On server restart:

1. Load most recent Snapshot from Storage
2. Load all GameEvents after that Snapshot
3. Replay events to reconstruct CampaignState in memory
4. Resume normal operation

---

## Snapshot Contents

A Snapshot contains the complete state needed to reconstruct a campaign at a point in time.

```ts
interface Snapshot {
  id: SnapshotId;
  campaignId: CampaignId;
  createdAt: number; // Timestamp (ms since epoch)

  // Core state
  actors: Record<ActorId, Actor>;
  tokens: Record<TokenId, Token>;
  scenes: Record<SceneId, Scene>;
  items: Record<ItemId, Item>;
  effects: Record<EffectId, Effect>;

  // Campaign-level data
  seats: Record<SeatId, Seat>;
  settings: CampaignSettings;

  // Homebrew/custom content (JSON-serializable, not from Tomes)
  homebrewEntities: HomebrewEntity[];

  // Active state
  activeSceneId: SceneId | null;
  activeWorkflows: Record<WorkflowId, WorkflowState>;
  activePrompts: Record<PromptId, Prompt>;

  // References (not embedded)
  rulesetRef: RulesetRef;
  tomeRefs: TomeRef[];
}
```

### What Snapshots Exclude

| Excluded            | Reason                                          |
| ------------------- | ----------------------------------------------- |
| Audio/visual assets | Stored in working directory, referenced by path |
| Tome content        | Loaded from `.tome` files at session start      |
| Ruleset definitions | Loaded from `.ruleset` file at session start    |
| EventRecord         | Stored separately, linked by Snapshot ID        |

---

## File Formats

All HearthVTT file formats are **ZIP archives** with a `.hearth` prefix in their MIME type. Users can rename to `.zip` and extract for manual inspection/editing.

### Common Structure

All formats share:

```
<filename>.<ext>   (ZIP archive)
├── manifest.json  # Metadata, version, type declaration
├── data/          # JSON data files
└── assets/        # Binary assets (images, audio)
```

---

## .campaign Format

The `.campaign` file is a complete backup/export of a campaign.

### Purpose

- Disaster recovery if Storage becomes corrupted
- Transfer campaigns between servers
- Share campaign setups (without ongoing state)

### Structure

```
my-campaign.campaign (ZIP)
├── manifest.json
├── data/
│   ├── snapshot.json       # Single Snapshot (campaign state)
│   ├── homebrew/           # Custom entities created during play
│   │   ├── items.json
│   │   ├── actors.json
│   │   ├── effects.json
│   │   └── ...
│   └── settings.json       # Campaign settings
├── assets/
│   ├── tokens/             # Token images
│   ├── maps/               # Map images/videos
│   ├── portraits/          # Character portraits
│   └── audio/              # Music, ambient sounds
└── README.md               # Optional human-readable notes
```

### manifest.json

```json
{
  "formatVersion": "1.0",
  "type": "campaign",
  "name": "Curse of Strahd Campaign",
  "description": "Our weekly Thursday game",
  "createdAt": "2026-02-04T12:00:00Z",
  "hearthVersion": "0.1.0",
  "rulesetRef": {
    "id": "dnd5e-2024",
    "version": "1.2.0",
    "source": "https://example.com/rulesets/dnd5e-2024.ruleset"
  },
  "tomeRefs": [
    {
      "id": "dnd5e-srd",
      "version": "1.0.0",
      "source": "https://example.com/tomes/dnd5e-srd.tome"
    },
    {
      "id": "curse-of-strahd",
      "version": "1.0.0",
      "source": "local"
    }
  ]
}
```

### Import/Export Behavior

**Export:**

1. Create Snapshot from current CampaignState
2. Copy all referenced assets to `assets/`
3. Export homebrew entities to `data/homebrew/`
4. Package as ZIP

**Import:**

1. Validate manifest and format version
2. Check ruleset/tome availability (prompt to download if missing)
3. Import assets to working directory
4. Load Snapshot into Storage
5. Merge homebrew entities

---

## .character Format

The `.character` file allows players to export/import individual characters.

### Purpose

- Transfer characters between campaigns
- Backup important characters
- Share character builds

### Structure

```
my-character.character (ZIP)
├── manifest.json
├── data/
│   ├── actor.json          # Actor data (stats, features, etc.)
│   ├── inventory.json      # Owned items
│   └── effects.json        # Persistent effects (optional)
└── assets/
    ├── token.png           # Token image
    └── portrait.png        # Character portrait
```

### manifest.json

```json
{
  "formatVersion": "1.0",
  "type": "character",
  "name": "Tordek Ironforge",
  "actorType": "pc",
  "createdAt": "2026-02-04T12:00:00Z",
  "hearthVersion": "0.1.0",
  "rulesetRef": {
    "id": "dnd5e-2024",
    "version": "1.2.0"
  },
  "requiredTomes": [{ "id": "dnd5e-srd", "version": "1.0.0" }]
}
```

### Compatibility

Characters declare the Ruleset they were created with. When importing:

- **Compatible ruleset:** Import directly
- **Different version:** Warn user, attempt import (may need manual fixes)
- **Different ruleset:** Error, cannot import

---

## .tome Format

The `.tome` file is a content package: monsters, items, spells, maps, automations, etc.

### Purpose

- Distribute game content (official or homebrew)
- Bundle related content (e.g., adventure module with maps, monsters, items)
- Share automation recipes for spells/abilities

### Structure

```
my-content.tome (ZIP)
├── manifest.json
├── data/
│   ├── index.json          # Content index (for Compendium browsing)
│   ├── spells/
│   │   ├── fireball.json
│   │   └── ...
│   ├── items/
│   │   ├── longsword.json
│   │   └── ...
│   ├── monsters/
│   │   ├── goblin.json
│   │   └── ...
│   ├── features/           # Class features, racial traits, etc.
│   ├── effects/            # Reusable effect definitions
│   ├── workflows/          # Automation recipes
│   │   ├── spell-attack.json
│   │   └── ...
│   └── text/               # Readable content (lore, rules text)
│       ├── chapters/
│       └── handouts/
├── assets/
│   ├── images/
│   ├── tokens/
│   ├── maps/
│   └── audio/
└── README.md
```

### manifest.json

```json
{
  "formatVersion": "1.0",
  "type": "tome",
  "id": "dnd5e-srd",
  "name": "D&D 5e SRD",
  "description": "System Reference Document content for D&D 5th Edition",
  "version": "1.0.0",
  "authors": ["Wizards of the Coast"],
  "license": "OGL 1.0a",
  "createdAt": "2026-02-04T12:00:00Z",
  "hearthVersion": "0.1.0",
  "rulesetDependency": {
    "id": "dnd5e-2024",
    "minVersion": "1.0.0"
  }
}
```

### Tome Entry with Automation

Tome entries can reference resolver templates from the Ruleset:

```json
{
  "id": "fireball",
  "type": "spell",
  "name": "Fireball",
  "level": 3,
  "school": "evocation",
  "castingTime": "1 action",
  "range": "150 feet",
  "description": "A bright streak flashes...",

  "automation": {
    "templateId": "spell.aoe-save-damage",
    "params": {
      "aoeShape": "sphere",
      "aoeRadius": 20,
      "saveType": "dex",
      "damageFormula": "8d6",
      "damageType": "fire",
      "halfOnSave": true,
      "upcastDamage": "1d6"
    }
  }
}
```

The Ruleset provides `spell.aoe-save-damage` as a parameterized resolver template. The Tome provides the specific parameters.

---

## .ruleset Format

The `.ruleset` file defines game mechanics: schemas, actions, resolvers, and UI templates.

### Purpose

- Define what entities look like (schemas)
- Define what actions are possible (action catalog)
- Define how actions resolve (resolver programs)
- Define UI affordances (toolbar, sheets)

### Structure

```
my-ruleset.ruleset (ZIP)
├── manifest.json
├── schema/                 # JSON Schema definitions
│   ├── actor.schema.json
│   ├── item.schema.json
│   ├── spell.schema.json
│   ├── effect.schema.json
│   └── ...
├── actions/                # Action definitions
│   ├── index.json          # Action registry
│   ├── core/               # Core actions (attack, cast, move)
│   │   ├── attack.json
│   │   ├── cast-spell.json
│   │   └── ...
│   ├── manual/             # Manual fallback actions
│   │   ├── apply-damage.json
│   │   ├── modify-hp.json
│   │   └── ...
│   └── encounter/          # Encounter management
│       ├── initiative.json
│       └── turn.json
├── triggers/               # Event-triggered resolvers
│   ├── index.json
│   ├── on-damage.json
│   ├── on-turn-start.json
│   └── ...
├── templates/              # Parameterized resolver templates
│   ├── index.json
│   ├── spell.aoe-save-damage.json
│   ├── spell.attack-roll.json
│   └── ...
├── effects/                # Effect type definitions
│   ├── conditions.json     # Prone, stunned, etc.
│   ├── modifiers.json      # Stat/roll modifier types
│   └── durations.json      # Duration type definitions
├── ui/                     # UI configuration
│   ├── toolbar.json        # Toolbar visibility config
│   ├── sheets/             # Character sheet templates
│   │   ├── pc.json
│   │   ├── npc.json
│   │   └── monster.json
│   └── bindings.json       # Action button bindings
├── expressions/            # Expression language extensions
│   └── functions.json      # Whitelisted helper functions
└── README.md
```

### manifest.json

```json
{
  "formatVersion": "1.0",
  "type": "ruleset",
  "id": "dnd5e-2024",
  "name": "D&D 5th Edition (2024)",
  "description": "Core rules for Dungeons & Dragons 5th Edition, 2024 revision",
  "version": "1.2.0",
  "authors": ["HearthVTT Community"],
  "license": "MIT",
  "createdAt": "2026-02-04T12:00:00Z",
  "hearthVersion": "0.1.0",
  "engineVersion": "1.0.0"
}
```

### Action Definition

```json
{
  "id": "attack.melee",
  "name": "Melee Attack",
  "description": "Make a melee weapon attack against a target",
  "category": "combat",

  "inputSchema": {
    "type": "object",
    "properties": {
      "attackerId": { "type": "string" },
      "targetId": { "type": "string" },
      "weaponId": { "type": "string" }
    },
    "required": ["attackerId", "targetId", "weaponId"]
  },

  "authorization": {
    "requiresOwnership": "attackerId",
    "allowedRoles": ["player", "gm"]
  },

  "resolver": { "$ref": "./resolvers/attack-melee.json" }
}
```

### Template Definition

Templates are parameterized resolvers that Tome entries can invoke:

```json
{
  "id": "spell.aoe-save-damage",
  "name": "AoE Save for Damage",
  "description": "Template for spells that create an AoE, force saves, and deal damage",

  "paramSchema": {
    "type": "object",
    "properties": {
      "aoeShape": { "enum": ["sphere", "cube", "cone", "line", "cylinder"] },
      "aoeRadius": { "type": "number" },
      "saveType": { "enum": ["str", "dex", "con", "int", "wis", "cha"] },
      "damageFormula": { "type": "string" },
      "damageType": { "type": "string" },
      "halfOnSave": { "type": "boolean" },
      "upcastDamage": { "type": "string" }
    },
    "required": [
      "aoeShape",
      "aoeRadius",
      "saveType",
      "damageFormula",
      "damageType"
    ]
  },

  "resolver": [
    {
      "op": "selectAoE",
      "var": "aoe",
      "shape": "$params.aoeShape",
      "radius": "$params.aoeRadius"
    },
    { "op": "queryTargets", "var": "targets", "inside": "$vars.aoe" },
    {
      "op": "foreach",
      "list": "$vars.targets",
      "as": "target",
      "do": [
        {
          "op": "roll",
          "var": "save",
          "formula": "1d20 + $target.saves[$params.saveType]"
        },
        {
          "op": "calc",
          "var": "passed",
          "expr": "$vars.save.total >= $vars.dc"
        },
        {
          "op": "if",
          "cond": "$vars.passed && $params.halfOnSave",
          "then": [
            {
              "op": "calc",
              "var": "damage",
              "expr": "floor($vars.baseDamage / 2)"
            }
          ],
          "else": [
            { "op": "calc", "var": "damage", "expr": "$vars.baseDamage" }
          ]
        },
        {
          "op": "call",
          "action": "apply-damage",
          "payload": {
            "targetId": "$target.id",
            "damage": "$vars.damage",
            "damageType": "$params.damageType"
          }
        }
      ]
    }
  ]
}
```

---

## Working Directory

Large binary assets are stored in a working directory on the server filesystem, not in the database.

```
campaigns/
└── {campaignId}/
    ├── maps/           # Scene background images/videos
    ├── tokens/         # Token images
    ├── portraits/      # Character portraits
    ├── audio/          # Music, ambient sounds
    └── uploads/        # User-uploaded files
```

Assets are referenced by relative path in entity data. On export, referenced assets are copied into the `.campaign` archive.

---

## Entity Schemas (Overview)

Entity schemas are defined by the Ruleset. The following are examples of common entity structures:

### Actor (Example: D&D 5e)

```json
{
  "id": "actor-uuid",
  "type": "pc",
  "name": "Tordek Ironforge",
  "stats": {
    "strength": 16,
    "dexterity": 12,
    "constitution": 14,
    "intelligence": 10,
    "wisdom": 13,
    "charisma": 8
  },
  "resources": {
    "hp": { "current": 45, "max": 52, "temp": 0 },
    "hitDice": { "current": 5, "max": 5, "size": "d10" }
  },
  "derived": {
    "ac": 18,
    "proficiencyBonus": 3,
    "initiativeBonus": 1
  },
  "features": ["actor-feature-uuid-1", "actor-feature-uuid-2"],
  "inventory": ["item-uuid-1", "item-uuid-2"],
  "spellcasting": null
}
```

### Token

```json
{
  "id": "token-uuid",
  "actorId": "actor-uuid",
  "sceneId": "scene-uuid",
  "position": { "x": 150, "y": 200 },
  "size": { "width": 1, "height": 1 },
  "rotation": 0,
  "visible": true,
  "imagePath": "tokens/tordek.png"
}
```

### Scene

```json
{
  "id": "scene-uuid",
  "name": "Tavern - Ground Floor",
  "backgroundPath": "maps/tavern-ground.webp",
  "grid": {
    "type": "square",
    "size": 70,
    "offset": { "x": 0, "y": 0 }
  },
  "walls": [
    /* wall segment data */
  ],
  "lights": [
    /* light source data */
  ],
  "tokens": ["token-uuid-1", "token-uuid-2"]
}
```

---

## Character Sheet Data Model

Character sheets reference Actor data directly. The sheet template (from Ruleset) defines:

1. **Layout:** How fields are arranged in the UI
2. **Bindings:** Which Actor fields to display
3. **Computed fields:** Expressions for derived values
4. **Effect application:** How attached effects modify displayed values

### Rendering Flow

```
Actor Base Data
     │
     ▼
┌─────────────────┐
│ Apply Effects   │  ← Iterate attached effects, apply modifiers
│ (sequential)    │
└─────────────────┘
     │
     ▼
┌─────────────────┐
│ Compute Derived │  ← Calculate proficiency, AC, etc.
└─────────────────┘
     │
     ▼
┌─────────────────┐
│ Render Sheet    │  ← Template binds to final values
└─────────────────┘
```

### Effect Application Example

An item granting "+2 to AC":

```json
{
  "id": "effect-uuid",
  "sourceRef": {
    "itemRef": { "kind": "item", "tomeId": "...", "id": "shield-of-protection" }
  },
  "target": { "type": "actor", "id": "actor-uuid" },
  "modifiers": [{ "stat": "ac", "type": "bonus", "value": 2 }]
}
```

An item pinning Strength at 21:

```json
{
  "id": "effect-uuid",
  "sourceRef": {
    "itemRef": {
      "kind": "item",
      "tomeId": "...",
      "id": "belt-of-giant-strength"
    }
  },
  "target": { "type": "actor", "id": "actor-uuid" },
  "modifiers": [{ "stat": "strength", "type": "set", "value": 21 }]
}
```

---

## Storage Class

The Storage class (see [server.md](server.md)) is a concrete facade that abstracts database operations. Server code references this class directly; switching database implementations (SQLite to Postgres, for example) only requires editing `Storage.ts`, not changing references throughout the codebase.

### Storage Responsibilities

The Storage class internally delegates to a database-specific implementation (SQLiteBackend, PostgresBackend, etc.) via a private interface or strategy pattern. This provides:

- **Single point of change:** Database implementation details isolated to `Storage.ts`
- **Type safety:** Server code works with concrete methods, not generic interfaces
- **Testability:** Test implementations can be injected via constructor or factory

### Key Methods

```ts
class Storage {
  // Existing methods (see server.md for full API)...

  // Snapshot chain management
  getLatestSnapshot(campaignId: CampaignId): Promise<Snapshot | null>;
  getSnapshotChain(campaignId: CampaignId): Promise<Snapshot[]>; // Returns last 3
  saveSnapshot(snapshot: Snapshot): Promise<void>;
  pruneOldSnapshots(campaignId: CampaignId, keepCount: number): Promise<void>;

  // Event durability
  appendEvent(event: GameEvent): Promise<void>;
  getEventsSinceSnapshot(
    campaignId: CampaignId,
    snapshotId: SnapshotId,
  ): Promise<GameEvent[]>;
  pruneEventsBeforeSnapshot(
    campaignId: CampaignId,
    snapshotId: SnapshotId,
  ): Promise<void>;
}
```

### Implementation Pattern

```ts
// Internal interface for database implementations
interface StorageBackend {
  init(): Promise<void>;
  close(): Promise<void>;
  // ... other low-level operations
}

// Concrete Storage class used throughout server
export class Storage {
  private backend: StorageBackend;

  constructor(backend: StorageBackend) {
    this.backend = backend;
  }

  // Public API delegates to backend
  async getCampaign(campaignId: string): Promise<Campaign | null> {
    return this.backend.getCampaign(campaignId);
  }

  // ... rest of API
}

// Factory function for creating Storage instances
export function createStorage(config: StorageConfig): Storage {
  const backend =
    config.type === 'sqlite'
      ? new SQLiteBackend(config)
      : new PostgresBackend(config);

  return new Storage(backend);
}
```

This pattern ensures that changing database implementations requires editing only the backend implementations and factory, not the hundreds of places in server code that call `storage.getCampaign()` or similar methods.

---
