# 009: Consolidate SQLite to Single Combined Database per Server

## Status

Accepted

## Context

The original SQLite architecture (ADR-002) was implemented with a two-database layout:

- `metadata.db` — campaigns table, server_admin, admin_sessions, and two cross-campaign token-index tables
- `campaign-{uuid}.db` — one file per campaign: entities, events, seats, invites, auth_sessions

The two-database design was motivated by an assumption that per-campaign isolation would simplify deletion (drop the file) and prevent cross-campaign data leakage. However, it introduced significant operational complexity:

- An unbounded `Map<campaignId, Database>` connection pool with no eviction (tech debt)
- A `getOrCreateCampaignDb()` helper that lazily opens new file handles, risking unbounded file descriptor growth
- Two separate `invite_token_index` / `session_token_index` shadow tables required for global token lookups (tokens must be resolvable without knowing which campaign they belong to)
- Every write to invites or auth_sessions required a two-phase transaction across two separate Database objects, which `better-sqlite3` cannot handle atomically
- `:memory:` mode was impossible because the two-DB architecture doesn't map to a single `Database(':memory:')` handle, blocking the use of SQLite in-memory databases for server integration tests

## Decision

Consolidate all campaign and server-level data into a single **`hearth.db`** file per server.

### Schema

Eight tables, all in one database:

1. **campaigns** — unchanged
2. **server_admin** — unchanged
3. **admin_sessions** — unchanged
4. **entities** — add `campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE`
5. **events** — add `campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE`
6. **seats** — add `ON DELETE CASCADE` to the existing `campaign_id` foreign key
7. **invites** — add `campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE`; remove the cross-table token-index mechanism
8. **auth_sessions** — add `campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE`; remove the cross-table token-index mechanism

**Removed:** `invite_token_index` and `session_token_index` shadow tables.

### Connection management

`SqliteStorage` now holds a single `db: Database.Database | null` field.

```
dataDir === ':memory:'  →  new Database(':memory:')
otherwise              →  new Database(path.join(dataDir, 'db', 'hearth.db'))
```

Removed: `metadataDb`, `campaignDbs: Map`, `getOrCreateCampaignDb()`, `closeMetadataDb()`, `closeCampaignDb()`.

### Token lookups

`getInvite(token)` and `getAuthSession(hash)` now query their respective tables directly with `WHERE invite_token = ?` / `WHERE refresh_token_hash = ?`. The `campaign_id` column on those tables is retained for indexed lookups and ON DELETE CASCADE, but is not returned to callers.

### Campaign deletion

`DELETE FROM campaigns WHERE id = ?` cascades to all child tables via SQLite foreign key ON DELETE CASCADE, replacing the previous pattern of closing a file handle and calling `unlinkSync()`.

## Alternatives considered

1. **Keep the two-DB layout and add a SQLite "attach" trick for `:memory:` tests**
   — Unworkable. `ATTACH DATABASE ':memory:' AS campaign_xyz` in a single connection still requires separate attach/detach per campaign and is incompatible with the current `StorageBackend` abstraction.

2. **Keep two-DB layout and use an InMemoryBackend exclusively in tests**
   — Viable short-term, but masks integration gaps where SqliteStorage behaviour differs from InMemoryBackend. Combined DB enables true SqliteStorage tests.

3. **Switch to WAL + multiple DB files and use LRU eviction**
   — Addresses the unbounded connection pool but not the `:memory:` requirement or the two-phase write atomicity problem.

## Consequences

- **Breaking change for existing data:** any `metadata.db` / `campaign-{uuid}.db` files from prior versions are incompatible. Pre-v1.0 this is acceptable; no migration script is provided.
- Tests can now inject `new SqliteStorage({ dataDir: ':memory:' })` for fast, hermetic integration tests.
- `deleteCampaign` is simpler and correct under foreign keys.
- `createInvite` / `createAuthSession` / `updateAuthSession` no longer need cross-DB token-index synchronisation.
- SQLite WAL mode pragmas are set as before (no-op for `:memory:`, effective for file DBs).
- `ensure-dirs.ts`: the `campaigns/` subdirectory creation is removed (no longer needed).
