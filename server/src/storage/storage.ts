/**
 * Storage types and interfaces for HearthVTT
 * Based on the specification in docs/components/server.md
 */

import { SqliteStorage } from './sqlite-storage';

export interface Campaign {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface Entity {
  id: string;
  campaignId: string;
  type: string;
  data: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface Event {
  id: string;
  campaignId: string;
  entityId: string | null;
  type: string;
  data: Record<string, unknown>;
  timestamp: number;
}

/**
 * Internal interface for storage backend implementations.
 * Not exported - server code uses the Storage facade class.
 */
export interface StorageBackend {
  /**
   * Initialize the storage system (create schemas, run migrations)
   */
  init(): Promise<void>;

  /**
   * Campaign operations
   */
  createCampaign(name: string): Promise<Campaign>;
  getCampaign(id: string): Promise<Campaign | null>;
  listCampaigns(): Promise<Campaign[]>;
  deleteCampaign(id: string): Promise<void>;

  /**
   * Entity operations
   * TODO: Implement these methods
   */
  createEntity(
    campaignId: string,
    type: string,
    data: Record<string, unknown>,
  ): Promise<Entity>;
  getEntity(campaignId: string, entityId: string): Promise<Entity | null>;
  updateEntity(
    campaignId: string,
    entityId: string,
    data: Record<string, unknown>,
  ): Promise<Entity>;
  deleteEntity(campaignId: string, entityId: string): Promise<void>;
  listEntities(campaignId: string, type?: string): Promise<Entity[]>;

  /**
   * Event log operations
   * TODO: Implement these methods
   */
  appendEvent(
    campaignId: string,
    event: Omit<Event, 'id' | 'timestamp'>,
  ): Promise<Event>;
  getEvents(
    campaignId: string,
    options?: {
      afterTimestamp?: number;
      entityId?: string;
      type?: string;
      limit?: number;
    },
  ): Promise<Event[]>;

  /**
   * Transaction support
   * TODO: Implement these methods
   */
  beginTransaction(campaignId: string): Promise<void>;
  commitTransaction(campaignId: string): Promise<void>;
  rollbackTransaction(campaignId: string): Promise<void>;
}

/**
 * Storage provides a unified interface for all data persistence operations.
 *
 * Architecture:
 * - This is a facade class that wraps a StorageBackend implementation
 * - Server code imports and uses Storage, never the backend directly
 * - Backend implementations (SqliteStorage, etc.) are internal to this module
 *
 * This pattern allows swapping storage implementations without changing
 * references throughout the codebase.
 */
export class Storage {
  private backend: StorageBackend;

  constructor(dataDir: string) {
    this.backend = new SqliteStorage({ dataDir: dataDir });
  }

  /**
   * Initialize the storage system (create schemas, run migrations)
   */
  async init(): Promise<void> {
    return this.backend.init();
  }

  /**
   * Campaign operations
   */
  async createCampaign(name: string): Promise<Campaign> {
    return this.backend.createCampaign(name);
  }

  async getCampaign(id: string): Promise<Campaign | null> {
    return this.backend.getCampaign(id);
  }

  async listCampaigns(): Promise<Campaign[]> {
    return this.backend.listCampaigns();
  }

  async deleteCampaign(id: string): Promise<void> {
    return this.backend.deleteCampaign(id);
  }

  /**
   * Entity operations
   */
  async createEntity(
    campaignId: string,
    type: string,
    data: Record<string, unknown>,
  ): Promise<Entity> {
    return this.backend.createEntity(campaignId, type, data);
  }

  async getEntity(
    campaignId: string,
    entityId: string,
  ): Promise<Entity | null> {
    return this.backend.getEntity(campaignId, entityId);
  }

  async updateEntity(
    campaignId: string,
    entityId: string,
    data: Record<string, unknown>,
  ): Promise<Entity> {
    return this.backend.updateEntity(campaignId, entityId, data);
  }

  async deleteEntity(campaignId: string, entityId: string): Promise<void> {
    return this.backend.deleteEntity(campaignId, entityId);
  }

  async listEntities(campaignId: string, type?: string): Promise<Entity[]> {
    return this.backend.listEntities(campaignId, type);
  }

  /**
   * Event log operations
   */
  async appendEvent(
    campaignId: string,
    event: Omit<Event, 'id' | 'timestamp'>,
  ): Promise<Event> {
    return this.backend.appendEvent(campaignId, event);
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
    return this.backend.getEvents(campaignId, options);
  }

  /**
   * Transaction support
   */
  async beginTransaction(campaignId: string): Promise<void> {
    return this.backend.beginTransaction(campaignId);
  }

  async commitTransaction(campaignId: string): Promise<void> {
    return this.backend.commitTransaction(campaignId);
  }

  async rollbackTransaction(campaignId: string): Promise<void> {
    return this.backend.rollbackTransaction(campaignId);
  }
}
