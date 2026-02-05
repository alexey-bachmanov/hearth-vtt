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
- Storage class encapsulates persistence implementation, allowing future database swaps without rewriting server code.

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
- `server/src/storage/` — Storage class + backend implementations (SQLite, etc.)
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

## Persistence: Storage Class (locked in)

The server uses a concrete Storage class for all database operations. Database implementation details (SQLite, Postgres, etc.) are encapsulated within the Storage class via an internal backend interface.

### Design Goals

- **Isolation:** Server code references `Storage` class directly, not database-specific implementations
- **Single point of change:** Switching databases requires editing only `Storage.ts` and backend implementations
- **Type safety:** Concrete class methods provide better IDE support than generic interfaces
- **Testability:** Test backends can be injected via constructor

### Storage responsibilities

- Provide a transaction boundary
- Store/retrieve:
  - campaigns (metadata + current state snapshot reference)
  - entities (actors/items/effects/scenes) as JSON blobs + metadata
  - event log entries (append-only) for audit/replay potential
  - sessions/invites (later)

### Conceptual API shape

Specific method signatures are defined in the Class Signatures section below. The Storage class provides these core operations:

- `init()`
- `transaction(fn)`
- `getCampaign(campaignId)`
- `createCampaign(meta)`
- `getEntity(entityId)`
- `putEntity(entityId, json, meta)`
- `appendEvent(campaignId, event)`
- `listEvents(campaignId, sinceSeq)`

### SQLite backend pattern

The default backend is SQLite with a JSON-friendly schema:

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

## Class Signatures

This section defines the concrete classes and function signatures for the server component. Keep this updated as implementation progresses.

### Storage Class

The Storage class is a concrete facade that server code references directly. It delegates to an internal backend implementation (SQLite, Postgres, or in-memory for testing).

```typescript
/**
 * Main storage class for the Game Server.
 * Provides transactional access to campaign data, entities, events, and sessions.
 *
 * Server code references this class directly. Database implementation is encapsulated
 * via an internal StorageBackend interface.
 */
export class Storage {
  private backend: StorageBackend;

  constructor(backend: StorageBackend) {
    this.backend = backend;
  }

  /**
   * Initialize the storage backend (create tables, run migrations, etc.)
   * Should be idempotent - safe to call multiple times.
   */
  async init(): Promise<void> {
    return this.backend.init();
  }

  /**
   * Close the storage backend and release resources.
   */
  async close(): Promise<void> {
    return this.backend.close();
  }

  /**
   * Execute a function within a transaction.
   * If the function throws, the transaction is rolled back.
   * If it returns successfully, the transaction is committed.
   *
   * @param fn - Function to execute within transaction context
   * @returns The return value of fn
   */
  async transaction<T>(fn: (tx: StorageTransaction) => Promise<T>): Promise<T> {
    return this.backend.transaction(fn);
  }

  // Campaign operations
  async getCampaign(campaignId: string): Promise<Campaign | null> {
    return this.backend.getCampaign(campaignId);
  }

  async createCampaign(data: CreateCampaignData): Promise<Campaign> {
    return this.backend.createCampaign(data);
  }

  async updateCampaign(
    campaignId: string,
    data: Partial<Campaign>,
  ): Promise<void> {
    return this.backend.updateCampaign(campaignId, data);
  }

  async listCampaigns(): Promise<Campaign[]> {
    return this.backend.listCampaigns();
  }

  // Entity operations (actors, items, effects, scenes)
  async getEntity(entityId: string): Promise<Entity | null> {
    return this.backend.getEntity(entityId);
  }

  async putEntity(entity: Entity): Promise<void> {
    return this.backend.putEntity(entity);
  }

  async deleteEntity(entityId: string): Promise<void> {
    return this.backend.deleteEntity(entityId);
  }

  async listEntities(
    campaignId: string,
    filters?: EntityFilters,
  ): Promise<Entity[]> {
    return this.backend.listEntities(campaignId, filters);
  }

  // Event log operations (append-only audit trail)
  async appendEvent(
    campaignId: string,
    event: GameEvent,
  ): Promise<EventRecord> {
    return this.backend.appendEvent(campaignId, event);
  }

  async listEvents(
    campaignId: string,
    options?: EventQueryOptions,
  ): Promise<EventRecord[]> {
    return this.backend.listEvents(campaignId, options);
  }

  async getEventsSince(
    campaignId: string,
    sequenceNumber: number,
  ): Promise<EventRecord[]> {
    return this.backend.getEventsSince(campaignId, sequenceNumber);
  }

  // Prompt operations (for ruleset engine workflows)
  async upsertPrompt(prompt: Prompt): Promise<void> {
    return this.backend.upsertPrompt(prompt);
  }

  async getPrompt(promptId: string): Promise<Prompt | null> {
    return this.backend.getPrompt(promptId);
  }

  async deletePrompt(promptId: string): Promise<void> {
    return this.backend.deletePrompt(promptId);
  }

  async listPrompts(
    campaignId: string,
    filters?: PromptFilters,
  ): Promise<Prompt[]> {
    return this.backend.listPrompts(campaignId, filters);
  }

  // Workflow operations (for multi-step action resolution)
  async upsertWorkflow(workflow: WorkflowState): Promise<void> {
    return this.backend.upsertWorkflow(workflow);
  }

  async getWorkflow(workflowId: string): Promise<WorkflowState | null> {
    return this.backend.getWorkflow(workflowId);
  }

  async deleteWorkflow(workflowId: string): Promise<void> {
    return this.backend.deleteWorkflow(workflowId);
  }

  async listWorkflows(campaignId: string): Promise<WorkflowState[]> {
    return this.backend.listWorkflows(campaignId);
  }

  // Session and auth operations (future)
  async createSession(data: CreateSessionData): Promise<Session> {
    return this.backend.createSession(data);
  }

  async getSession(sessionId: string): Promise<Session | null> {
    return this.backend.getSession(sessionId);
  }

  async revokeSession(sessionId: string): Promise<void> {
    return this.backend.revokeSession(sessionId);
  }

  async listActiveSessions(campaignId: string): Promise<Session[]> {
    return this.backend.listActiveSessions(campaignId);
  }

  // Seat operations
  async createSeat(data: CreateSeatData): Promise<Seat> {
    return this.backend.createSeat(data);
  }

  async getSeat(seatId: string): Promise<Seat | null> {
    return this.backend.getSeat(seatId);
  }

  async updateSeat(seatId: string, data: Partial<Seat>): Promise<void> {
    return this.backend.updateSeat(seatId, data);
  }

  async deleteSeat(seatId: string): Promise<void> {
    // Backend must enforce: cannot delete admin seat
    return this.backend.deleteSeat(seatId);
  }

  async listSeats(campaignId: string): Promise<Seat[]> {
    return this.backend.listSeats(campaignId);
  }

  // Invite operations (admin-only)
  async createInvite(data: CreateInviteData): Promise<Invite> {
    return this.backend.createInvite(data);
  }

  async getInvite(inviteToken: string): Promise<Invite | null> {
    return this.backend.getInvite(inviteToken);
  }

  async revokeInvite(inviteId: string): Promise<void> {
    return this.backend.revokeInvite(inviteId);
  }

  async listInvites(campaignId: string): Promise<Invite[]> {
    return this.backend.listInvites(campaignId);
  }

  async markInviteClaimed(
    inviteId: string,
    claimedBySessionId: string,
    claimedByIp?: string
  ): Promise<void> {
    return this.backend.markInviteClaimed(inviteId, claimedBySessionId, claimedByIp);
  }

  // AuthSession operations
  async createAuthSession(data: CreateAuthSessionData): Promise<AuthSession> {
    return this.backend.createAuthSession(data);
  }

  async getAuthSession(sessionId: string): Promise<AuthSession | null> {
    return this.backend.getAuthSession(sessionId);
  }

  async getAuthSessionByRefreshToken(refreshTokenHash: string): Promise<AuthSession | null> {
    return this.backend.getAuthSessionByRefreshToken(refreshTokenHash);
  }

  async updateAuthSession(sessionId: string, data: Partial<AuthSession>): Promise<void> {
    return this.backend.updateAuthSession(sessionId, data);
  }

  async revokeAuthSession(sessionId: string): Promise<void> {
    return this.backend.revokeAuthSession(sessionId);
  }

  async listAuthSessionsForSeat(seatId: string): Promise<AuthSession[]> {
    return this.backend.listAuthSessionsForSeat(seatId);
  }

/**
 * Internal interface for database-specific implementations.
 * Not exported; only used within the storage module.
 */
interface StorageBackend {
  init(): Promise<void>;
  close(): Promise<void>;
  transaction<T>(fn: (tx: StorageTransaction) => Promise<T>): Promise<T>;

  // Campaign operations
  getCampaign(campaignId: string): Promise<Campaign | null>;
  createCampaign(data: CreateCampaignData): Promise<Campaign>;
  updateCampaign(campaignId: string, data: Partial<Campaign>): Promise<void>;
  listCampaigns(): Promise<Campaign[]>;

  // Entity operations
  getEntity(entityId: string): Promise<Entity | null>;
  putEntity(entity: Entity): Promise<void>;
  deleteEntity(entityId: string): Promise<void>;
  listEntities(campaignId: string, filters?: EntityFilters): Promise<Entity[]>;

  // Event operations
  appendEvent(campaignId: string, event: GameEvent): Promise<EventRecord>;
  listEvents(
    campaignId: string,
    options?: EventQueryOptions,
  ): Promise<EventRecord[]>;
  getEventsSince(
    campaignId: string,
    sequenceNumber: number,
  ): Promise<EventRecord[]>;

  // Prompt operations
  upsertPrompt(prompt: Prompt): Promise<void>;
  getPrompt(promptId: string): Promise<Prompt | null>;
  deletePrompt(promptId: string): Promise<void>;
  listPrompts(campaignId: string, filters?: PromptFilters): Promise<Prompt[]>;

  // Workflow operations
  upsertWorkflow(workflow: WorkflowState): Promise<void>;
  getWorkflow(workflowId: string): Promise<WorkflowState | null>;
  deleteWorkflow(workflowId: string): Promise<void>;
  listWorkflows(campaignId: string): Promise<WorkflowState[]>;

  // Session operations
  createSession(data: CreateSessionData): Promise<Session>;
  getSession(sessionId: string): Promise<Session | null>;
  revokeSession(sessionId: string): Promise<void>;
  listActiveSessions(campaignId: string): Promise<Session[]>;

  // Seat operations
  createSeat(data: CreateSeatData): Promise<Seat>;
  getSeat(seatId: string): Promise<Seat | null>;
  updateSeat(seatId: string, data: Partial<Seat>): Promise<void>;
  deleteSeat(seatId: string): Promise<void>;
  listSeats(campaignId: string): Promise<Seat[]>;

  // Invite operations
  createInvite(data: CreateInviteData): Promise<Invite>;
  getInvite(inviteToken: string): Promise<Invite | null>;
  revokeInvite(inviteId: string): Promise<void>;
  listInvites(campaignId: string): Promise<Invite[]>;
  markInviteClaimed(
    inviteId: string,
    claimedBySessionId: string,
    claimedByIp?: string
  ): Promise<void>;

  // AuthSession operations
  createAuthSession(data: CreateAuthSessionData): Promise<AuthSession>;
  getAuthSession(sessionId: string): Promise<AuthSession | null>;
  getAuthSessionByRefreshToken(refreshTokenHash: string): Promise<AuthSession | null>;
  updateAuthSession(sessionId: string, data: Partial<AuthSession>): Promise<void>;
  revokeAuthSession(sessionId: string): Promise<void>;
  listAuthSessionsForSeat(seatId: string): Promise<AuthSession[]>;
}

/**
 * Factory function for creating Storage instances.
 */
export function createStorage(config: StorageConfig): Storage {
  let backend: StorageBackend;

  switch (config.type) {
    case 'sqlite':
      backend = new SQLiteBackend(config);
      break;
    case 'postgres':
      backend = new PostgresBackend(config);
      break;
    case 'memory':
      backend = new InMemoryBackend();
      break;
    default:
      throw new Error(`Unknown storage type: ${config.type}`);
  }

  return new Storage(backend);
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
 * Campaign creation automatically creates an immutable "admin" seat.
 *
 * Implementation Note:
 * When createCampaign() is called, the Storage backend must:
 * 1. Create the Campaign record
 * 2. Create an "admin" Seat with:
 *    - id: generated UUID
 *    - campaignId: the new campaign's ID
 *    - name: "Admin"
 *    - role: "admin"
 *    - isImmutable: true (cannot be deleted)
 * 3. Return the Campaign record
 *
 * The admin seat is the only seat that can:
 * - Create and revoke invites
 * - Manage other seats (create, update roles, delete)
 * - Import/export campaign data
 * - Manage rulesets and tomes
 *
 * Admin seat holders use a separate admin UI, not the play UI.
 * See auth-join-flow.md for complete authentication specification.
 */

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
 * Seat: Persistent identity within a campaign.
 * Seats survive server restarts and outlive AuthSessions.
 */
interface Seat {
  id: string;
  campaignId: string;
  name: string;
  role: 'admin' | 'gm' | 'player' | 'spectator';
  isImmutable: boolean; // true for admin seat (cannot be deleted)
  createdAt: Date;
  updatedAt: Date;
}

interface CreateSeatData {
  campaignId: string;
  name: string;
  role: 'gm' | 'player' | 'spectator'; // admin seats are only created via createCampaign
}

/**
 * Invite: Capability token for claiming a seat.
 * Managed by admin seat holders.
 */
interface Invite {
  id: string;
  inviteToken: string; // long, unguessable (>= 128 bits entropy)
  campaignId: string;
  seatId?: string; // existing seat, or null if creating new seat on claim
  seatTemplate?: CreateSeatData; // used if seatId is null
  rolesGranted: Array<'gm' | 'player' | 'spectator'>;
  pinHash: string; // argon2/bcrypt hash
  expiresAt: Date;
  maxClaims: number; // typically 1
  claimedAt?: Date;
  claimedBySessionId?: string;
  claimedByIp?: string;
  revokedAt?: Date;
  createdByAdminSeatId: string;
  createdAt: Date;
}

interface CreateInviteData {
  campaignId: string;
  seatId?: string;
  seatTemplate?: CreateSeatData;
  rolesGranted: Array<'gm' | 'player' | 'spectator'>;
  pin: string; // plain text; will be hashed server-side
  expiresIn: number; // seconds (e.g., 7 days = 604800)
  maxClaims?: number; // default 1
  createdByAdminSeatId: string;
}

/**
 * AuthSession: Cookie-based authentication session.
 * Distinct from legacy "Session" concept (server run lifecycle).
 */
interface AuthSession {
  id: string;
  seatId: string;
  campaignId: string;
  refreshTokenHash: string; // hash of refresh token
  deviceName?: string;
  userAgent?: string;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
  revokedAt?: Date;
}

interface CreateAuthSessionData {
  seatId: string;
  campaignId: string;
  refreshToken: string; // plain text; will be hashed server-side
  deviceName?: string;
  userAgent?: string;
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

### CampaignManager Class

The CampaignManager is a server-level singleton that manages GameEngine lifecycle. It creates GameEngine instances on first connection to a campaign and destroys them on inactivity or shutdown.

```typescript
/**
 * Server-level singleton managing GameEngine instances.
 * Handles lifecycle (open/close), inactivity timeouts, and graceful shutdown.
 */
export class CampaignManager {
  private engines: Map<string, GameEngine> = new Map();
  private inactivityTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    private storage: Storage,
    private realtimeHub: RealtimeHub,
    private idGenerator: IdGenerator,
    private logger: Logger,
    private config: {
      inactivityTimeout: number; // ms
    },
  ) {}

  /**
   * Open a campaign and return the GameEngine instance.
   * If already open, returns the existing instance.
   * Loads latest snapshot + events to rebuild CampaignState in memory.
   */
  async openCampaign(campaignId: string): Promise<GameEngine> {
    if (this.engines.has(campaignId)) {
      this.logger.info('Campaign already open', { campaignId });
      return this.engines.get(campaignId)!;
    }

    this.logger.info('Opening campaign', { campaignId });
    const engine = await GameEngine.create(
      campaignId,
      this.storage,
      this.realtimeHub,
      this.idGenerator,
      this.logger.child({ campaignId }),
    );

    this.engines.set(campaignId, engine);
    this.resetInactivityTimer(campaignId);
    return engine;
  }

  /**
   * Close a campaign and release resources.
   * Creates final snapshot before closing.
   */
  async closeCampaign(campaignId: string): Promise<void> {
    const engine = this.engines.get(campaignId);
    if (!engine) return;

    this.logger.info('Closing campaign', { campaignId });
    this.clearInactivityTimer(campaignId);
    await engine.close();
    this.engines.delete(campaignId);
  }

  /**
   * Get an open GameEngine instance.
   * Returns null if campaign is not currently open.
   */
  getEngine(campaignId: string): GameEngine | null {
    return this.engines.get(campaignId) ?? null;
  }

  /**
   * Reset inactivity timer for a campaign.
   * Called when actions are emitted or connections join.
   */
  resetInactivityTimer(campaignId: string): void {
    this.clearInactivityTimer(campaignId);
    const timer = setTimeout(() => {
      this.logger.info('Campaign inactive, closing', { campaignId });
      this.closeCampaign(campaignId);
    }, this.config.inactivityTimeout);
    this.inactivityTimers.set(campaignId, timer);
  }

  private clearInactivityTimer(campaignId: string): void {
    const timer = this.inactivityTimers.get(campaignId);
    if (timer) {
      clearTimeout(timer);
      this.inactivityTimers.delete(campaignId);
    }
  }

  /**
   * Graceful shutdown: close all open campaigns.
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down CampaignManager');
    const closePromises = Array.from(this.engines.keys()).map((campaignId) =>
      this.closeCampaign(campaignId),
    );
    await Promise.all(closePromises);
  }
}
```

### GameEngine Class

The GameEngine class is the authoritative game logic orchestration layer. One instance exists per active campaign. It owns CampaignState in memory, processes Actions sequentially, and delegates pure resolution logic to an embedded RulesetRuntime.

```typescript
/**
 * GameEngine orchestrates game logic for a single campaign.
 * Owns CampaignState in memory, processes Actions sequentially,
 * and delegates resolution to embedded RulesetRuntime.
 */
export class GameEngine {
  private state: CampaignState;
  private runtime: RulesetRuntime;
  private actionQueue: AsyncQueue<Action>;
  private lastSnapshotTime: number;
  private eventsSinceSnapshot: number = 0;

  private constructor(
    private campaignId: string,
    initialState: CampaignState,
    ruleset: Ruleset,
    private storage: Storage,
    private realtimeHub: RealtimeHub,
    private idGenerator: IdGenerator,
    private logger: Logger,
    private config: {
      snapshotEventThreshold: number; // e.g., 100
      snapshotTimeThreshold: number; // ms, e.g., 15 min
      maxRetainedSnapshots: number; // e.g., 3
    },
  ) {
    this.state = initialState;
    this.runtime = new RulesetRuntime(ruleset);
    this.actionQueue = new AsyncQueue();
    this.lastSnapshotTime = Date.now();
  }

  /**
   * Static factory: load campaign, rebuild state from snapshot + events.
   */
  static async create(
    campaignId: string,
    storage: Storage,
    realtimeHub: RealtimeHub,
    idGenerator: IdGenerator,
    logger: Logger,
  ): Promise<GameEngine> {
    logger.info('Creating GameEngine', { campaignId });

    // Load campaign metadata
    const campaign = await storage.getCampaign(campaignId);
    if (!campaign) {
      throw new Error(`Campaign not found: ${campaignId}`);
    }

    // Load ruleset (this would use RulesetLoader in real implementation)
    const ruleset = await loadRuleset(campaign.rulesetId);

    // Load latest snapshot
    const snapshot = campaign.currentStateSnapshotId
      ? await storage.getSnapshot(campaign.currentStateSnapshotId)
      : null;

    // Replay events since snapshot
    const events = snapshot
      ? await storage.getEventsSince(campaignId, snapshot.sequenceNumber)
      : await storage.listEvents(campaignId);

    // Rebuild state
    let state: CampaignState = snapshot?.state ?? createInitialState(ruleset);
    for (const event of events) {
      state = applyEventToState(state, event);
    }

    return new GameEngine(
      campaignId,
      state,
      ruleset,
      storage,
      realtimeHub,
      idGenerator,
      logger,
      {
        snapshotEventThreshold: 100,
        snapshotTimeThreshold: 15 * 60 * 1000, // 15 min
        maxRetainedSnapshots: 3,
      },
    );
  }

  /**
   * Handle an Action emitted by a client.
   * Enqueues the action for sequential processing.
   */
  async handleAction(action: Action, context: ActionContext): Promise<void> {
    this.logger.debug('Action received', { action, context });
    await this.actionQueue.enqueue(() => this.processAction(action, context));
  }

  /**
   * Process a single action (called by queue).
   * Steps: authorize → resolve → persist → broadcast → snapshot if needed.
   */
  private async processAction(
    action: Action,
    context: ActionContext,
  ): Promise<void> {
    try {
      // 1. Authorize
      // (future: check Seat permissions)

      // 2. Resolve via RulesetRuntime
      const resolution = this.runtime.resolve(action, this.state, {
        rng: context.rng,
        clock: context.clock,
        emitterSeatId: context.emitterSeatId,
      });

      // 3. Persist events in transaction
      await this.storage.transaction(async (tx) => {
        for (const event of resolution.events) {
          await tx.appendEvent(this.campaignId, event);
        }
      });

      // 4. Apply events to in-memory state
      for (const event of resolution.events) {
        this.state = applyEventToState(this.state, event);
        this.eventsSinceSnapshot++;
      }

      // 5. Broadcast to clients
      if (resolution.events.length > 0) {
        await this.realtimeHub.broadcastEvents(
          this.campaignId,
          resolution.events,
          resolution.audience ?? 'all',
        );
      }

      if (resolution.patches.length > 0) {
        await this.realtimeHub.broadcastDeltas(
          this.campaignId,
          resolution.patches,
          resolution.audience ?? 'all',
        );
      }

      // 6. Send prompts
      for (const prompt of resolution.prompts) {
        await this.storage.upsertPrompt(prompt);
        await this.realtimeHub.sendPrompts(this.campaignId, [prompt]);
      }

      // 7. Update workflows
      for (const workflow of resolution.workflows) {
        await this.storage.upsertWorkflow(workflow);
      }

      // 8. Check if snapshot needed
      await this.checkAndCreateSnapshot();

      this.logger.info('Action processed successfully', {
        action: action.type,
        events: resolution.events.length,
      });
    } catch (error) {
      this.logger.error('Action processing failed', { action, error });
      // TODO: send error to client via RealtimeHub
    }
  }

  /**
   * Handle workflow input from a client (e.g., answering a prompt).
   */
  async handleWorkflowInput(
    workflowId: string,
    input: WorkflowInput,
  ): Promise<void> {
    // Load workflow state, resume execution
    // (details depend on workflow implementation)
    this.logger.debug('Workflow input received', { workflowId, input });
    // TODO: implement workflow continuation
  }

  /**
   * Get initial sync data for a newly connected client.
   * Returns current CampaignState + recent events.
   */
  async getInitialSync(): Promise<InitialSyncData> {
    const recentEvents = await this.storage.listEvents(this.campaignId, {
      limit: 50,
    });

    return {
      state: this.state,
      recentEvents,
    };
  }

  /**
   * Close the GameEngine and create final snapshot.
   */
  async close(): Promise<void> {
    this.logger.info('Closing GameEngine', { campaignId: this.campaignId });
    await this.createSnapshot();
    // Release resources (nothing to do for now)
  }

  /**
   * Create snapshot if thresholds met.
   */
  private async checkAndCreateSnapshot(): Promise<void> {
    const timeSinceSnapshot = Date.now() - this.lastSnapshotTime;

    if (
      this.eventsSinceSnapshot >= this.config.snapshotEventThreshold ||
      timeSinceSnapshot >= this.config.snapshotTimeThreshold
    ) {
      await this.createSnapshot();
    }
  }

  /**
   * Create and persist a snapshot of current state.
   */
  private async createSnapshot(): Promise<void> {
    this.logger.info('Creating snapshot', { campaignId: this.campaignId });

    const snapshot: Snapshot = {
      id: this.idGenerator.generateId(),
      campaignId: this.campaignId,
      sequenceNumber: this.eventsSinceSnapshot, // TODO: get actual sequence from storage
      state: this.state,
      createdAt: new Date(),
    };

    await this.storage.createSnapshot(snapshot);
    await this.storage.updateCampaign(this.campaignId, {
      currentStateSnapshotId: snapshot.id,
    });

    // Delete old snapshots (retain last N)
    await this.deleteOldSnapshots();

    this.eventsSinceSnapshot = 0;
    this.lastSnapshotTime = Date.now();
  }

  private async deleteOldSnapshots(): Promise<void> {
    const snapshots = await this.storage.listSnapshots(this.campaignId);
    if (snapshots.length > this.config.maxRetainedSnapshots) {
      const toDelete = snapshots
        .sort((a, b) => b.sequenceNumber - a.sequenceNumber)
        .slice(this.config.maxRetainedSnapshots);

      for (const snap of toDelete) {
        await this.storage.deleteSnapshot(snap.id);
      }
    }
  }
}

/**
 * Context passed when processing an action.
 */
interface ActionContext {
  emitterSeatId: string;
  rng: RNG;
  clock: Clock;
}

/**
 * Initial sync data sent to newly connected clients.
 */
interface InitialSyncData {
  state: CampaignState;
  recentEvents: EventRecord[];
}
```

See [ruleset-engine.md](ruleset-engine.md) for complete GameEngine specification, including RulesetRuntime, dependency interfaces (RealtimeHub, IdGenerator, Logger), and action resolution pipeline details.

### Storage Implementation Notes

- **Architecture:** Storage class delegates to internal StorageBackend implementations (SQLiteBackend, PostgresBackend, InMemoryBackend)
- **Benefits:** Changing database only requires updating backend implementations and factory, not call sites throughout server code
- **SQLite backend**: Store entities as JSON TEXT with indexed columns for `id`, `campaignId`, `type`, `ownerSeatId`, `updatedAt`
- **Postgres backend** (future): Similar JSON approach with JSONB columns for better querying
- **Transactions**: Backend implementations use database transactions for `transaction()` method
- **Event sequencing**: Event `sequenceNumber` should be monotonically increasing per campaign
- **ID generation**: Use UUIDs for all IDs; implementation may use a separate `IdGenerator` utility
- **Timestamps**: Store as ISO 8601 strings or Unix timestamps; convert to Date objects in queries
- **Admin seat creation**: When `createCampaign()` is called, automatically create an immutable admin seat
- **Invite tokens**: Must be >= 128 bits entropy; store only hash of PIN
- **Refresh tokens**: Store only hash (argon2/bcrypt); rotate on each refresh
- **Rate limiting**: Implement rate limiting for invite PIN attempts (per invite, per IP)

See [auth-join-flow.md](auth-join-flow.md) and [ADR 005](../decisions/005-networking-management.md) for authentication architecture details.

### Usage Example

```typescript
// Server initialization
const storage = createStorage({
  type: 'sqlite',
  path: path.join(dataDir, 'db.sqlite'),
});

await storage.init();

// Usage throughout server code
const campaign = await storage.getCampaign(campaignId);
const actors = await storage.listEntities(campaignId, { type: 'actor' });
await storage.appendEvent(campaignId, gameEvent);

// No need to import SQLiteStorage or know about backend details
// Switching to Postgres only requires changing createStorage() config
```

---
