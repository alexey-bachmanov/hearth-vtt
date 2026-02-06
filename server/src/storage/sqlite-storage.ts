import Database from 'better-sqlite3';
import path from 'path';
import { randomUUID } from 'crypto';
import { existsSync, unlinkSync } from 'fs';
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
} from './storage.js';

/**
 * SQLite-based storage implementation using per-campaign databases.
 *
 * Architecture:
 * - Metadata DB: stores campaign list and global settings
 * - Campaign DBs: one database per campaign for entities and events
 * - Connection pooling via Map<campaignId, Database>
 *
 * This separation allows campaigns to be archived/restored independently
 * while maintaining fast access to the campaign list.
 *
 * Note: This class implements StorageBackend interface internally.
 * Server code uses the Storage facade class, not this implementation directly.
 */
export class SqliteStorage implements StorageBackend {
  private dataDir: string;
  private metadataDb: Database.Database | null = null;
  private campaignDbs = new Map<string, Database.Database>();

  constructor(options: { dataDir: string }) {
    this.dataDir = options.dataDir;
  }

  /**
   * Get the path to the metadata database
   */
  private getMetadataDbPath(): string {
    return path.join(this.dataDir, 'db', 'metadata.db');
  }

  /**
   * Get the path to a campaign database
   */
  private getCampaignDbPath(campaignId: string): string {
    return path.join(this.dataDir, 'db', `campaign-${campaignId}.db`);
  }

  /**
   * Initialize the metadata database with schema
   */
  private initMetadataDb(): void {
    if (!this.metadataDb) {
      throw new Error('Metadata database not initialized');
    }

    this.metadataDb.exec(`
      -- Campaigns table
      CREATE TABLE IF NOT EXISTS campaigns (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      
      CREATE INDEX IF NOT EXISTS idx_campaigns_created_at ON campaigns(created_at);
      CREATE INDEX IF NOT EXISTS idx_campaigns_name ON campaigns(name);

      -- Server admin table (server-level, not per-campaign)
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
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        last_used_at INTEGER NOT NULL,
        revoked_at INTEGER,
        FOREIGN KEY (admin_id) REFERENCES server_admin(id)
      );

      CREATE INDEX IF NOT EXISTS idx_admin_sessions_token ON admin_sessions(session_token_hash);
      CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin_id ON admin_sessions(admin_id);
      CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at ON admin_sessions(expires_at);

      -- Seats table (campaign-scoped identities)
      CREATE TABLE IF NOT EXISTS seats (
        id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('gm', 'player', 'spectator')),
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_seats_campaign_id ON seats(campaign_id);
      CREATE INDEX IF NOT EXISTS idx_seats_role ON seats(role);

      -- Invites table (capability tokens for claiming seats)
      CREATE TABLE IF NOT EXISTS invites (
        id TEXT PRIMARY KEY,
        seat_id TEXT NOT NULL,
        invite_token TEXT NOT NULL UNIQUE,
        pin_hash TEXT NOT NULL,
        max_uses INTEGER NOT NULL,
        uses_remaining INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        revoked_at INTEGER,
        FOREIGN KEY (seat_id) REFERENCES seats(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_invites_token ON invites(invite_token);
      CREATE INDEX IF NOT EXISTS idx_invites_seat_id ON invites(seat_id);
      CREATE INDEX IF NOT EXISTS idx_invites_expires_at ON invites(expires_at);

      -- Auth sessions table (seat-based authentication)
      CREATE TABLE IF NOT EXISTS auth_sessions (
        id TEXT PRIMARY KEY,
        seat_id TEXT NOT NULL,
        refresh_token_hash TEXT NOT NULL,
        access_token_hash TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        last_used_at INTEGER NOT NULL,
        revoked_at INTEGER,
        FOREIGN KEY (seat_id) REFERENCES seats(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_auth_sessions_refresh_token ON auth_sessions(refresh_token_hash);
      CREATE INDEX IF NOT EXISTS idx_auth_sessions_seat_id ON auth_sessions(seat_id);
      CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions(expires_at);
    `);
  }

  /**
   * Initialize a campaign database with schema
   */
  private initCampaignDb(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS entities (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      
      CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);
      CREATE INDEX IF NOT EXISTS idx_entities_created_at ON entities(created_at);
      
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        entity_id TEXT,
        type TEXT NOT NULL,
        data TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );
      
      CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
      CREATE INDEX IF NOT EXISTS idx_events_entity_id ON events(entity_id);
      CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
    `);
  }

  /**
   * Get or create a campaign database connection
   */
  private getOrCreateCampaignDb(campaignId: string): Database.Database {
    let db = this.campaignDbs.get(campaignId);

    if (!db) {
      const dbPath = this.getCampaignDbPath(campaignId);
      db = new Database(dbPath);
      this.initCampaignDb(db);
      this.campaignDbs.set(campaignId, db);
    }

    return db;
  }

  /**
   * Initialize the storage system
   */
  async init(): Promise<void> {
    const metadataPath = this.getMetadataDbPath();
    this.metadataDb = new Database(metadataPath);
    this.initMetadataDb();
  }

  /**
   * Campaign operations
   */
  async createCampaign(name: string): Promise<Campaign> {
    if (!this.metadataDb) {
      throw new Error('Storage not initialized');
    }

    const id = randomUUID();
    const now = Date.now();

    const campaign: Campaign = {
      id,
      name,
      createdAt: now,
      updatedAt: now,
    };

    const stmt = this.metadataDb.prepare(`
      INSERT INTO campaigns (id, name, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(
      campaign.id,
      campaign.name,
      campaign.createdAt,
      campaign.updatedAt,
    );

    // Create the campaign database
    this.getOrCreateCampaignDb(id);

    return campaign;
  }

  async getCampaign(id: string): Promise<Campaign | null> {
    if (!this.metadataDb) {
      throw new Error('Storage not initialized');
    }

    const stmt = this.metadataDb.prepare(`
      SELECT id, name, created_at as createdAt, updated_at as updatedAt
      FROM campaigns
      WHERE id = ?
    `);

    const row = stmt.get(id) as Campaign | undefined;
    return row ?? null;
  }

  async listCampaigns(): Promise<Campaign[]> {
    if (!this.metadataDb) {
      throw new Error('Storage not initialized');
    }

    const stmt = this.metadataDb.prepare(`
      SELECT id, name, created_at as createdAt, updated_at as updatedAt
      FROM campaigns
      ORDER BY created_at DESC
    `);

    return stmt.all() as Campaign[];
  }

  async deleteCampaign(id: string): Promise<void> {
    if (!this.metadataDb) {
      throw new Error('Storage not initialized');
    }

    // Delete from metadata
    const stmt = this.metadataDb.prepare(`
      DELETE FROM campaigns WHERE id = ?
    `);
    stmt.run(id);

    // Close and delete the campaign database
    const db = this.campaignDbs.get(id);
    if (db) {
      db.close();
      this.campaignDbs.delete(id);
    }

    const dbPath = this.getCampaignDbPath(id);
    if (existsSync(dbPath)) {
      unlinkSync(dbPath);
    }
  }

  /**
   * Entity operations - TODO: Implement fully
   */
  async createEntity(
    campaignId: string,
    type: string,
    data: Record<string, unknown>,
  ): Promise<Entity> {
    const db = this.getOrCreateCampaignDb(campaignId);
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
      INSERT INTO entities (id, type, data, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(
      entity.id,
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
    const db = this.getOrCreateCampaignDb(campaignId);

    const stmt = db.prepare(`
      SELECT id, type, data, created_at as createdAt, updated_at as updatedAt
      FROM entities
      WHERE id = ?
    `);

    const row = stmt.get(entityId) as any;
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
    const db = this.getOrCreateCampaignDb(campaignId);
    const now = Date.now();

    const stmt = db.prepare(`
      UPDATE entities
      SET data = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(JSON.stringify(data), now, entityId);

    const entity = await this.getEntity(campaignId, entityId);
    if (!entity) {
      throw new Error(`Entity ${entityId} not found`);
    }

    return entity;
  }

  async deleteEntity(campaignId: string, entityId: string): Promise<void> {
    const db = this.getOrCreateCampaignDb(campaignId);

    const stmt = db.prepare(`
      DELETE FROM entities WHERE id = ?
    `);

    stmt.run(entityId);
  }

  async listEntities(campaignId: string, type?: string): Promise<Entity[]> {
    const db = this.getOrCreateCampaignDb(campaignId);

    let stmt: Database.Statement;
    let rows: any[];

    if (type) {
      stmt = db.prepare(`
        SELECT id, type, data, created_at as createdAt, updated_at as updatedAt
        FROM entities
        WHERE type = ?
        ORDER BY created_at DESC
      `);
      rows = stmt.all(type) as any[];
    } else {
      stmt = db.prepare(`
        SELECT id, type, data, created_at as createdAt, updated_at as updatedAt
        FROM entities
        ORDER BY created_at DESC
      `);
      rows = stmt.all() as any[];
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

  /**
   * Event log operations - TODO: Implement fully
   */
  async appendEvent(
    campaignId: string,
    event: Omit<Event, 'id' | 'timestamp'>,
  ): Promise<Event> {
    const db = this.getOrCreateCampaignDb(campaignId);
    const id = randomUUID();
    const timestamp = Date.now();

    const fullEvent: Event = {
      id,
      ...event,
      timestamp,
    };

    const stmt = db.prepare(`
      INSERT INTO events (id, entity_id, type, data, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(
      fullEvent.id,
      fullEvent.entityId,
      fullEvent.type,
      JSON.stringify(fullEvent.data),
      fullEvent.timestamp,
    );

    return fullEvent;
  }

  async getEvents(
    campaignId: string,
    options?: {
      afterTimestamp?: number;
      entityId?: string;
      type?: string;
      limit?: number;
    },
  ): Promise<Event[]> {
    const db = this.getOrCreateCampaignDb(campaignId);

    let query = `
      SELECT id, entity_id as entityId, type, data, timestamp
      FROM events
      WHERE 1=1
    `;
    const params: any[] = [];

    if (options?.afterTimestamp) {
      query += ` AND timestamp > ?`;
      params.push(options.afterTimestamp);
    }

    if (options?.entityId) {
      query += ` AND entity_id = ?`;
      params.push(options.entityId);
    }

    if (options?.type) {
      query += ` AND type = ?`;
      params.push(options.type);
    }

    query += ` ORDER BY timestamp ASC`;

    if (options?.limit) {
      query += ` LIMIT ?`;
      params.push(options.limit);
    }

    const stmt = db.prepare(query);
    const rows = stmt.all(...params) as any[];

    return rows.map((row) => ({
      id: row.id,
      campaignId,
      entityId: row.entityId,
      type: row.type,
      data: JSON.parse(row.data),
      timestamp: row.timestamp,
    }));
  }

  /**
   * Transaction support - TODO: Implement
   */
  async beginTransaction(campaignId: string): Promise<void> {
    throw new Error('Transactions not yet implemented');
  }

  async commitTransaction(campaignId: string): Promise<void> {
    throw new Error('Transactions not yet implemented');
  }

  async rollbackTransaction(campaignId: string): Promise<void> {
    throw new Error('Transactions not yet implemented');
  }

  /**
   * Server admin operations
   */

  /**
   * Get the server admin (only one exists per server)
   */
  async getServerAdmin(): Promise<ServerAdmin | null> {
    if (!this.metadataDb) {
      throw new Error('Storage not initialized');
    }

    const stmt = this.metadataDb.prepare(`
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
   * Create the server admin (should only be called once on first server startup)
   */
  async createServerAdmin(data: {
    usernameOrEmail: string;
    pinHash: string;
    setupPinExpiresAt: number;
  }): Promise<ServerAdmin> {
    if (!this.metadataDb) {
      throw new Error('Storage not initialized');
    }

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

    const stmt = this.metadataDb.prepare(`
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
   * Update server admin (typically to set password after first setup)
   */
  async updateServerAdmin(
    adminId: string,
    data: Partial<
      Pick<ServerAdmin, 'pinHash' | 'passwordHash' | 'setupPinExpiresAt'>
    >,
  ): Promise<void> {
    if (!this.metadataDb) {
      throw new Error('Storage not initialized');
    }

    const updates: string[] = [];
    const values: any[] = [];

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

    const stmt = this.metadataDb.prepare(`
      UPDATE server_admin
      SET ${updates.join(', ')}
      WHERE id = ?
    `);

    stmt.run(...values);
  }

  /**
   * Admin session operations
   */

  /**
   * Create an admin session
   */
  async createAdminSession(data: {
    adminId: string;
    sessionTokenHash: string;
    expiresAt: number;
  }): Promise<AdminSession> {
    if (!this.metadataDb) {
      throw new Error('Storage not initialized');
    }

    const id = randomUUID();
    const now = Date.now();

    const session: AdminSession = {
      id,
      adminId: data.adminId,
      sessionTokenHash: data.sessionTokenHash,
      expiresAt: data.expiresAt,
      createdAt: now,
      lastUsedAt: now,
      revokedAt: null,
    };

    const stmt = this.metadataDb.prepare(`
      INSERT INTO admin_sessions (
        id, admin_id, session_token_hash, expires_at,
        created_at, last_used_at, revoked_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      session.id,
      session.adminId,
      session.sessionTokenHash,
      session.expiresAt,
      session.createdAt,
      session.lastUsedAt,
      session.revokedAt,
    );

    return session;
  }

  /**
   * Get an admin session by token hash
   */
  async getAdminSession(
    sessionTokenHash: string,
  ): Promise<AdminSession | null> {
    if (!this.metadataDb) {
      throw new Error('Storage not initialized');
    }

    const stmt = this.metadataDb.prepare(`
      SELECT
        id,
        admin_id as adminId,
        session_token_hash as sessionTokenHash,
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
   * Revoke an admin session
   */
  async revokeAdminSession(sessionId: string): Promise<void> {
    if (!this.metadataDb) {
      throw new Error('Storage not initialized');
    }

    const stmt = this.metadataDb.prepare(`
      UPDATE admin_sessions
      SET revoked_at = ?
      WHERE id = ?
    `);

    stmt.run(Date.now(), sessionId);
  }

  /**
   * List all admin sessions (active and revoked)
   */
  async listAdminSessions(): Promise<AdminSession[]> {
    if (!this.metadataDb) {
      throw new Error('Storage not initialized');
    }

    const stmt = this.metadataDb.prepare(`
      SELECT
        id,
        admin_id as adminId,
        session_token_hash as sessionTokenHash,
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
   * Seat operations
   */

  /**
   * Create a seat in a campaign
   */
  async createSeat(data: {
    campaignId: string;
    displayName: string;
    role: 'gm' | 'player' | 'spectator';
  }): Promise<Seat> {
    if (!this.metadataDb) {
      throw new Error('Storage not initialized');
    }

    const id = randomUUID();
    const now = Date.now();

    const seat: Seat = {
      id,
      campaignId: data.campaignId,
      displayName: data.displayName,
      role: data.role,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    const stmt = this.metadataDb.prepare(`
      INSERT INTO seats (
        id, campaign_id, display_name, role, is_active,
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      seat.id,
      seat.campaignId,
      seat.displayName,
      seat.role,
      seat.isActive ? 1 : 0,
      seat.createdAt,
      seat.updatedAt,
    );

    return seat;
  }

  /**
   * Get a seat by ID
   */
  async getSeat(seatId: string): Promise<Seat | null> {
    if (!this.metadataDb) {
      throw new Error('Storage not initialized');
    }

    const stmt = this.metadataDb.prepare(`
      SELECT
        id,
        campaign_id as campaignId,
        display_name as displayName,
        role,
        is_active as isActive,
        created_at as createdAt,
        updated_at as updatedAt
      FROM seats
      WHERE id = ?
    `);

    const row = stmt.get(seatId) as any;
    if (!row) return null;

    return {
      ...row,
      isActive: row.isActive === 1,
    };
  }

  /**
   * List all seats for a campaign
   */
  async listSeats(campaignId: string): Promise<Seat[]> {
    if (!this.metadataDb) {
      throw new Error('Storage not initialized');
    }

    const stmt = this.metadataDb.prepare(`
      SELECT
        id,
        campaign_id as campaignId,
        display_name as displayName,
        role,
        is_active as isActive,
        created_at as createdAt,
        updated_at as updatedAt
      FROM seats
      WHERE campaign_id = ?
      ORDER BY created_at DESC
    `);

    const rows = stmt.all(campaignId) as any[];
    return rows.map((row) => ({
      ...row,
      isActive: row.isActive === 1,
    }));
  }

  /**
   * Update a seat
   */
  async updateSeat(
    seatId: string,
    data: Partial<Pick<Seat, 'displayName' | 'role' | 'isActive'>>,
  ): Promise<void> {
    if (!this.metadataDb) {
      throw new Error('Storage not initialized');
    }

    const updates: string[] = [];
    const values: any[] = [];

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

    if (updates.length === 0) {
      return;
    }

    updates.push('updated_at = ?');
    values.push(Date.now());
    values.push(seatId);

    const stmt = this.metadataDb.prepare(`
      UPDATE seats
      SET ${updates.join(', ')}
      WHERE id = ?
    `);

    stmt.run(...values);
  }

  /**
   * Delete a seat (also cascades to invites and auth sessions via FK)
   */
  async deleteSeat(seatId: string): Promise<void> {
    if (!this.metadataDb) {
      throw new Error('Storage not initialized');
    }

    const stmt = this.metadataDb.prepare(`
      DELETE FROM seats WHERE id = ?
    `);

    stmt.run(seatId);
  }

  /**
   * Invite operations
   */

  /**
   * Create an invite for a seat
   */
  async createInvite(data: {
    seatId: string;
    inviteToken: string;
    pinHash: string;
    maxUses: number;
    expiresAt: number;
  }): Promise<Invite> {
    if (!this.metadataDb) {
      throw new Error('Storage not initialized');
    }

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

    const stmt = this.metadataDb.prepare(`
      INSERT INTO invites (
        id, seat_id, invite_token, pin_hash, max_uses,
        uses_remaining, expires_at, created_at, revoked_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      invite.id,
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
   * Get an invite by token
   */
  async getInvite(inviteToken: string): Promise<Invite | null> {
    if (!this.metadataDb) {
      throw new Error('Storage not initialized');
    }

    const stmt = this.metadataDb.prepare(`
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
   * List all invites for a seat
   */
  async listInvitesForSeat(seatId: string): Promise<Invite[]> {
    if (!this.metadataDb) {
      throw new Error('Storage not initialized');
    }

    const stmt = this.metadataDb.prepare(`
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
      WHERE seat_id = ?
      ORDER BY created_at DESC
    `);

    return stmt.all(seatId) as Invite[];
  }

  /**
   * Revoke an invite
   */
  async revokeInvite(inviteToken: string): Promise<void> {
    if (!this.metadataDb) {
      throw new Error('Storage not initialized');
    }

    const stmt = this.metadataDb.prepare(`
      UPDATE invites
      SET revoked_at = ?
      WHERE invite_token = ?
    `);

    stmt.run(Date.now(), inviteToken);
  }

  /**
   * Decrement invite uses (called when invite is claimed)
   */
  async decrementInviteUses(inviteToken: string): Promise<void> {
    if (!this.metadataDb) {
      throw new Error('Storage not initialized');
    }

    const stmt = this.metadataDb.prepare(`
      UPDATE invites
      SET uses_remaining = uses_remaining - 1
      WHERE invite_token = ? AND uses_remaining > 0
    `);

    stmt.run(inviteToken);
  }

  /**
   * Auth session operations
   */

  /**
   * Create an auth session for a seat
   */
  async createAuthSession(data: {
    seatId: string;
    refreshTokenHash: string;
    accessTokenHash: string;
    expiresAt: number;
  }): Promise<AuthSession> {
    if (!this.metadataDb) {
      throw new Error('Storage not initialized');
    }

    const id = randomUUID();
    const now = Date.now();

    const session: AuthSession = {
      id,
      seatId: data.seatId,
      refreshTokenHash: data.refreshTokenHash,
      accessTokenHash: data.accessTokenHash,
      expiresAt: data.expiresAt,
      createdAt: now,
      lastUsedAt: now,
      revokedAt: null,
    };

    const stmt = this.metadataDb.prepare(`
      INSERT INTO auth_sessions (
        id, seat_id, refresh_token_hash, access_token_hash,
        expires_at, created_at, last_used_at, revoked_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      session.id,
      session.seatId,
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
   * Get an auth session by refresh token hash
   */
  async getAuthSession(refreshTokenHash: string): Promise<AuthSession | null> {
    if (!this.metadataDb) {
      throw new Error('Storage not initialized');
    }

    const stmt = this.metadataDb.prepare(`
      SELECT
        id,
        seat_id as seatId,
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
   * Update an auth session (for token rotation)
   */
  async updateAuthSession(
    sessionId: string,
    data: Partial<
      Pick<AuthSession, 'refreshTokenHash' | 'accessTokenHash' | 'lastUsedAt'>
    >,
  ): Promise<void> {
    if (!this.metadataDb) {
      throw new Error('Storage not initialized');
    }

    const updates: string[] = [];
    const values: any[] = [];

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

    const stmt = this.metadataDb.prepare(`
      UPDATE auth_sessions
      SET ${updates.join(', ')}
      WHERE id = ?
    `);

    stmt.run(...values);
  }

  /**
   * Revoke an auth session
   */
  async revokeAuthSession(sessionId: string): Promise<void> {
    if (!this.metadataDb) {
      throw new Error('Storage not initialized');
    }

    const stmt = this.metadataDb.prepare(`
      UPDATE auth_sessions
      SET revoked_at = ?
      WHERE id = ?
    `);

    stmt.run(Date.now(), sessionId);
  }

  /**
   * List all auth sessions for a seat
   */
  async listAuthSessionsForSeat(seatId: string): Promise<AuthSession[]> {
    if (!this.metadataDb) {
      throw new Error('Storage not initialized');
    }

    const stmt = this.metadataDb.prepare(`
      SELECT
        id,
        seat_id as seatId,
        refresh_token_hash as refreshTokenHash,
        access_token_hash as accessTokenHash,
        expires_at as expiresAt,
        created_at as createdAt,
        last_used_at as lastUsedAt,
        revoked_at as revokedAt
      FROM auth_sessions
      WHERE seat_id = ?
      ORDER BY created_at DESC
    `);

    return stmt.all(seatId) as AuthSession[];
  }
}
