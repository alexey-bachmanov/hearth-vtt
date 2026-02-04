# 002: Use SQLite for Live Campaign Storage (with .campaign as Import/Export)

## Status

Accepted

## Context

HearthVTT must support:

- self-hosting for non-technical users
- reliable persistence across sessions
- atomic updates from an authoritative action engine (many small state changes)
- portable import/export via `.campaign` packages

Most state is JSON-like (actors/items/effects/scenes), but correctness requires transactional updates and consistent reads.

## Decision

Use **SQLite** as the live runtime database, plus an assets folder on disk. Treat `.campaign` as an **import/export packaging format** (zip under the hood), not the live store.

All database interactions must go through a storage interface to avoid lock-in and allow future Postgres for hosted mode.

## Alternatives considered

1. **Write directly to `.campaign` zip as the live store**
   - Pros: conceptually simple (“campaign is the file”)
   - Cons: poor incremental write performance, no strong transactional safety, awkward concurrency, higher risk of corruption

2. **MongoDB / document database**
   - Pros: natural JSON document storage
   - Cons: adds significant operational burden for self-hosting; offers limited benefit for a single authoritative server process; still requires careful indexing and consistency handling

3. **Postgres from day one**
   - Pros: excellent for hosted mode, strong concurrency
   - Cons: heavier ops burden for self-host; SQLite is simpler for early iterations

## Consequences

- Self-host is easy: one DB file + folder of assets.
- Action resolution can be applied transactionally.
- `.campaign` export/import is implemented as packaging/unpackaging of DB + assets + manifest.
- Storage interface enables later Postgres support without rewriting core logic.
