/**
 * Storage interface for HearthVTT
 * Based on the specification in docs/components/server.md
 */

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

export interface Storage {
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
  listEntities(
    campaignId: string,
    type?: string,
  ): Promise<Entity[]>;

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
