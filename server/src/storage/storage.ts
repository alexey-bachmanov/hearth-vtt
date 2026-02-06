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
 * ServerAdmin: Server-level administrator credentials.
 * One admin per server (extensible to multiple admins later).
 */
export interface ServerAdmin {
  id: string;
  usernameOrEmail: string; // Always "admin" for self-hosted; email for cloud
  pinHash: string | null; // Setup PIN hash; null after permanent password set
  passwordHash: string | null; // Permanent password hash; set after first setup
  setupPinExpiresAt: number | null; // Unix timestamp; null after setup complete
  createdAt: number;
  updatedAt: number;
}

/**
 * AdminSession: Server admin authentication session.
 * Separate from seat-based AuthSessions.
 */
export interface AdminSession {
  id: string;
  adminId: string; // References ServerAdmin.id
  sessionTokenHash: string; // Hashed session token (stored in cookie)
  csrfToken: string; // CSRF token (plain text, returned to client)
  expiresAt: number; // Unix timestamp
  createdAt: number;
  lastUsedAt: number;
  revokedAt: number | null; // Unix timestamp or null
}

/**
 * Seat: Persistent identity within a campaign.
 * Seats survive server restarts and outlive AuthSessions.
 */
export interface Seat {
  id: string;
  campaignId: string;
  displayName: string; // Player's display name in this campaign
  role: 'gm' | 'player' | 'spectator'; // Campaign role (no 'admin' role)
  isActive: boolean; // Can be deactivated without deletion
  createdAt: number;
  updatedAt: number;
}

/**
 * Invite: Capability token for claiming a seat.
 * Managed by server admin.
 */
export interface Invite {
  id: string;
  seatId: string; // References Seat.id (each invite tied to exactly one seat)
  inviteToken: string; // Capability token (128+ bits entropy)
  pinHash: string; // Hashed PIN for claiming invite
  maxUses: number; // Total number of times this invite can be claimed
  usesRemaining: number; // Remaining claims available
  expiresAt: number; // Unix timestamp
  createdAt: number;
  revokedAt: number | null; // Unix timestamp or null
}

/**
 * AuthSession: Cookie-based authentication session for campaign participants.
 * Separate from AdminSession.
 */
export interface AuthSession {
  id: string;
  seatId: string; // References Seat.id
  refreshTokenHash: string; // Hashed refresh token
  accessTokenHash: string; // Hashed access token (short-lived)
  expiresAt: number; // Unix timestamp
  createdAt: number;
  lastUsedAt: number;
  revokedAt: number | null; // Unix timestamp or null
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

  /**
   * Server admin operations (server-level, not per-campaign)
   */
  getServerAdmin(): Promise<ServerAdmin | null>;
  createServerAdmin(data: {
    usernameOrEmail: string;
    pinHash: string;
    setupPinExpiresAt: number;
  }): Promise<ServerAdmin>;
  updateServerAdmin(
    adminId: string,
    data: Partial<
      Pick<ServerAdmin, 'pinHash' | 'passwordHash' | 'setupPinExpiresAt'>
    >,
  ): Promise<void>;

  /**
   * Admin session operations (server-level admin authentication)
   */
  createAdminSession(data: {
    adminId: string;
    sessionTokenHash: string;
    expiresAt: number;
  }): Promise<AdminSession>;
  getAdminSession(sessionTokenHash: string): Promise<AdminSession | null>;
  revokeAdminSession(sessionId: string): Promise<void>;
  listAdminSessions(): Promise<AdminSession[]>;
  cleanupExpiredAdminSessions(): Promise<void>;

  /**
   * Seat operations (campaign-scoped identities)
   */
  createSeat(data: {
    campaignId: string;
    displayName: string;
    role: 'gm' | 'player' | 'spectator';
  }): Promise<Seat>;
  getSeat(campaignId: string, seatId: string): Promise<Seat | null>;
  listSeats(campaignId: string): Promise<Seat[]>;
  updateSeat(
    campaignId: string,
    seatId: string,
    data: Partial<Pick<Seat, 'displayName' | 'role' | 'isActive'>>,
  ): Promise<void>;
  deleteSeat(campaignId: string, seatId: string): Promise<void>;

  /**
   * Invite operations (admin-managed capability tokens)
   */
  createInvite(data: {
    campaignId: string;
    seatId: string;
    inviteToken: string;
    pinHash: string;
    maxUses: number;
    expiresAt: number;
  }): Promise<Invite>;
  getInvite(inviteToken: string): Promise<Invite | null>;
  listInvitesForSeat(campaignId: string, seatId: string): Promise<Invite[]>;
  revokeInvite(inviteToken: string): Promise<void>;
  decrementInviteUses(inviteToken: string): Promise<void>;

  /**
   * Auth session operations (seat-based authentication)
   */
  createAuthSession(data: {
    campaignId: string;
    seatId: string;
    refreshTokenHash: string;
    accessTokenHash: string;
    expiresAt: number;
  }): Promise<AuthSession>;
  getAuthSession(refreshTokenHash: string): Promise<AuthSession | null>;
  updateAuthSession(
    campaignId: string,
    sessionId: string,
    data: Partial<
      Pick<AuthSession, 'refreshTokenHash' | 'accessTokenHash' | 'lastUsedAt'>
    >,
  ): Promise<void>;
  revokeAuthSession(campaignId: string, sessionId: string): Promise<void>;
  listAuthSessionsForSeat(
    campaignId: string,
    seatId: string,
  ): Promise<AuthSession[]>;
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

  /**
   * Server admin operations
   */
  async getServerAdmin(): Promise<ServerAdmin | null> {
    return this.backend.getServerAdmin();
  }

  async createServerAdmin(data: {
    usernameOrEmail: string;
    pinHash: string;
    setupPinExpiresAt: number;
  }): Promise<ServerAdmin> {
    return this.backend.createServerAdmin(data);
  }

  async updateServerAdmin(
    adminId: string,
    data: Partial<
      Pick<ServerAdmin, 'pinHash' | 'passwordHash' | 'setupPinExpiresAt'>
    >,
  ): Promise<void> {
    return this.backend.updateServerAdmin(adminId, data);
  }

  /**
   * Admin session operations
   */
  async createAdminSession(data: {
    adminId: string;
    sessionTokenHash: string;
    csrfToken: string;
    expiresAt: number;
  }): Promise<AdminSession> {
    return this.backend.createAdminSession(data);
  }

  async getAdminSession(
    sessionTokenHash: string,
  ): Promise<AdminSession | null> {
    return this.backend.getAdminSession(sessionTokenHash);
  }

  async revokeAdminSession(sessionId: string): Promise<void> {
    return this.backend.revokeAdminSession(sessionId);
  }

  async listAdminSessions(): Promise<AdminSession[]> {
    return this.backend.listAdminSessions();
  }

  /**
   * Clean up expired and revoked admin sessions
   */
  async cleanupExpiredAdminSessions(): Promise<void> {
    return this.backend.cleanupExpiredAdminSessions();
  }

  /**
   * Seat operations
   */
  async createSeat(data: {
    campaignId: string;
    displayName: string;
    role: 'gm' | 'player' | 'spectator';
  }): Promise<Seat> {
    return this.backend.createSeat(data);
  }

  async getSeat(campaignId: string, seatId: string): Promise<Seat | null> {
    return this.backend.getSeat(campaignId, seatId);
  }

  async listSeats(campaignId: string): Promise<Seat[]> {
    return this.backend.listSeats(campaignId);
  }

  async updateSeat(
    campaignId: string,
    seatId: string,
    data: Partial<Pick<Seat, 'displayName' | 'role' | 'isActive'>>,
  ): Promise<void> {
    return this.backend.updateSeat(campaignId, seatId, data);
  }

  async deleteSeat(campaignId: string, seatId: string): Promise<void> {
    return this.backend.deleteSeat(campaignId, seatId);
  }

  /**
   * Invite operations
   */
  async createInvite(data: {
    campaignId: string;
    seatId: string;
    inviteToken: string;
    pinHash: string;
    maxUses: number;
    expiresAt: number;
  }): Promise<Invite> {
    return this.backend.createInvite(data);
  }

  async getInvite(inviteToken: string): Promise<Invite | null> {
    return this.backend.getInvite(inviteToken);
  }

  async listInvitesForSeat(
    campaignId: string,
    seatId: string,
  ): Promise<Invite[]> {
    return this.backend.listInvitesForSeat(campaignId, seatId);
  }

  async revokeInvite(inviteToken: string): Promise<void> {
    return this.backend.revokeInvite(inviteToken);
  }

  async decrementInviteUses(inviteToken: string): Promise<void> {
    return this.backend.decrementInviteUses(inviteToken);
  }

  /**
   * Auth session operations
   */
  async createAuthSession(data: {
    campaignId: string;
    seatId: string;
    refreshTokenHash: string;
    accessTokenHash: string;
    expiresAt: number;
  }): Promise<AuthSession> {
    return this.backend.createAuthSession(data);
  }

  async getAuthSession(refreshTokenHash: string): Promise<AuthSession | null> {
    return this.backend.getAuthSession(refreshTokenHash);
  }

  async updateAuthSession(
    campaignId: string,
    sessionId: string,
    data: Partial<
      Pick<AuthSession, 'refreshTokenHash' | 'accessTokenHash' | 'lastUsedAt'>
    >,
  ): Promise<void> {
    return this.backend.updateAuthSession(campaignId, sessionId, data);
  }

  async revokeAuthSession(
    campaignId: string,
    sessionId: string,
  ): Promise<void> {
    return this.backend.revokeAuthSession(campaignId, sessionId);
  }

  async listAuthSessionsForSeat(
    campaignId: string,
    seatId: string,
  ): Promise<AuthSession[]> {
    return this.backend.listAuthSessionsForSeat(campaignId, seatId);
  }
}
