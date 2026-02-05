# Architecture Decision Records (ADRs)

This folder contains **Architecture Decision Records** for HearthVTT.

ADRs exist to:

- document _why_ we made key architectural choices
- prevent re-litigating settled decisions with future contributors/agents
- provide context for tradeoffs and consequences
- create a clear paper trail when decisions change

---

## How to use ADRs

### When to write an ADR

Write an ADR when you make (or propose changing) a decision that affects:

- core architecture boundaries (engine vs ruleset vs UI vs storage)
- major technology choices (frameworks, databases, rendering approach)
- persistence formats and portability (.campaign/.tome/.ruleset/.character)
- security/auth models
- protocol shapes (HTTP/WS message envelopes)

If it’s a minor implementation detail, don’t write an ADR.

---

## ADR lifecycle / statuses

Use one of these statuses at the top of each ADR:

- **Proposed** — a decision is being considered, not yet adopted.
- **Accepted** — the decision is active and should be treated as “locked in.”
- **Superseded** — the decision is no longer active; a newer ADR replaced it.
- **Deprecated** — still present for compatibility but should not be used for new work.

---

## Changing an accepted decision

**Do not** change an Accepted decision by quietly editing code.

To change an Accepted decision:

1. Create a new ADR describing the proposed change.
2. Explain **why the old decision no longer fits** (new requirements, measured performance, operational issues, etc.).
3. Compare alternatives and document consequences.
4. Mark the old ADR as **Superseded** and link to the new ADR.

This prevents churn and keeps agents from debating settled architecture.

---

## Naming and numbering

ADRs are stored as:

`XXX-short-title.md`

- `XXX` is a zero-padded number (e.g. `001`, `002`)
- Keep titles short and descriptive

Example:

- `002-webgl-rendering.md`

---

## Current ADRs

- [001: WebGL Rendering](001-webgl-rendering.md) — **Accepted**
- [002: SQLite Storage](002-sqlite-storage.md) — **Accepted**
- [003: Fastify Framework](003-fastify-framework.md) — **Accepted**
- [004: GameEngine Class Architecture](004-gameengine-class-architecture.md) — **Accepted**
- [005: Networking Management (Join Links + Cookie Sessions)](005-networking-management.md) — **Accepted**
- [006: Svelte 5 Upgrade](006-svelte-5-upgrade.md) — **Accepted**

---

## ADR template (recommended)

```md
# XXX: <Title>

## Status

Proposed | Accepted | Superseded | Deprecated

## Context

What problem are we solving? What constraints exist?

## Decision

What are we doing?

## Alternatives considered

What else did we consider, and why not?

## Consequences

What changes because of this decision? What new risks/limits exist?
```
