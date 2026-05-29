import Database from 'better-sqlite3';
import path from 'path';
import { randomUUID } from 'crypto';
import type {
  StorageBackend,
  Campaign,
  Entity,
  Event,
  ServerAdmin,
  AdminSession,
  Seat,
  Invite,
  AuthSession,
  PlayerAccount,
} from './storage.js';

/** Raw SQLite row shape for entity records */
interface EntityRow {
  id: string;
  type: string;
  data: string;
  createdAt: number;
  updatedAt: number;
}

/** Raw SQLite row shape for event records */
interface EventRow {
  id: string;
  entityId: string;
  type: string;
  data: string;
  seq: number;
  timestamp: number;
}

/** Raw SQLite row shape for seat records */
interface SeatRow {
  id: string;
  campaignId: string;
  displayName: string;
  accountId: string | null;
  role: Seat['role'];
  isActive: number;
  createdAt: number;
  updatedAt: number;
}

/** Raw SQLite row shape for player account records */
interface PlayerAccountRow {
  id: string;
  username: string;
  passwordHash: string;
  mustChangePassword: number; // 0 or 1
  createdAt: number;
  updatedAt: number;
  lastLoginAt: number | null;
}

/**
 * SQLite-based storage implementation using a single combined database (hearth.db).
 *
 * All campaign and server-level data lives in one database file per server
 * instance. Campaign isolation is enforced by `campaign_id` foreign keys with
 * ON DELETE CASCADE, so deleting a campaign atomically removes all child rows.
 *
 * Pass `dataDir: ':memory:'` to open an in-memory database — useful for
 * integration tests that need a real SQL engine without touching the filesystem.
 *
 * See docs/decisions/009-combined-sqlite-db.md for the full rationale.
 *
 * Note: Server code should use the Storage facade, not this class directly.
 */
export class SqliteStorage implements StorageBackend {
  private dataDir: string;
  private db: Database.Database | null = null;

  constructor(options: { dataDir: string }) {
    this.dataDir = options.dataDir;
  }

  /**
   * Return the open database or throw if init() has not been called.
   */
  private ensureDb(): Database.Database {
    if (!this.db) {
      throw new Error('Storage not initialized. Call init() first.');
    }
    return this.db;
  }

  /**
   * Create all tables and indexes in the combined database.
   * Uses CREATE TABLE IF NOT EXISTS so it is safe to call on every startup.
   */
  private initSchema(): void {
    const db = this.ensureDb();
    db.exec(`
      -- Campaigns table
      CREATE TABLE IF NOT EXISTS campaigns (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_campaigns_created_at ON campaigns(created_at);
      CREATE INDEX IF NOT EXISTS idx_campaigns_name ON campaigns(name);

      -- Server admin table (one row per server)
      CREATE TABLE IF NOT EXISTS server_admin (
        id TEXT PRIMARY KEY,
        username_or_email TEXT NOT NULL,
        pin_hash TEXT,
        password_hash TEXT,
        setup_pin_expires_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      -- Admin sessions table (server-level admin authentication)
      CREATE TABLE IF NOT EXISTS admin_sessions (
        id TEXT PRIMARY KEY,
        admin_id TEXT NOT NULL,
        session_token_hash TEXT NOT NULL,
        csrf_token TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        last_used_at INTEGER NOT NULL,
        revoked_at INTEGER,
        FOREIGN KEY (admin_id) REFERENCES server_admin(id)
      );

      CREATE INDEX IF NOT EXISTS idx_admin_sessions_token ON admin_sessions(session_token_hash);
      CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin_id ON admin_sessions(admin_id);
      CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at ON admin_sessions(expires_at);

      -- Player accounts table (per-server player identities, per ADR-010)
      CREATE TABLE IF NOT EXISTS player_accounts (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        must_change_password INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_login_at INTEGER
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_player_accounts_username ON player_accounts(username);
      CREATE INDEX IF NOT EXISTS idx_player_accounts_created_at ON player_accounts(created_at);

      -- Entities table (campaign-scoped game objects)
      CREATE TABLE IF NOT EXISTS entities (
        id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL,
        type TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_entities_campaign_id ON entities(campaign_id);
      CREATE INDEX IF NOT EXISTS idx_entities_campaign_type ON entities(campaign_id, type);
      CREATE INDEX IF NOT EXISTS idx_entities_created_at ON entities(created_at);

      -- Events table (campaign-scoped event log)
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL,
        entity_id TEXT,
        type TEXT NOT NULL,
        data TEXT NOT NULL,
        seq INTEGER NOT NULL,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_events_campaign_timestamp ON events(campaign_id, timestamp);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_events_campaign_seq ON events(campaign_id, seq);
      CREATE INDEX IF NOT EXISTS idx_events_entity_id ON events(entity_id);
      CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);

      -- Seats table (campaign-scoped player identities)
      CREATE TABLE IF NOT EXISTS seats (
        id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('gm', 'player', 'spectator')),
        account_id TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
        FOREIGN KEY (account_id) REFERENCES player_accounts(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_seats_campaign_id ON seats(campaign_id);
      CREATE INDEX IF NOT EXISTS idx_seats_role ON seats(role);
      CREATE INDEX IF NOT EXISTS idx_seats_account_id ON seats(account_id);

      -- Invites table (capability tokens for claiming seats)
      CREATE TABLE IF NOT EXISTS invites (
        id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL,
        seat_id TEXT NOT NULL,
        invite_token TEXT NOT NULL UNIQUE,
        pin_hash TEXT NOT NULL,
        max_uses INTEGER NOT NULL,
        uses_remaining INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        revoked_at INTEGER,
        FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
        FOREIGN KEY (seat_id) REFERENCES seats(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_invites_token ON invites(invite_token);
      CREATE INDEX IF NOT EXISTS idx_invites_campaign_id ON invites(campaign_id);
      CREATE INDEX IF NOT EXISTS idx_invites_seat_id ON invites(seat_id);
      CREATE INDEX IF NOT EXISTS idx_invites_expires_at ON invites(expires_at);

      -- Auth sessions table (account-scoped authentication, per ADR-010)
      CREATE TABLE IF NOT EXISTS auth_sessions (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        refresh_token_hash TEXT NOT NULL UNIQUE,
        access_token_hash TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        last_used_at INTEGER NOT NULL,
        revoked_at INTEGER,
        FOREIGN KEY (account_id) REFERENCES player_accounts(id) ON DELETE CASCADE
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_sessions_refresh_token ON auth_sessions(refresh_token_hash);
      CREATE INDEX IF NOT EXISTS idx_auth_sessions_account_id ON auth_sessions(account_id);
      CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions(expires_at);

      -- Snapshots table (one row per campaign; replaced on each snapshot write)
      -- Stores the engine's serialised CampaignState blob so open() can seed
      -- from a snapshot and replay only events with seq > snapshot.seq.
      -- Auto-snapshot trigger and pruning are deferred (see todo.md tech debt).
      CREATE TABLE IF NOT EXISTS snapshots (
        campaign_id TEXT PRIMARY KEY,
        seq INTEGER NOT NULL,
        data_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
      );
    `);
  }

  /**
   * Initialize the storage system.
   * Opens (or creates) the database file and ensures the schema is up to date.
   * Pass dataDir ':memory:' for an in-memory database (tests only).
   */
  async init(): Promise<void> {
    const dbPath =
      this.dataDir === ':memory:'
        ? ':memory:'
        : path.join(this.dataDir, 'db', 'hearth.db');
    this.db = new Database(dbPath);
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('journal_mode = WAL');
    this.initSchema();
  }

  /**
   * Close the database connection.
   * Called during graceful shutdown.
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Campaign operations
  // ---------------------------------------------------------------------------

  async createCampaign(name: string): Promise<Campaign> {
    const db = this.ensureDb();
    const id = randomUUID();
    const now = Date.now();

    const campaign: Campaign = {
      id,
      name,
      createdAt: now,
      updatedAt: now,
    };

    const stmt = db.prepare(`
      INSERT INTO campaigns (id, name, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(
      campaign.id,
      campaign.name,
      campaign.createdAt,
      campaign.updatedAt,
    );

    return campaign;
  }

  async getCampaign(id: string): Promise<Campaign | null> {
    const db = this.ensureDb();

    const stmt = db.prepare(`
      SELECT id, name, created_at as createdAt, updated_at as updatedAt
      FROM campaigns
      WHERE id = ?
    `);

    const row = stmt.get(id) as Campaign | undefined;
    return row ?? null;
  }

  async listCampaigns(): Promise<Campaign[]> {
    const db = this.ensureDb();

    const stmt = db.prepare(`
      SELECT id, name, created_at as createdAt, updated_at as updatedAt
      FROM campaigns
      ORDER BY created_at DESC
    `);

    return stmt.all() as Campaign[];
  }

  async deleteCampaign(id: string): Promise<void> {
    const db = this.ensureDb();

    // ON DELETE CASCADE on all child tables handles cleanup automatically.
    const stmt = db.prepare(`DELETE FROM campaigns WHERE id = ?`);
    stmt.run(id);
  }

  // ---------------------------------------------------------------------------
  // Entity operations
  // ---------------------------------------------------------------------------

  async createEntity(
    campaignId: string,
    type: string,
    data: Record<string, unknown>,
  ): Promise<Entity> {
    const db = this.ensureDb();
    const id = randomUUID();
    const now = Date.now();

    const entity: Entity = {
      id,
      campaignId,
      type,
      data,
      createdAt: now,
      updatedAt: now,
    };

    const stmt = db.prepare(`
      INSERT INTO entities (id, campaign_id, type, data, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      entity.id,
      entity.campaignId,
      entity.type,
      JSON.stringify(entity.data),
      entity.createdAt,
      entity.updatedAt,
    );

    return entity;
  }

  async getEntity(
    campaignId: string,
    entityId: string,
  ): Promise<Entity | null> {
    const db = this.ensureDb();

    const stmt = db.prepare(`
      SELECT id, type, data, created_at as createdAt, updated_at as updatedAt
      FROM entities
      WHERE id = ? AND campaign_id = ?
    `);

    const row = stmt.get(entityId, campaignId) as EntityRow | undefined;
    if (!row) return null;

    return {
      id: row.id,
      campaignId,
      type: row.type,
      data: JSON.parse(row.data),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async updateEntity(
    campaignId: string,
    entityId: string,
    data: Record<string, unknown>,
  ): Promise<Entity> {
    const db = this.ensureDb();
    const now = Date.now();

    const stmt = db.prepare(`
      UPDATE entities
      SET data = ?, updated_at = ?
      WHERE id = ? AND campaign_id = ?
    `);
    stmt.run(JSON.stringify(data), now, entityId, campaignId);

    const entity = await this.getEntity(campaignId, entityId);
    if (!entity) {
      throw new Error(`Entity ${entityId} not found in campaign ${campaignId}`);
    }

    return entity;
  }

  async deleteEntity(campaignId: string, entityId: string): Promise<void> {
    const db = this.ensureDb();

    const stmt = db.prepare(`
      DELETE FROM entities WHERE id = ? AND campaign_id = ?
    `);
    stmt.run(entityId, campaignId);
  }

  async listEntities(campaignId: string, type?: string): Promise<Entity[]> {
    const db = this.ensureDb();

    let rows: EntityRow[];

    if (type) {
      const stmt = db.prepare(`
        SELECT id, type, data, created_at as createdAt, updated_at as updatedAt
        FROM entities
        WHERE campaign_id = ? AND type = ?
        ORDER BY created_at DESC
      `);
      rows = stmt.all(campaignId, type) as EntityRow[];
    } else {
      const stmt = db.prepare(`
        SELECT id, type, data, created_at as createdAt, updated_at as updatedAt
        FROM entities
        WHERE campaign_id = ?
        ORDER BY created_at DESC
      `);
      rows = stmt.all(campaignId) as EntityRow[];
    }

    return rows.map((row) => ({
      id: row.id,
      campaignId,
      type: row.type,
      data: JSON.parse(row.data),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  // ---------------------------------------------------------------------------
  // Event log operations
  // ---------------------------------------------------------------------------

  async appendEvent(
    campaignId: string,
    event: Omit<Event, 'id' | 'seq' | 'timestamp'>,
  ): Promise<Event> {
    const db = this.ensureDb();
    const id = randomUUID();
    const timestamp = Date.now();

    // Assign the next seq for this campaign atomically (SQLite single-writer).
    const maxRow = db
      .prepare(
        'SELECT COALESCE(MAX(seq), 0) AS maxSeq FROM events WHERE campaign_id = ?',
      )
      .get(campaignId) as { maxSeq: number };
    const seq = maxRow.maxSeq + 1;

    const fullEvent: Event = {
      id,
      ...event,
      seq,
      timestamp,
    };

    const stmt = db.prepare(`
      INSERT INTO events (id, campaign_id, entity_id, type, data, seq, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      fullEvent.id,
      campaignId,
      fullEvent.entityId,
      fullEvent.type,
      JSON.stringify(fullEvent.data),
      fullEvent.seq,
      fullEvent.timestamp,
    );

    return fullEvent;
  }

  async getEvents(
    campaignId: string,
    options?: {
      afterTimestamp?: number;
      afterSeq?: number;
      entityId?: string;
      type?: string;
      limit?: number;
    },
  ): Promise<Event[]> {
    const db = this.ensureDb();

    let query = `
      SELECT id, entity_id as entityId, type, data, seq, timestamp
      FROM events
      WHERE campaign_id = ?
    `;
    const params: unknown[] = [campaignId];

    if (options?.afterTimestamp !== undefined) {
      query += ` AND timestamp > ?`;
      params.push(options.afterTimestamp);
    }

    if (options?.afterSeq !== undefined) {
      query += ` AND seq > ?`;
      params.push(options.afterSeq);
    }

    if (options?.entityId) {
      query += ` AND entity_id = ?`;
      params.push(options.entityId);
    }

    if (options?.type) {
      query += ` AND type = ?`;
      params.push(options.type);
    }

    query += ` ORDER BY seq ASC`;

    if (options?.limit) {
      query += ` LIMIT ?`;
      params.push(options.limit);
    }

    const stmt = db.prepare(query);
    const rows = stmt.all(...params) as EventRow[];

    return rows.map((row) => ({
      id: row.id,
      campaignId,
      entityId: row.entityId,
      type: row.type,
      data: JSON.parse(row.data),
      seq: row.seq,
      timestamp: row.timestamp,
    }));
  }

  async getMaxEventSeq(campaignId: string): Promise<number> {
    const db = this.ensureDb();
    const row = db
      .prepare(
        'SELECT COALESCE(MAX(seq), 0) AS maxSeq FROM events WHERE campaign_id = ?',
      )
      .get(campaignId) as { maxSeq: number };
    return row.maxSeq;
  }

  // ---------------------------------------------------------------------------
  // Snapshot operations
  // ---------------------------------------------------------------------------

  async getLatestSnapshot(
    campaignId: string,
  ): Promise<{ seq: number; blob: unknown } | null> {
    const db = this.ensureDb();
    const row = db
      .prepare('SELECT seq, data_json FROM snapshots WHERE campaign_id = ?')
      .get(campaignId) as { seq: number; data_json: string } | undefined;
    if (!row) return null;
    return { seq: row.seq, blob: JSON.parse(row.data_json) };
  }

  async putSnapshot(
    campaignId: string,
    seq: number,
    blob: unknown,
  ): Promise<void> {
    const db = this.ensureDb();
    db.prepare(
      `INSERT INTO snapshots (campaign_id, seq, data_json, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(campaign_id) DO UPDATE SET
         seq = excluded.seq,
         data_json = excluded.data_json,
         created_at = excluded.created_at`,
    ).run(campaignId, seq, JSON.stringify(blob), Date.now());
  }

  // ---------------------------------------------------------------------------
  // Transaction support
  // ---------------------------------------------------------------------------

  async beginTransaction(_campaignId: string): Promise<void> {
    throw new Error('Transactions not yet implemented');
  }

  async commitTransaction(_campaignId: string): Promise<void> {
    throw new Error('Transactions not yet implemented');
  }

  async rollbackTransaction(_campaignId: string): Promise<void> {
    throw new Error('Transactions not yet implemented');
  }

  // ---------------------------------------------------------------------------
  // Server admin operations
  // ---------------------------------------------------------------------------

  /**
   * Get the server admin (only one exists per server).
   */
  async getServerAdmin(): Promise<ServerAdmin | null> {
    const db = this.ensureDb();

    const stmt = db.prepare(`
      SELECT
        id,
        username_or_email as usernameOrEmail,
        pin_hash as pinHash,
        password_hash as passwordHash,
        setup_pin_expires_at as setupPinExpiresAt,
        created_at as createdAt,
        updated_at as updatedAt
      FROM server_admin
      LIMIT 1
    `);

    const row = stmt.get() as ServerAdmin | undefined;
    return row ?? null;
  }

  /**
   * Create the server admin (should only be called once on first server startup).
   */
  async createServerAdmin(data: {
    usernameOrEmail: string;
    pinHash: string;
    setupPinExpiresAt: number;
  }): Promise<ServerAdmin> {
    const db = this.ensureDb();
    const id = randomUUID();
    const now = Date.now();

    const admin: ServerAdmin = {
      id,
      usernameOrEmail: data.usernameOrEmail,
      pinHash: data.pinHash,
      passwordHash: null,
      setupPinExpiresAt: data.setupPinExpiresAt,
      createdAt: now,
      updatedAt: now,
    };

    const stmt = db.prepare(`
      INSERT INTO server_admin (
        id, username_or_email, pin_hash, password_hash,
        setup_pin_expires_at, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      admin.id,
      admin.usernameOrEmail,
      admin.pinHash,
      admin.passwordHash,
      admin.setupPinExpiresAt,
      admin.createdAt,
      admin.updatedAt,
    );

    return admin;
  }

  /**
   * Update server admin (typically to set password after first setup).
   */
  async updateServerAdmin(
    adminId: string,
    data: Partial<
      Pick<ServerAdmin, 'pinHash' | 'passwordHash' | 'setupPinExpiresAt'>
    >,
  ): Promise<void> {
    const db = this.ensureDb();

    const updates: string[] = [];
    const values: unknown[] = [];

    if (data.pinHash !== undefined) {
      updates.push('pin_hash = ?');
      values.push(data.pinHash);
    }

    if (data.passwordHash !== undefined) {
      updates.push('password_hash = ?');
      values.push(data.passwordHash);
    }

    if (data.setupPinExpiresAt !== undefined) {
      updates.push('setup_pin_expires_at = ?');
      values.push(data.setupPinExpiresAt);
    }

    if (updates.length === 0) {
      return;
    }

    updates.push('updated_at = ?');
    values.push(Date.now());
    values.push(adminId);

    const stmt = db.prepare(`
      UPDATE server_admin
      SET ${updates.join(', ')}
      WHERE id = ?
    `);
    stmt.run(...values);
  }

  // ---------------------------------------------------------------------------
  // Admin session operations
  // ---------------------------------------------------------------------------

  /**
   * Create an admin session.
   */
  async createAdminSession(data: {
    adminId: string;
    sessionTokenHash: string;
    csrfToken: string;
    expiresAt: number;
  }): Promise<AdminSession> {
    const db = this.ensureDb();
    const id = randomUUID();
    const now = Date.now();

    const session: AdminSession = {
      id,
      adminId: data.adminId,
      sessionTokenHash: data.sessionTokenHash,
      csrfToken: data.csrfToken,
      expiresAt: data.expiresAt,
      createdAt: now,
      lastUsedAt: now,
      revokedAt: null,
    };

    const stmt = db.prepare(`
      INSERT INTO admin_sessions (
        id, admin_id, session_token_hash, csrf_token, expires_at,
        created_at, last_used_at, revoked_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      session.id,
      session.adminId,
      session.sessionTokenHash,
      session.csrfToken,
      session.expiresAt,
      session.createdAt,
      session.lastUsedAt,
      session.revokedAt,
    );

    return session;
  }

  /**
   * Get an admin session by token hash.
   */
  async getAdminSession(
    sessionTokenHash: string,
  ): Promise<AdminSession | null> {
    const db = this.ensureDb();

    const stmt = db.prepare(`
      SELECT
        id,
        admin_id as adminId,
        session_token_hash as sessionTokenHash,
        csrf_token as csrfToken,
        expires_at as expiresAt,
        created_at as createdAt,
        last_used_at as lastUsedAt,
        revoked_at as revokedAt
      FROM admin_sessions
      WHERE session_token_hash = ? AND revoked_at IS NULL
    `);

    const row = stmt.get(sessionTokenHash) as AdminSession | undefined;
    return row ?? null;
  }

  /**
   * Revoke an admin session.
   */
  async revokeAdminSession(sessionId: string): Promise<void> {
    const db = this.ensureDb();

    const stmt = db.prepare(`
      UPDATE admin_sessions SET revoked_at = ? WHERE id = ?
    `);
    stmt.run(Date.now(), sessionId);
  }

  /**
   * List all admin sessions (active and revoked).
   */
  async listAdminSessions(): Promise<AdminSession[]> {
    const db = this.ensureDb();

    const stmt = db.prepare(`
      SELECT
        id,
        admin_id as adminId,
        session_token_hash as sessionTokenHash,
        csrf_token as csrfToken,
        expires_at as expiresAt,
        created_at as createdAt,
        last_used_at as lastUsedAt,
        revoked_at as revokedAt
      FROM admin_sessions
      ORDER BY created_at DESC
    `);

    return stmt.all() as AdminSession[];
  }

  /**
   * Delete expired and revoked admin sessions.
   * Should be called periodically to prevent database bloat.
   */
  async cleanupExpiredAdminSessions(): Promise<void> {
    const db = this.ensureDb();

    const now = Date.now();
    const stmt = db.prepare(`
      DELETE FROM admin_sessions
      WHERE expires_at < ? OR revoked_at IS NOT NULL
    `);
    stmt.run(now);
  }

  // ---------------------------------------------------------------------------
  // Seat operations
  // ---------------------------------------------------------------------------

  /**
   * Create a seat in a campaign.
   */
  async createSeat(data: {
    campaignId: string;
    displayName: string;
    role: 'gm' | 'player' | 'spectator';
  }): Promise<Seat> {
    const db = this.ensureDb();
    const id = randomUUID();
    const now = Date.now();

    const seat: Seat = {
      id,
      campaignId: data.campaignId,
      displayName: data.displayName,
      role: data.role,
      accountId: null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    const stmt = db.prepare(`
      INSERT INTO seats (
        id, campaign_id, display_name, role, account_id, is_active,
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      seat.id,
      seat.campaignId,
      seat.displayName,
      seat.role,
      seat.accountId,
      seat.isActive ? 1 : 0,
      seat.createdAt,
      seat.updatedAt,
    );

    return seat;
  }

  /**
   * Get a seat by ID within a campaign.
   */
  async getSeat(campaignId: string, seatId: string): Promise<Seat | null> {
    const db = this.ensureDb();

    const stmt = db.prepare(`
      SELECT
        id,
        campaign_id as campaignId,
        display_name as displayName,
        role,
        account_id as accountId,
        is_active as isActive,
        created_at as createdAt,
        updated_at as updatedAt
      FROM seats
      WHERE id = ? AND campaign_id = ?
    `);

    const row = stmt.get(seatId, campaignId) as SeatRow | undefined;
    if (!row) return null;

    return {
      ...row,
      isActive: row.isActive === 1,
    };
  }

  /**
   * List all seats for a campaign.
   */
  async listSeats(campaignId: string): Promise<Seat[]> {
    const db = this.ensureDb();

    const stmt = db.prepare(`
      SELECT
        id,
        campaign_id as campaignId,
        display_name as displayName,
        role,
        account_id as accountId,
        is_active as isActive,
        created_at as createdAt,
        updated_at as updatedAt
      FROM seats
      WHERE campaign_id = ?
      ORDER BY created_at DESC
    `);

    const rows = stmt.all(campaignId) as SeatRow[];
    return rows.map((row) => ({
      ...row,
      isActive: row.isActive === 1,
    }));
  }

  /**
   * Update a seat's mutable fields.
   */
  async updateSeat(
    campaignId: string,
    seatId: string,
    data: Partial<
      Pick<Seat, 'displayName' | 'role' | 'isActive' | 'accountId'>
    >,
  ): Promise<void> {
    const db = this.ensureDb();

    const updates: string[] = [];
    const values: unknown[] = [];

    if (data.displayName !== undefined) {
      updates.push('display_name = ?');
      values.push(data.displayName);
    }

    if (data.role !== undefined) {
      updates.push('role = ?');
      values.push(data.role);
    }

    if (data.isActive !== undefined) {
      updates.push('is_active = ?');
      values.push(data.isActive ? 1 : 0);
    }

    if ('accountId' in data) {
      updates.push('account_id = ?');
      values.push(data.accountId ?? null);
    }

    if (updates.length === 0) {
      return;
    }

    updates.push('updated_at = ?');
    values.push(Date.now());
    values.push(seatId);
    values.push(campaignId);

    const stmt = db.prepare(`
      UPDATE seats
      SET ${updates.join(', ')}
      WHERE id = ? AND campaign_id = ?
    `);
    stmt.run(...values);
  }

  /**
   * Delete a seat. Cascades to invites and auth_sessions via foreign key.
   */
  async deleteSeat(campaignId: string, seatId: string): Promise<void> {
    const db = this.ensureDb();

    const stmt = db.prepare(`
      DELETE FROM seats WHERE id = ? AND campaign_id = ?
    `);
    stmt.run(seatId, campaignId);
  }

  // ---------------------------------------------------------------------------
  // Invite operations
  // ---------------------------------------------------------------------------

  /**
   * Create an invite for a seat.
   */
  async createInvite(data: {
    campaignId: string;
    seatId: string;
    inviteToken: string;
    pinHash: string;
    maxUses: number;
    expiresAt: number;
  }): Promise<Invite> {
    const db = this.ensureDb();
    const id = randomUUID();
    const now = Date.now();

    const invite: Invite = {
      id,
      seatId: data.seatId,
      inviteToken: data.inviteToken,
      pinHash: data.pinHash,
      maxUses: data.maxUses,
      usesRemaining: data.maxUses,
      expiresAt: data.expiresAt,
      createdAt: now,
      revokedAt: null,
    };

    const stmt = db.prepare(`
      INSERT INTO invites (
        id, campaign_id, seat_id, invite_token, pin_hash,
        max_uses, uses_remaining, expires_at, created_at, revoked_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      invite.id,
      data.campaignId,
      invite.seatId,
      invite.inviteToken,
      invite.pinHash,
      invite.maxUses,
      invite.usesRemaining,
      invite.expiresAt,
      invite.createdAt,
      invite.revokedAt,
    );

    return invite;
  }

  /**
   * Get an invite by token.
   */
  async getInvite(inviteToken: string): Promise<Invite | null> {
    const db = this.ensureDb();

    const stmt = db.prepare(`
      SELECT
        id,
        seat_id as seatId,
        invite_token as inviteToken,
        pin_hash as pinHash,
        max_uses as maxUses,
        uses_remaining as usesRemaining,
        expires_at as expiresAt,
        created_at as createdAt,
        revoked_at as revokedAt
      FROM invites
      WHERE invite_token = ?
    `);

    const row = stmt.get(inviteToken) as Invite | undefined;
    return row ?? null;
  }

  /**
   * List all invites for a seat.
   */
  async listInvitesForSeat(
    campaignId: string,
    seatId: string,
  ): Promise<Invite[]> {
    const db = this.ensureDb();

    const stmt = db.prepare(`
      SELECT
        id,
        seat_id as seatId,
        invite_token as inviteToken,
        pin_hash as pinHash,
        max_uses as maxUses,
        uses_remaining as usesRemaining,
        expires_at as expiresAt,
        created_at as createdAt,
        revoked_at as revokedAt
      FROM invites
      WHERE campaign_id = ? AND seat_id = ?
      ORDER BY created_at DESC
    `);

    return stmt.all(campaignId, seatId) as Invite[];
  }

  /**
   * Revoke an invite by token.
   */
  async revokeInvite(inviteToken: string): Promise<void> {
    const db = this.ensureDb();

    const stmt = db.prepare(`
      UPDATE invites SET revoked_at = ? WHERE invite_token = ?
    `);
    stmt.run(Date.now(), inviteToken);
  }

  /**
   * Decrement invite uses remaining (called when invite is claimed).
   */
  async decrementInviteUses(inviteToken: string): Promise<void> {
    const db = this.ensureDb();

    const stmt = db.prepare(`
      UPDATE invites
      SET uses_remaining = uses_remaining - 1
      WHERE invite_token = ? AND uses_remaining > 0
    `);
    stmt.run(inviteToken);
  }

  // ---------------------------------------------------------------------------
  // Player account operations
  // ---------------------------------------------------------------------------

  /**
   * Create a player account.
   */
  async createPlayerAccount(data: {
    username: string;
    passwordHash: string;
  }): Promise<PlayerAccount> {
    const db = this.ensureDb();
    const id = randomUUID();
    const now = Date.now();

    const account: PlayerAccount = {
      id,
      username: data.username,
      passwordHash: data.passwordHash,
      mustChangePassword: false,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: null,
    };

    const stmt = db.prepare(`
      INSERT INTO player_accounts (
        id, username, password_hash, must_change_password,
        created_at, updated_at, last_login_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      account.id,
      account.username,
      account.passwordHash,
      0,
      account.createdAt,
      account.updatedAt,
      account.lastLoginAt,
    );

    return account;
  }

  /**
   * Get a player account by username. Case-sensitive (usernames are stored as-is).
   */
  async getPlayerAccountByUsername(
    username: string,
  ): Promise<PlayerAccount | null> {
    const db = this.ensureDb();

    const stmt = db.prepare(`
      SELECT
        id, username,
        password_hash as passwordHash,
        must_change_password as mustChangePassword,
        created_at as createdAt,
        updated_at as updatedAt,
        last_login_at as lastLoginAt
      FROM player_accounts
      WHERE username = ?
    `);

    const row = stmt.get(username) as PlayerAccountRow | undefined;
    if (!row) return null;
    return { ...row, mustChangePassword: row.mustChangePassword === 1 };
  }

  /**
   * Get a player account by ID.
   */
  async getPlayerAccountById(id: string): Promise<PlayerAccount | null> {
    const db = this.ensureDb();

    const stmt = db.prepare(`
      SELECT
        id, username,
        password_hash as passwordHash,
        must_change_password as mustChangePassword,
        created_at as createdAt,
        updated_at as updatedAt,
        last_login_at as lastLoginAt
      FROM player_accounts
      WHERE id = ?
    `);

    const row = stmt.get(id) as PlayerAccountRow | undefined;
    if (!row) return null;
    return { ...row, mustChangePassword: row.mustChangePassword === 1 };
  }

  /**
   * Set last_login_at to now for an account (called on successful login).
   */
  async updatePlayerAccountLastLogin(id: string): Promise<void> {
    const db = this.ensureDb();
    const now = Date.now();

    const stmt = db.prepare(`
      UPDATE player_accounts SET last_login_at = ?, updated_at = ? WHERE id = ?
    `);
    stmt.run(now, now, id);
  }

  /**
   * Set must_change_password flag and optionally update the password hash.
   * Used by admin reset-password flow.
   */
  async setPlayerAccountMustChangePassword(
    id: string,
    mustChangePassword: boolean,
    newPasswordHash?: string,
  ): Promise<void> {
    const db = this.ensureDb();
    const now = Date.now();

    if (newPasswordHash !== undefined) {
      const stmt = db.prepare(`
        UPDATE player_accounts
        SET must_change_password = ?, password_hash = ?, updated_at = ?
        WHERE id = ?
      `);
      stmt.run(mustChangePassword ? 1 : 0, newPasswordHash, now, id);
    } else {
      const stmt = db.prepare(`
        UPDATE player_accounts
        SET must_change_password = ?, updated_at = ?
        WHERE id = ?
      `);
      stmt.run(mustChangePassword ? 1 : 0, now, id);
    }
  }

  /**
   * List all player accounts, ordered by creation time descending.
   */
  async listPlayerAccounts(): Promise<PlayerAccount[]> {
    const db = this.ensureDb();

    const stmt = db.prepare(`
      SELECT
        id, username,
        password_hash as passwordHash,
        must_change_password as mustChangePassword,
        created_at as createdAt,
        updated_at as updatedAt,
        last_login_at as lastLoginAt
      FROM player_accounts
      ORDER BY created_at DESC
    `);

    const rows = stmt.all() as PlayerAccountRow[];
    return rows.map((row) => ({
      ...row,
      mustChangePassword: row.mustChangePassword === 1,
    }));
  }

  /**
   * Count the number of active seats linked to an account across all campaigns.
   * Used for admin account listing.
   */
  async countSeatsForAccount(accountId: string): Promise<number> {
    const db = this.ensureDb();

    const stmt = db.prepare(`
      SELECT COUNT(*) as count FROM seats WHERE account_id = ? AND is_active = 1
    `);

    const row = stmt.get(accountId) as { count: number };
    return row.count;
  }

  // ---------------------------------------------------------------------------
  // Auth session operations
  // ---------------------------------------------------------------------------

  /**
   * Create an auth session for an account.
   */
  async createAuthSession(data: {
    accountId: string;
    refreshTokenHash: string;
    accessTokenHash: string;
    expiresAt: number;
  }): Promise<AuthSession> {
    const db = this.ensureDb();
    const id = randomUUID();
    const now = Date.now();

    const session: AuthSession = {
      id,
      accountId: data.accountId,
      refreshTokenHash: data.refreshTokenHash,
      accessTokenHash: data.accessTokenHash,
      expiresAt: data.expiresAt,
      createdAt: now,
      lastUsedAt: now,
      revokedAt: null,
    };

    const stmt = db.prepare(`
      INSERT INTO auth_sessions (
        id, account_id, refresh_token_hash, access_token_hash,
        expires_at, created_at, last_used_at, revoked_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      session.id,
      session.accountId,
      session.refreshTokenHash,
      session.accessTokenHash,
      session.expiresAt,
      session.createdAt,
      session.lastUsedAt,
      session.revokedAt,
    );

    return session;
  }

  /**
   * Get an auth session by refresh token hash.
   */
  async getAuthSession(refreshTokenHash: string): Promise<AuthSession | null> {
    const db = this.ensureDb();

    const stmt = db.prepare(`
      SELECT
        id,
        account_id as accountId,
        refresh_token_hash as refreshTokenHash,
        access_token_hash as accessTokenHash,
        expires_at as expiresAt,
        created_at as createdAt,
        last_used_at as lastUsedAt,
        revoked_at as revokedAt
      FROM auth_sessions
      WHERE refresh_token_hash = ? AND revoked_at IS NULL
    `);

    const row = stmt.get(refreshTokenHash) as AuthSession | undefined;
    return row ?? null;
  }

  /**
   * Update an auth session (last_used_at, token rotation if needed).
   */
  async updateAuthSession(
    sessionId: string,
    data: Partial<
      Pick<AuthSession, 'refreshTokenHash' | 'accessTokenHash' | 'lastUsedAt'>
    >,
  ): Promise<void> {
    const db = this.ensureDb();

    const updates: string[] = [];
    const values: unknown[] = [];

    if (data.refreshTokenHash !== undefined) {
      updates.push('refresh_token_hash = ?');
      values.push(data.refreshTokenHash);
    }

    if (data.accessTokenHash !== undefined) {
      updates.push('access_token_hash = ?');
      values.push(data.accessTokenHash);
    }

    if (data.lastUsedAt !== undefined) {
      updates.push('last_used_at = ?');
      values.push(data.lastUsedAt);
    }

    if (updates.length === 0) {
      return;
    }

    values.push(sessionId);

    const stmt = db.prepare(`
      UPDATE auth_sessions
      SET ${updates.join(', ')}
      WHERE id = ?
    `);
    stmt.run(...values);
  }

  /**
   * Revoke an auth session.
   */
  async revokeAuthSession(sessionId: string): Promise<void> {
    const db = this.ensureDb();

    const stmt = db.prepare(`
      UPDATE auth_sessions SET revoked_at = ? WHERE id = ?
    `);
    stmt.run(Date.now(), sessionId);
  }

  /**
   * Revoke all auth sessions for an account (e.g., on password reset).
   */
  async revokeAllAuthSessionsForAccount(accountId: string): Promise<void> {
    const db = this.ensureDb();

    const stmt = db.prepare(`
      UPDATE auth_sessions SET revoked_at = ? WHERE account_id = ? AND revoked_at IS NULL
    `);
    stmt.run(Date.now(), accountId);
  }

  /**
   * List all auth sessions for an account.
   */
  async listAuthSessionsForAccount(accountId: string): Promise<AuthSession[]> {
    const db = this.ensureDb();

    const stmt = db.prepare(`
      SELECT
        id,
        account_id as accountId,
        refresh_token_hash as refreshTokenHash,
        access_token_hash as accessTokenHash,
        expires_at as expiresAt,
        created_at as createdAt,
        last_used_at as lastUsedAt,
        revoked_at as revokedAt
      FROM auth_sessions
      WHERE account_id = ?
      ORDER BY created_at DESC
    `);

    return stmt.all(accountId) as AuthSession[];
  }
}
