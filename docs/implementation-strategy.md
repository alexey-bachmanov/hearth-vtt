# Implementation Strategy

> **Created:** February 2026 · **Rewritten:** June 2026  
> **Status:** Active — 10 milestones from current state to v1.0 (full D&D SRD campaign).  
> **Purpose:** Long-term roadmap for HearthVTT. Each milestone produces a concrete, testable artifact. Engine-ruleset architecture is stabilized through deliberate stress-testing with three non-D&D rulesets before the full SRD is built.

---

## Table of Contents

- [Design Principles](#design-principles)
- [Milestones](#milestones)
  - [M1 — CSP + Input Sanitization](#m1--csp--input-sanitization)
  - [M2 — Workflow-Prompt Loop](#m2--workflow-prompt-loop)
  - [M3 — D&D Skeleton](#m3--dd-skeleton)
  - [M4 — Canvas Input + Tool Modes](#m4--canvas-input--tool-modes)
  - [M5 — Tome Format + First Content](#m5--tome-format--first-content)
  - [M6 — Bar Fight](#m6--bar-fight)
  - [M7 — PbtA Skeleton — Break It](#m7--pbta-skeleton--break-it)
  - [M8 — Blades + Wanderhome — Break It Again](#m8--blades--wanderhome--break-it-again)
  - [M9 — Ruleset Authoring DX Pass](#m9--ruleset-authoring-dx-pass)
  - [M10 — Full SRD + Campaign](#m10--full-srd--campaign)
- [Dependency Graph](#dependency-graph)
- [Everything Else (Post-M10 / Deferred)](#everything-else-post-m10--deferred)
- [Key Decisions](#key-decisions)
- [Current State (as of June 2026)](#current-state-as-of-june-2026)

---

## Design Principles

1. **Structural soundness before polish.** Engine, ruleset, and tome APIs stabilize before UX refinement. Ship janky UI that works correctly over polished UI on a shifting foundation.
2. **Concrete stress-tests drive abstraction.** No abstraction is designed before at least two concrete consumers exist. Skeleton rulesets (D&D, PbtA, Blades, Wanderhome) intentionally stress different parts of the engine API before it is declared stable.
3. **Milestones produce testable artifacts.** Every milestone has a verifiable exit criterion. No "implement everything, connect, pray" phases.
4. **The engine is authoritative.** Server owns campaign state. Ruleset code runs inside the engine boundary via the resolver contract; no ruleset code has direct access to network, filesystem, DOM, or Node APIs.
5. **Throwaway iteration for the engine interior.** Skeleton rulesets are written with the intent to discover what breaks. Refactors during M7-M8 are expected experimental results, not failures. Full rulesets are built only after the API stabilizes.
6. **CSP-first.** Content-Security-Policy enforcement and input sanitization land before any feature that renders user-supplied text (chat, prompts, documents, character sheets, annotations).

---

## M1 — CSP + Input Sanitization

> **Estimated effort:** 1–2 weeks  
> **Prerequisite for:** All UI work rendering user-supplied text.

Prerequisite for all subsequent milestones. Ships CSP enforcement and input sanitization so chat, prompts, documents, annotations, and character sheets can render untrusted text safely.

### Tasks

1. **Security response headers.** Create `server/src/plugins/security-headers.ts`. Register in `server.ts`. Headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`.
2. **CSP header.** Ship as `Content-Security-Policy-Report-Only` first. Policy: `default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss:; frame-ancestors 'none'`. Flip to enforcing once all UI routes produce zero violations.
3. **Input sanitization.** Create `client/src/util/sanitize.ts`. Strip or escape HTML in all user-supplied text paths: chat messages, actor names, token names, scene names, custom data values rendered as text.
4. **Audit existing text rendering.** Route all chat cards, actor pill names, notification messages through sanitizer.
5. **Vite config.** Update if needed for CSP-compatible builds (no inline scripts, hashed inline styles).

### Verification

- `Content-Security-Policy` header present on all responses.
- `<script>alert(1)</script>` in chat input renders as text, not executed.
- Zero CSP violations in browser console.
- Existing chat, dice, and notification features still render correctly.

---

## M2 — Workflow-Prompt Loop

> **Estimated effort:** 1–2 weeks  
> **Depends on:** M1 (CSP for prompt text rendering).

Completes the server-side workflow machinery and wires a skill check end-to-end in the browser. This is the first concrete validation that the resolver → workflow → prompt → respond → continuation loop works.

### Tasks

1. **`workflow.resolve` and `workflow.cancel` intents.** Add to `server/src/domain/engine/core/types.ts`. Add cases to `intent-processor.ts` (remove workflow from state on resolve/cancel, emit corresponding wire events).
2. **Continuation dispatch routing.** In `engine-core.ts` `dispatchInternal()`: if `EngineInput` carries a `promptId`, look up the workflow, route to the continuation resolver registered under `workflow.continuationActionType`. If workflow not found, return `ACTION_REJECTED`.
3. **`prompt.respond` action type.** Reserved, not registered by rulesets. Engine routes internally. Payload: `{ promptId, response }`.
4. **Prompt creation tied to `workflow.open`.** Emitting a `workflow.open` intent automatically produces a `prompt` event in the wire broadcast. Prompt carries: `promptId`, `title`, `message`, `availableActions[]`, `targetSeatId`.
5. **`notify` intent** (or extend `workflow.open`). Resolvers specify who receives the prompt. Default: originating seat for player prompts; GM seat for GM prompts.
6. **Skill check end-to-end.** Implement `skill.check` action: opens workflow, emits prompt to player ("Roll a d20"), player clicks Roll, `prompt.respond` routes to continuation resolver that rolls the die and emits `dice.result` + `chat.send`, then resolves the workflow.
7. **Client prompt UI.** `PromptCard.svelte` renders prompt with available actions. Button click dispatches `prompt.respond`. On `workflow.resolved`/`workflow.cancelled` event, dismiss prompt.
8. **Tests.** Unit: workflow lifecycle (open → respond → resolve; open → cancel; respond to nonexistent → rejected; double-respond → no-op). Component: PromptCard renders actions, click dispatches.

### Verification

- Unit test: `dispatch(skill.check) → workflow.opened + prompt events → dispatch(prompt.respond, promptId) → dice.rolled + chat.message + workflow.resolved`.
- Browser: skill check button → prompt appears → click Roll → result in chat.
- Verify double-respond returns no-op.
- Workflow survives server restart (stored in event log, replayed on open).

---

## M3 — D&D Skeleton

> **Estimated effort:** 2 weeks  
> **Depends on:** M2 (workflow infrastructure).

Implement 5 representative D&D actions plus HearthML panels for initiative, actor pill, and character sheet. All visible in browser with mock data. The first concrete ruleset that exercises the engine's resolver API, workflow model, and HearthML panel system.

### Tasks

1. **Five stress-test actions** in `server/src/domain/engine/rulesets/dnd-skeleton/`:
   - `attack.simple` — roll d20 + modifier vs AC, on hit roll damage, emit chat. No workflow (single resolver).
   - `skill.check` — built in M2. Exercises the full workflow-prompt loop.
   - `spell.fireball` — workflow: select AoE point → tokens in radius roll DEX save → deal 8d6 (half on save) → emit results. _Resolver implemented and tested server-side; UI blocked by tool modes (M4)._
   - `condition.concentration` — when damage taken, auto-trigger CON save. _Standalone action initially; trigger model deferred._
   - `death.save` — workflow: prompt player to roll d20, track successes/failures in `actor.data.derived`.
2. **HearthML panels:**
   - Initiative tracker: `window` slot, reads `campaignData.initiative`, advance/retreat buttons.
   - Actor pill: `actor-pill` slot, HP progress bar, AC display.
   - Barebones character sheet: `window` slot, stats/skills/saves, `forEach` on skills array.
3. **`recomputeActorData` hook.** Computes `actor.data.derived.strMod`, `derived.dexMod`, etc. from `actor.data.stats`.
4. **Tests.** All actions unit-tested against EngineCore. Panels component-tested with mock campaignData. Fireball resolver tested server-side; UI integration marked TODO-M4.

### Verification

- All 5 actions pass unit tests.
- Initiative panel renders turn order with advance/retreat.
- Actor pill shows HP bar and AC.
- Character sheet shows stats and skills.
- `recomputeActorData` recalculates derived values after stat changes.

---

## M4 — Canvas Input + Tool Modes

> **Estimated effort:** 2 weeks  
> **Depends on:** M1 (CSP), M3 (fireball resolver exists).

Redesign the canvas input controller around prompt tool mode requirements. Tool modes and input system co-evolve — each informs the other. Not all tool modes need to be implemented, but their specs must be solidified and inform the input system's design.

### Tasks

1. **Gather tool mode requirements** from M3 and anticipated M5-M6 needs:
   - `select-point` — click map, return `{ x, y }`. For: fireball AoE center, teleport, spawn token.
   - `select-token` — click token, return `{ tokenId }`. For: attack target, inspect.
   - `select-area` — drag on map, return `{ center, radius }` or `{ bounds }`. For: AoE spells, wall placement.
2. **Design and implement** the new input controller. State machine: `idle → mode(select-point|select-token|select-area) → selected → idle`. Emits typed domain events; no rendering knowledge.
3. **Tool mode states** with enter/exit hooks. Visual feedback per mode (crosshair, highlight, preview shape).
4. **Wire tool modes to prompts.** When a prompt carries `toolMode: 'select-point'`, client enters that mode. On selection, dispatches `prompt.respond` with the payload.
5. **Integrate with gestures.** Tool modes temporarily override pan/zoom/drag; restore on mode exit or Escape.
6. **Wire fireball end-to-end.** "Cast Fireball" → prompt "Select AoE center" → select-point mode → click map → `prompt.respond` → engine runs saves → results broadcast.
7. **Tests.** Unit: input state machine transitions. Component: mode transitions. Integration: fireball cast → point select → results in chat.

### Verification

- Input state machine transitions tested in isolation.
- Browser: fireball cast → select-point mode activates → click map → DEX save results in chat.
- Tool mode cancels on Escape.
- Existing pan/zoom/drag-token gestures still work outside tool modes.

---

## M5 — Tome Format + First Content

> **Estimated effort:** 2 weeks  
> **Depends on:** M3 (D&D skeleton defines ruleset schemas that tome entities reference).  
> **Pre-requisite:** Pre-M5 design session for tome format (1-2 days, separate Design-Adversary pass).

Design and implement the `.tome` file format. Ship a sword item, a goblin monster, and a Markdown document viewer.

### Design session (before implementation)

Define: tome manifest schema, item/creature/spell schemas, ruleset-tome linking (how a tome declares "I contain D&D 5.5 content"), document storage format (Markdown files in zip), compendium indexing.

### Tasks

1. **`.tome` format.** ZIP containing `manifest.json` (id, version, rulesetId, content list) + `content/` entity JSON files + `documents/` `.md` files. Zod schemas for validation at load boundary.
2. **Tome loader.** `server/src/domain/engine/tome-loader.ts`: read zip, validate manifest, index entities by type+id. Wire into `CampaignManager.acquire()` or `attachTome()`.
3. **D&D item schema** as shared convention (not engine-enforced): `{ id, name, type, damage?, ac?, description, weight, cost }`.
4. **`srd-basics.tome`:** one weapon (longsword: 1d8 slashing), one monster (goblin: stat block + Markdown description), one spell (magic missile: description only, mechanics in ruleset).
5. **Compendium.** `campaignState.compendium` reads from tome entities. `CompendiumDrawer.svelte` lists items/monsters/spells by category.
6. **Document viewer.** `DocumentViewer.svelte`: renders Markdown via `marked` or `markdown-it` (sanitized output). Opens from compendium entries and GM handout panels.
7. **Equip flow.** Actor sheet inventory section (HearthML) reads item references from `actor.data.inventory`. Equipping sets `actor.data.equipped.weapon` → attack resolver reads damage formula.
8. **Tests.** Tome loading + validation, compendium indexing, Markdown rendering (no XSS). Integration: campaign with tome → sword in compendium → equip → attack uses sword's damage formula.

### Verification

- Tome loads without validation errors.
- Sword appears in compendium drawer.
- Equip to actor → `actor.data.equipped.weapon = 'longsword'`.
- Attack action uses 1d8 slashing.
- Document viewer renders Markdown (bold, italic, tables, no XSS).

---

## M6 — Bar Fight

> **Estimated effort:** 2 weeks  
> **Depends on:** M4 (canvas input + tool modes), M5 (tome content).

First playable prototype. GM creates a scene, uploads a map, places tokens, runs a combat encounter. Shareable with friends for feedback.

### Tasks

1. **Image upload.** `POST /api/campaigns/:id/assets` — multipart, MIME validation (png/jpeg/webp), 10MB limit. Store in `DATA_DIR/campaigns/{id}/assets/`. Serve via `GET /api/campaigns/:id/assets/:filename`. Generate thumbnail for token library.
2. **Scene management in play UI.** `SceneManagerDrawer.svelte`: list/create scenes, set background image, configure grid.
3. **Token management in play UI.** `TokenLibraryDrawer.svelte`: list available tokens (uploaded + compendium). Drag or "Place" → select-point tool mode → places at clicked position.
4. **Actor management.** Create actor from compendium monster, or blank. Link token to actor. Actor pill shows on map.
5. **Combat loop.** Initiative roll → tracker populated → advance turn. Attack: select attacker → "Attack" → select target → roll → on hit, damage → apply HP → if ≤ 0, mark dead.
6. **Bar fight scenario.** Hardcoded tavern map (placeholder if upload not ready), 2 PC + 3 goblin tokens, pre-equipped weapons.
7. **E2E smoke test** (optional stretch): Playwright script for bar fight.

### Verification

- Create scene, upload map image (or placeholder), place goblin tokens.
- Run initiative, attack with sword, HP decreases, goblin dies at 0.
- Friend can join and see synced state.

---

## M7 — PbtA Skeleton — Break It

> **Estimated effort:** 2 weeks  
> **Depends on:** M6 (working engine to break against).

Implement 3 Dungeon World moves. Discover what breaks in the engine API. Document and refactor as needed. Refactors are expected experimental results — not failures.

### Tasks

1. **Three PbtA moves:**
   - `hackAndSlash` — 2d6+STR. 10+: deal damage. 7-9: deal damage, take counter. 6-: GM hard move. Workflow for 7-9 player choice prompt.
   - `defyDanger` — 2d6+STAT. 10+: avoid. 7-9: worse outcome/hard bargain. 6-: GM move. Workflow for 7-9 choice.
   - One basic move (`parley`, `spoutLore`, or `discernRealities` — whichever stresses different API features).
2. **Document every refactor.** Distinguish "engine was D&D-shaped here" vs. "genuinely missing primitive."
   - Expected tension: PbtA doesn't use d20/AC/saves. GM doesn't roll. Damage is flat. GM moves are freeform prompts.
3. **Refactor engine API.** All changes must be additive (new optional fields, new intents, new helpers) unless a D&D-shaped field is actively wrong for PbtA.
4. **Update D&D skeleton** for any breaking changes.
5. **Record findings** in `docs/decisions/013-pbta-engine-stress-test.md`.

### Verification

- 3 PbtA moves work end-to-end.
- ADR documents engine changes.
- D&D skeleton resolvers still pass after refactors.

---

## M8 — Blades + Wanderhome — Break It Again

> **Estimated effort:** 3 weeks  
> **Depends on:** M7 (PbtA refactors applied).

Repeat the M7 pattern with two more rulesets. By the end, the engine API must be stable.

### Blades in the Dark (2-3 actions)

- `skirmish` — position+effect, d6 dice pool, clocks. Stresses: non-d20 pool, GM-set parameters, campaignData clocks.
- `resistanceRoll` — spend stress to reduce consequence. Stresses: resource tracking, mid-resolution intervention.
- One downtime action — stresses: structured phases, crew resources.

### Wanderhome (2 actions)

- `spendToken` — deduct from token pool, narrate. Stresses: no dice, token economy.
- `worldTrait` — reference campaign-level trait. Stresses: campaignData as primary interaction.

### Tasks

- Implement actions as ruleset resolvers.
- Document refactors same as M7.
- Record as `docs/decisions/014-blades-wanderhome-stress-test.md`.
- By end: ResolverIntent kinds, ResolverApi methods, and HearthML binding kinds stable.

### Verification

- Blades and Wanderhome actions work.
- No further engine changes anticipated.
- ADR documents final API shape.

---

## M9 — Ruleset Authoring DX Pass

> **Estimated effort:** 2 weeks  
> **Depends on:** M8 (engine API stable).  
> **Positioned before M10** to avoid refactoring the full SRD ruleset after it's built.

With the engine API stabilized, reduce boilerplate and casts in ruleset authoring.

### Tasks

1. **Audit skeleton rulesets** for common patterns: argument validation boilerplate, helper access, intent construction, action registration, error handling.
2. **Extract shared patterns.** `createRuleset()` helper or builder API. Target: D&D action resolver from ~40 lines to ~15 lines.
3. **TypeScript generics.** `Resolver<MyArgs>` instead of manual `as` casts.
4. **Error messages.** When a resolver throws, surface action type + ruleset ID alongside error.
5. **Update `docs/components/ruleset-authoring.md`** with stabilized API + DX improvements.
6. **Refactor all three skeleton rulesets** to use new DX surface. Verify tests pass.
7. **Record as** `docs/decisions/015-ruleset-authoring-dx.md`.

### Verification

- D&D skeleton resolver lines of code reduced by ≥40%.
- All three skeleton rulesets pass with new DX surface.

---

## M10 — Full SRD + Campaign

> **Estimated effort:** 6+ weeks  
> **Depends on:** M9 (DX pass), M5 (tome format), M8 (engine stable). M5 tome format may need revisions from M7-M8 findings.

Build the full D&D 5.5 SRD ruleset and bestiary tome. Run a one-shot campaign. This is the v1.0 exit criterion.

### Tasks

1. **SRD ruleset.** Covers: races, classes (1-20), backgrounds, feats, skills, saves, combat actions, spellcasting, conditions, equipment, resting, leveling.
2. **SRD bestiary tome.** Monsters (CR 0-30), spells (full list), items (weapons, armor, gear, magic items), class feature descriptions.
3. **SRD rules reference tome.** Markdown documents for combat rules, spellcasting rules, condition descriptions.
4. **Character creation.** HearthML panels for race/class/background selection, ability score assignment, equipment. Functional, not polished.
5. **Example adventure.** `.campaign` file: pre-built scenes, placed tokens, GM notes, handouts.
6. **Run a one-shot.** With friends. Document feedback.

### Verification

- Full SRD ruleset compiles and loads.
- Bestiary tome loads.
- Character can be created (race + class + background).
- One-shot playable without engine errors.

---

## Dependency Graph

```
M1 (CSP) ────────────────────────────────────────────
  │
  ▼
M2 (Workflow-Prompt Loop)
  │
  ▼
M3 (D&D Skeleton)
  │         │
  ▼         └──────────────┐
M4 (Canvas Input           ▼
     + Tool Modes)    M5 (Tome Format + Content)
  │         │              │
  └────┬────┘              │
       ▼                   │
  M6 (Bar Fight) ◄─────────┘
       │
       ▼
  M7 (PbtA Skeleton)
       │
       ▼
  M8 (Blades + Wanderhome)
       │
       ▼
  M9 (Authoring DX Pass)
       │
       ▼
  M10 (Full SRD + Campaign)  ←── v1.0
```

M1-M4 are tightly sequenced. M5 depends on M3 (ruleset schemas) but not M4. M6 converges M4+M5. M7-M9 are linear stress-test → stabilize → polish chain. M10 is the payoff.

---

## Everything Else (Post-M10 / Deferred)

Not in the critical path. Tracked for visibility; not scheduled.

- **UI Polish:** pop-out windows, radial menus, drag-and-drop from drawers, character-mancer polish, animation/tweening, responsive layout audit.
- **Jukebox:** audio file upload, playlist management, per-scene playlists, synchronized playback across clients. Requires audio streaming design.
- **Multi-connection per seat:** one account → multiple browser tabs/devices → shared seat state. WebSocket connection pooling and state broadcast.
- **Advanced rendering:** dynamic lighting, wall/obstruction drawing, fog of war (server-authoritative), weather/particle effects.
- **Measurement + annotation tools:** ruler measurement, AoE templates, text annotations on map, persistent drawings.
- **Documents system expansion:** folder organization, search, rich text editing for GM notes, player-visible handouts with permissions.
- **Snapshot auto-trigger + pruning:** automated snapshot writes every N events, retention policy.
- **Admin UI overhaul:** polished ruleset/tome management, campaign template system, audit log surface.
- **Platform features:** hosted mode, platform accounts, marketplace, license key validation for closed-license content.
- **Hex grid:** rendering logic for hex grids in GridLayer.
- **Accessibility:** ARIA audit, keyboard navigation, screen reader support.
- **E2E testing:** Playwright suite for critical paths (auth, combat, campaign lifecycle).
- **Production hardening:** rate limiting, message size limits, WS schema validation, error telemetry, Docker image optimization.

---

## Key Decisions

These are locked architectural choices for this roadmap. Changes require an ADR.

| Decision                                                          | Rationale                                                                                                                                            |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Documents = static Markdown, no live bindings**                 | HearthML handles live/interactive data. Documents are read-only descriptive text. Markdown is portable, sanitizable, and a solved rendering problem. |
| **Class mechanics in ruleset, flavor + specific classes in tome** | Ruleset defines class schema and stacking rules. Tome defines "bard is a class, here's what it gives you" plus flavor text.                          |
| **Skeleton rulesets stress-test the engine before full SRD**      | D&D, PbtA, Blades, and Wanderhome cover d20, 2d6, dice-pool, and no-dice systems. Engine API stabilizes from concrete usage, not a priori design.    |
| **Refactors during M7-M8 are expected, not failures**             | The purpose of skeleton rulesets is to discover what breaks. Fixing it is the point.                                                                 |
| **Ruleset DX pass after stabilization, before full SRD (M9)**     | Prevents refactoring a 600-action ruleset when the authoring API changes.                                                                            |
| **Canvas input redesigned concurrently with tool modes (M4)**     | Each informs the other. Tool mode specs are concrete design drivers for the input system.                                                            |
| **CSP first (M1)**                                                | Every feature that renders user text (chat, prompts, documents, character sheets) is blocked until CSP lands.                                        |
| **Polish sacrificed until post-M10**                              | Structural soundness → DX → full ruleset → campaign → polish. Polishing an unstable API is waste.                                                    |
| **Tome format requires a pre-M5 design session**                  | Not designed in this plan. Separate Design-Adversary pass to define manifest schema, ruleset-tome linking, content schemas, and document storage.    |
| **Bar fight (M6) is the first shareable prototype**               | Earlier milestones are validation artifacts. M6 is the first thing a friend can play.                                                                |

---

## Current State (as of June 2026)

### What's Working

- **Engine v0.2:** ResolverIntent pipeline with 19 intent kinds. Baseline resolvers for token.move, chat.send, dice.roll, CRUD ops, data.replace, campaignData.set. Deterministic dice via seeded PRNG.
- **Workflow infrastructure:** `workflow.open` intent, Workflow type stored in CampaignState. Continuation dispatch routing and prompt creation not yet implemented.
- **HearthML:** Types in `shared/src/ruleset-ui.ts`. `PanelRenderer.svelte` with 10 element renderers. Actor pill, floating window, and tool drawer slots implemented (partial).
- **D&D ruleset:** Throwaway v0.1 — token.move composition proof-of-concept only.
- **Client state:** campaignState, connectionState, authState, notificationState (2×2 model), uiState, selectionState, seatPermissions, viewport — all Svelte 5 rune-based.
- **WebSocket protocol:** welcome, view, event, dispatch, panel.defs messages working.
- **Auth:** Player auth (login, claim-invite, refresh, sessions), admin auth (CSRF, sessions, rate limiting), dev seed script.
- **Renderer:** PixiJS-backed with map background, grid overlay, token sprites, camera (pan/zoom), token drag.

### What's In Progress

- CSP + security headers (current project blocker).
- Phase 5.1 auth cleanup (single-token migration, logout CSRF fix, session cap, password recovery).

### What's Deferred

- Workflow-prompt loop completion (M2).
- Canvas input controller redesign (M4).
- Tome file format (pre-M5 design session needed).
- Drawing/measurement/label baseline actions.
- Snapshot auto-trigger + pruning.
- Multi-connection per seat.
- All "Everything Else" items above.
