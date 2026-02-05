# Server Component — HearthVTT (`docs/components/server.md`)

This document defines the **Game Server** responsibilities, tech stack, and initial implementation plan. It is the source of truth for server-side architecture during early development.

---

## Goals

The HearthVTT Game Server must:

1. **Serve a web client bundle** (static assets) so client/server versions remain compatible.
2. Provide **HTTP APIs** for health checks and basic server/campaign management.
3. Provide a **WebSocket Secure (WSS) realtime channel** for:
   - action dispatch
   - prompt delivery
   - state delta broadcast
4. Persist campaign data reliably for:
   - self-host (single box)
   - Docker/container deployment
   - cloud deployment (same server implementation)

Non-goals for the placeholder milestone:

- full ruleset engine
- full auth system (beyond stubs / basic invite claim)
- full fog/lighting logic

---

## Tech stack (locked in)

- Runtime: **Node.js**
- Web framework: **Fastify**
- Database: **SQLite** (local file)
- Persistence abstraction: **Storage** interface
- Assets: local filesystem directory (pluggable later)

Rationale:

- Fastify gives strong performance, clear plugin structure, and makes schema validation natural.
- SQLite keeps self-hosting dead-simple (single-file DB, great transactional semantics).
- Storage interface prevents persistence tech lock-in and supports future Postgres for hosted mode.

---

## Hosting and portability

### Single server implementation

The Game Server codebase must run unchanged in:

- local self-host mode (CLI/executable)
- Docker
- cloud container hosting

### Configuration

Configuration must come from environment variables and/or CLI flags (no hard-coded deployment assumptions):

- `PORT` (default: 3000)
- `HOST` (default: `127.0.0.1` for self-host safety)
- `DATA_DIR` (default: `./data`)
- `PUBLIC_BASE_URL` (optional; used to generate invite links)
- `TRUST_PROXY` (default: false; true when behind reverse proxies)
- `LOG_LEVEL` (default: info)
- `TLS_CERT_PATH` (optional; path to TLS certificate file for WSS)
- `TLS_KEY_PATH` (optional; path to TLS private key file for WSS)
- `TLS_ENABLED` (default: false; set to true to enable native TLS support)

Notes:

- Default `HOST=127.0.0.1` prevents accidental LAN exposure.
- Admin UI (future) must be localhost-only by default or guarded by a setup code.
- For production, TLS should be handled by a reverse proxy (recommended) or enabled natively via TLS\_\* config options.
- When `TLS_ENABLED=true`, WebSocket connections will use WSS protocol; HTTP will use HTTPS.

---

## Directory layout (recommended)

At repo root:

- `server/` — Fastify server source
- `client/` — Svelte client source
- `packages/` — shared libs (protocol/types/dice/DSL runtime)
- `docs/` — design docs

Within `server/` (suggested):

- `server/src/app.ts` — Fastify app setup
- `server/src/index.ts` — process entry point (env/flags, start server)
- `server/src/routes/` — HTTP routes
- `server/src/ws/` — WebSocket Secure (WSS) handler(s)
- `server/src/storage/` — Storage interface + SQLite implementation
- `server/src/config.ts` — config parsing/validation
- `server/src/logger.ts` — structured logging config
- `server/src/static.ts` — static file serving of client bundle

Runtime data directory:

- `${DATA_DIR}/db.sqlite` — SQLite database file
- `${DATA_DIR}/assets/` — uploaded maps/tokens/etc.
- `${DATA_DIR}/imports/` — optional staging for campaign import
- `${DATA_DIR}/exports/` — optional staging for campaign export

---

## HTTP endpoints (placeholder milestone)

### Required

- `GET /healthz`
  - returns 200 with `{ status: "ok" }`
  - used for docker/cloud health checks

- `GET /`
  - serves the built client bundle (prod) OR a placeholder HTML page (until client exists)
  - in dev, may proxy to Vite dev server (optional)

### Optional stubs (for early scaffolding)

- `GET /api/version`
  - returns server version, protocol version
- `POST /api/auth/claim-invite`
  - stub endpoint; returns placeholder session for now

All endpoints must validate input where applicable (Fastify schemas).

---

## WebSocket Secure realtime (placeholder milestone)

### Endpoint

- `wss://server.example.com/ws` (upgrade to secure WebSocket)
- For local development: `ws://localhost:3000/ws` is acceptable
- Production deployments **must** use WSS with valid TLS certificates

### TLS Termination Options

**Option 1: Reverse Proxy (Recommended)**

- Use Caddy, nginx, or Traefik to handle TLS termination
- Proxy forwards plain HTTP/WS to the Node.js server locally
- Server binds to localhost, proxy handles external traffic
- Simplest for Docker/cloud deployments

**Option 2: Native TLS**

- Server reads TLS certificates directly via `TLS_CERT_PATH` and `TLS_KEY_PATH`
- Fastify or underlying framework handles HTTPS/WSS
- Requires certificate management (renewal, etc.)
- Useful for standalone deployments without a reverse proxy

### Minimum behavior

- Accept connection
- Perform a minimal handshake:
  - client sends: `{ type: "hello", protocolVersion: number, clientVersion?: string }`
  - server responds: `{ type: "welcome", protocolVersion: number, serverVersion: string }`
- Echo test message:
  - client sends `{ type: "ping", id: string }`
  - server replies `{ type: "pong", id: string }`

No auth required in milestone 1; later we require access token on connect.

---

## Persistence: Storage Interface (locked in)

The server must not directly depend on SQLite details outside the storage implementation layer.

### Storage responsibilities

- Provide a transaction boundary
- Store/retrieve:
  - campaigns (metadata + current state snapshot reference)
  - entities (actors/items/effects/scenes) as JSON blobs + metadata
  - event log entries (append-only) for audit/replay potential
  - sessions/invites (later)

### Conceptual interface shape

Specific method signatures are defined in the Interface Signatures section below. The storage layer must preserve these concepts:

- `init()`
- `transaction(fn)`
- `getCampaign(campaignId)`
- `createCampaign(meta)`
- `getEntity(entityId)`
- `putEntity(entityId, json, meta)`
- `appendEvent(campaignId, event)`
- `listEvents(campaignId, sinceSeq)`

### SQLite storage pattern

Prefer a JSON-friendly schema:

- entity JSON stored as text/blob
- indexed columns for `campaignId`, `entityType`, `updatedAt`, `ownerSeatId` (as needed)
- event log table with monotonic sequence number

Do not over-normalize in early versions; optimize later.

---

## Static file serving (server-served client)

### Production

- The client build outputs static files into `client/dist/`
- Server serves that directory at `/`

### Development

Two acceptable dev options:

1. Run Vite dev server separately and proxy API calls to the server
2. Server proxies unknown routes to Vite dev server

Requirement: in production, the server must be able to serve a compatible client bundle.

---

## Docker and cloud readiness

### Dockerfile requirements

- Builds client (or assumes client already built) and includes `client/dist` in the image
- Includes server build output
- Uses `DATA_DIR=/data` (mounted volume) by default
- Exposes `PORT`

### Runtime invariants

- Server must start with only env config and a writable data directory
- No interactive prompts required for placeholder server

---

## Logging and observability

- Use structured logs (JSON) suitable for local debugging and cloud aggregators.
- Include request ids for HTTP and connection ids for WS.
- Log key lifecycle events:
  - server start with config summary (excluding secrets)
  - DB init success/failure
  - WS connect/disconnect counts

---

## Security posture (early)

Even in placeholder phase, avoid obvious footguns:

- Default bind to localhost (`HOST=127.0.0.1`)
- Do not put identifiers in URLs as “auth”
- Treat user text as untrusted (sanitization will matter once chat exists)

Auth/session system will evolve, but this baseline prevents accidental exposure.

---

## Interface Signatures

This section defines the concrete interfaces, classes, and function signatures for the server component. Keep this updated as implementation progresses.

### Storage Interface

The storage interface abstracts database operations and must be implementable with SQLite, Postgres, or in-memory stores for testing.

```typescript
/**
 * Main storage interface for the Game Server.
 * Provides transactional access to campaign data, entities, events, and sessions.
 */
interface Storage {
  /**
   * Initialize the storage backend (create tables, run migrations, etc.)
   * Should be idempotent - safe to call multiple times.
   */
  init(): Promise<void>;

  /**
   * Close the storage backend and release resources.
   */
  close(): Promise<void>;

  /**
   * Execute a function within a transaction.
   * If the function throws, the transaction is rolled back.
   * If it returns successfully, the transaction is committed.
   *
   * @param fn - Function to execute within transaction context
   * @returns The return value of fn
   */
  transaction<T>(fn: (tx: StorageTransaction) => Promise<T>): Promise<T>;

  // Campaign operations
  getCampaign(campaignId: string): Promise<Campaign | null>;
  createCampaign(data: CreateCampaignData): Promise<Campaign>;
  updateCampaign(campaignId: string, data: Partial<Campaign>): Promise<void>;
  listCampaigns(): Promise<Campaign[]>;

  // Entity operations (actors, items, effects, scenes)
  getEntity(entityId: string): Promise<Entity | null>;
  putEntity(entity: Entity): Promise<void>;
  deleteEntity(entityId: string): Promise<void>;
  listEntities(campaignId: string, filters?: EntityFilters): Promise<Entity[]>;

  // Event log operations (append-only audit trail)
  appendEvent(campaignId: string, event: GameEvent): Promise<EventRecord>;
  listEvents(
    campaignId: string,
    options?: EventQueryOptions,
  ): Promise<EventRecord[]>;
  getEventsSince(
    campaignId: string,
    sequenceNumber: number,
  ): Promise<EventRecord[]>;

  // Prompt operations (for ruleset engine workflows)
  upsertPrompt(prompt: Prompt): Promise<void>;
  getPrompt(promptId: string): Promise<Prompt | null>;
  deletePrompt(promptId: string): Promise<void>;
  listPrompts(campaignId: string, filters?: PromptFilters): Promise<Prompt[]>;

  // Workflow operations (for multi-step action resolution)
  upsertWorkflow(workflow: WorkflowState): Promise<void>;
  getWorkflow(workflowId: string): Promise<WorkflowState | null>;
  deleteWorkflow(workflowId: string): Promise<void>;
  listWorkflows(campaignId: string): Promise<WorkflowState[]>;

  // Session and auth operations (future)
  createSession(data: CreateSessionData): Promise<Session>;
  getSession(sessionId: string): Promise<Session | null>;
  revokeSession(sessionId: string): Promise<void>;
  listActiveSessions(campaignId: string): Promise<Session[]>;
}

/**
 * Transaction context for batched operations.
 * Provides the same entity/event methods as Storage but within a transaction scope.
 */
interface StorageTransaction {
  // Entity operations within transaction
  getEntity(entityId: string): Promise<Entity | null>;
  putEntity(entity: Entity): Promise<void>;
  deleteEntity(entityId: string): Promise<void>;

  // Event operations within transaction
  appendEvent(campaignId: string, event: GameEvent): Promise<EventRecord>;
}

/**
 * Campaign metadata and state reference
 */
interface Campaign {
  id: string;
  name: string;
  rulesetId: string;
  createdAt: Date;
  updatedAt: Date;
  currentStateSnapshotId?: string;
  settings: Record<string, unknown>;
}

interface CreateCampaignData {
  name: string;
  rulesetId: string;
  settings?: Record<string, unknown>;
}

/**
 * Generic entity stored as JSON with metadata for indexing.
 * EntityType includes: actor, token, item, effect, workflow, scene
 * See shared-types.md for canonical definitions.
 */
interface Entity {
  id: string;
  campaignId: string;
  type: EntityType;
  data: Record<string, unknown>; // Entity-specific data as JSON
  createdAt: Date;
  updatedAt: Date;
  ownerSeatId?: string;
}

// Import from shared-types.md
import type {
  EntityType,
  Audience,
  PromptKind,
  GameEvent,
  Prompt,
  WorkflowState,
} from '../shared-types';

interface EntityFilters {
  type?: EntityType;
  ownerSeatId?: string;
}

/**
 * Event log entry for audit trail and potential replay.
 * GameEvent is defined in shared-types.md.
 */

interface EventRecord extends GameEvent {
  id: string;
  campaignId: string;
  sequenceNumber: number;
  timestamp: Date;
}

interface EventQueryOptions {
  sinceSequenceNumber?: number;
  limit?: number;
  eventTypes?: string[];
}

/**
 * Session tracking for auth (future)
 */
interface Session {
  id: string;
  campaignId: string;
  seatId: string;
  accessToken: string;
  refreshToken: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt?: Date;
}

interface CreateSessionData {
  campaignId: string;
  seatId: string;
  expiresIn: number; // seconds
}

/**
 * Prompt and WorkflowState are defined in shared-types.md.
 * Storage layer uses those canonical types directly.
 */

interface PromptFilters {
  workflowId?: string;
  expired?: boolean;
}
```

### Storage Implementation Notes

- **SQLite implementation**: Store entities as JSON TEXT with indexed columns for `id`, `campaignId`, `type`, `ownerSeatId`, `updatedAt`
- **Transactions**: Use database transactions for `transaction()` method
- **Event sequencing**: Event `sequenceNumber` should be monotonically increasing per campaign
- **ID generation**: Use UUIDs for all IDs; implementation may use a separate `IdGenerator` interface
- **Timestamps**: Store as ISO 8601 strings or Unix timestamps; convert to Date objects in queries

---
