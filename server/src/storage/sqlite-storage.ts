import Database from 'better-sqlite3';
import path from 'path';
import { randomUUID } from 'crypto';
import { existsSync, unlinkSync } from 'fs';
import type { Storage, Campaign, Entity, Event } from './storage.js';

/**
 * SQLite-based storage implementation using per-campaign databases
 * - Metadata DB: stores campaign list and global settings
 * - Campaign DBs: one database per campaign for entities and events
 */
export class SqliteStorage implements Storage {
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
      CREATE TABLE IF NOT EXISTS campaigns (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      
      CREATE INDEX IF NOT EXISTS idx_campaigns_created_at ON campaigns(created_at);
      CREATE INDEX IF NOT EXISTS idx_campaigns_name ON campaigns(name);
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
}
