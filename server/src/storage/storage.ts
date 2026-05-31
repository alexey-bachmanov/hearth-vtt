/**
 * Storage types and interfaces for HearthVTT
 * Based on the specification in docs/components/server.md
 */

import { SqliteStorage } from './sqlite-storage';
import type { SeatRole } from '@hearth-vtt/shared';

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
  /** Per-campaign monotonic sequence number. Assigned by appendEvent. */
  seq: number;
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
 * PlayerAccount: A per-server player identity.
 * One account per username per server. An account can hold seats across campaigns.
 * The passwordHash is stored server-side only and is never sent to the client.
 * See ADR-010 and docs/shared-types.md for the full model.
 */
export interface PlayerAccount {
  id: string; // AccountId
  username: string;
  passwordHash: string; // scrypt hash; never sent to client
  mustChangePassword: boolean;
  createdAt: number; // Unix ms
  updatedAt: number; // Unix ms
  lastLoginAt: number | null; // Unix ms; null if never logged in
}

/**
 * Seat: Persistent identity within a campaign.
 * Seats survive server restarts and outlive AuthSessions.
 */
export interface Seat {
  id: string;
  campaignId: string;
  displayName: string; // Player's display name in this campaign
  role: SeatRole; // Campaign role (no 'admin' role)
  accountId: string | null; // References PlayerAccount.id; null if unclaimed
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
 * AuthSession: Cookie-based authentication session for a PlayerAccount.
 * Account-scoped (not campaign/seat-scoped) per ADR-010.
 * Separate from AdminSession.
 */
export interface AuthSession {
  id: string;
  accountId: string; // References PlayerAccount.id
  refreshTokenHash: string; // Hashed refresh token
  csrfToken: string; // CSRF token (plain text, returned to client in response body)
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
   * Close all database connections.
   * Use during graceful shutdown.
   */
  close(): void;

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
   */
  appendEvent(
    campaignId: string,
    event: Omit<Event, 'id' | 'seq' | 'timestamp'>,
  ): Promise<Event>;
  getEvents(
    campaignId: string,
    options?: {
      afterTimestamp?: number;
      afterSeq?: number;
      entityId?: string;
      type?: string;
      limit?: number;
    },
  ): Promise<Event[]>;
  /**
   * Returns the maximum `seq` value stored for the campaign, or 0 if no
   * events exist. Used by the engine to resume seq numbering after a restart.
   */
  getMaxEventSeq(campaignId: string): Promise<number>;

  /**
   * Snapshot operations
   *
   * The engine writes one snapshot per campaign (single-row replace semantics).
   * Auto-snapshot triggering and multi-snapshot retention are deferred —
   * see todo.md "Snapshot chain (auto-trigger + pruning)".
   */
  getLatestSnapshot(
    campaignId: string,
  ): Promise<{ seq: number; blob: unknown } | null>;
  putSnapshot(campaignId: string, seq: number, blob: unknown): Promise<void>;

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
    csrfToken: string;
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
    data: Partial<
      Pick<Seat, 'displayName' | 'role' | 'isActive' | 'accountId'>
    >,
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
  /**
   * Atomically decrements `uses_remaining` by 1 if the invite is still valid
   * (not revoked, not expired, uses_remaining > 0).
   *
   * @param inviteToken - The raw invite token.
   * @param now - Current Unix timestamp (ms) used to check expiry.
   * @returns `true` if the consume succeeded; `false` if the invite was
   *   already exhausted, expired, or revoked at the moment of the atomic
   *   update (covers the claim-race case — no account will have been created).
   */
  consumeInviteAtomic(inviteToken: string, now: number): Promise<boolean>;

  /**
   * Player account operations
   */
  createPlayerAccount(data: {
    username: string;
    passwordHash: string;
  }): Promise<PlayerAccount>;
  getPlayerAccountByUsername(username: string): Promise<PlayerAccount | null>;
  getPlayerAccountById(id: string): Promise<PlayerAccount | null>;
  updatePlayerAccountLastLogin(id: string): Promise<void>;
  setPlayerAccountMustChangePassword(
    id: string,
    mustChangePassword: boolean,
    newPasswordHash?: string,
  ): Promise<void>;
  listPlayerAccounts(): Promise<PlayerAccount[]>;
  countSeatsForAccount(accountId: string): Promise<number>;

  /**
   * Auth session operations (account-scoped per ADR-010)
   */
  createAuthSession(data: {
    accountId: string;
    refreshTokenHash: string;
    csrfToken: string;
    expiresAt: number;
  }): Promise<AuthSession>;
  getAuthSession(refreshTokenHash: string): Promise<AuthSession | null>;
  updateAuthSession(
    sessionId: string,
    data: Partial<Pick<AuthSession, 'refreshTokenHash' | 'lastUsedAt'>>,
  ): Promise<void>;
  revokeAuthSession(sessionId: string): Promise<void>;
  revokeAllAuthSessionsForAccount(accountId: string): Promise<void>;
  listAuthSessionsForAccount(accountId: string): Promise<AuthSession[]>;
  /**
   * Count non-revoked, non-expired sessions for an account.
   * Used to enforce the per-account session cap.
   */
  countActiveAuthSessionsForAccount(accountId: string): Promise<number>;
  /**
   * Revoke the oldest active (non-revoked, non-expired) session for an
   * account. No-op if no active sessions exist.
   * Used to evict a session when the per-account cap is reached.
   */
  revokeOldestAuthSessionForAccount(accountId: string): Promise<void>;

  /**
   * Server settings (key–value store for admin-configurable options).
   */
  getServerSetting(key: string): Promise<string | null>;
  setServerSetting(key: string, value: string): Promise<void>;
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

  constructor(dataDir: string);
  constructor(backend: StorageBackend);
  constructor(dataDirOrBackend: string | StorageBackend) {
    if (typeof dataDirOrBackend === 'string') {
      this.backend = new SqliteStorage({ dataDir: dataDirOrBackend });
    } else {
      this.backend = dataDirOrBackend;
    }
  }

  /**
   * Initialize the storage system (create schemas, run migrations)
   */
  async init(): Promise<void> {
    return this.backend.init();
  }

  /**
   * Close all database connections.
   * Use during graceful shutdown.
   */
  close(): void {
    this.backend.close();
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
    event: Omit<Event, 'id' | 'seq' | 'timestamp'>,
  ): Promise<Event> {
    return this.backend.appendEvent(campaignId, event);
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
    return this.backend.getEvents(campaignId, options);
  }

  async getMaxEventSeq(campaignId: string): Promise<number> {
    return this.backend.getMaxEventSeq(campaignId);
  }

  async getLatestSnapshot(
    campaignId: string,
  ): Promise<{ seq: number; blob: unknown } | null> {
    return this.backend.getLatestSnapshot(campaignId);
  }

  async putSnapshot(
    campaignId: string,
    seq: number,
    blob: unknown,
  ): Promise<void> {
    return this.backend.putSnapshot(campaignId, seq, blob);
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
    data: Partial<
      Pick<Seat, 'displayName' | 'role' | 'isActive' | 'accountId'>
    >,
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

  /**
   * Atomically consume one invite use. Returns `false` if the invite is
   * already exhausted / expired / revoked (caller should return 410).
   */
  async consumeInviteAtomic(
    inviteToken: string,
    now: number,
  ): Promise<boolean> {
    return this.backend.consumeInviteAtomic(inviteToken, now);
  }

  /**
   * Player account operations
   */
  async createPlayerAccount(data: {
    username: string;
    passwordHash: string;
  }): Promise<PlayerAccount> {
    return this.backend.createPlayerAccount(data);
  }

  async getPlayerAccountByUsername(
    username: string,
  ): Promise<PlayerAccount | null> {
    return this.backend.getPlayerAccountByUsername(username);
  }

  async getPlayerAccountById(id: string): Promise<PlayerAccount | null> {
    return this.backend.getPlayerAccountById(id);
  }

  async updatePlayerAccountLastLogin(id: string): Promise<void> {
    return this.backend.updatePlayerAccountLastLogin(id);
  }

  async setPlayerAccountMustChangePassword(
    id: string,
    mustChangePassword: boolean,
    newPasswordHash?: string,
  ): Promise<void> {
    return this.backend.setPlayerAccountMustChangePassword(
      id,
      mustChangePassword,
      newPasswordHash,
    );
  }

  async listPlayerAccounts(): Promise<PlayerAccount[]> {
    return this.backend.listPlayerAccounts();
  }

  async countSeatsForAccount(accountId: string): Promise<number> {
    return this.backend.countSeatsForAccount(accountId);
  }

  /**
   * Auth session operations
   */
  async createAuthSession(data: {
    accountId: string;
    refreshTokenHash: string;
    csrfToken: string;
    expiresAt: number;
  }): Promise<AuthSession> {
    return this.backend.createAuthSession(data);
  }

  async getAuthSession(refreshTokenHash: string): Promise<AuthSession | null> {
    return this.backend.getAuthSession(refreshTokenHash);
  }

  async updateAuthSession(
    sessionId: string,
    data: Partial<Pick<AuthSession, 'refreshTokenHash' | 'lastUsedAt'>>,
  ): Promise<void> {
    return this.backend.updateAuthSession(sessionId, data);
  }

  async revokeAuthSession(sessionId: string): Promise<void> {
    return this.backend.revokeAuthSession(sessionId);
  }

  async revokeAllAuthSessionsForAccount(accountId: string): Promise<void> {
    return this.backend.revokeAllAuthSessionsForAccount(accountId);
  }

  async listAuthSessionsForAccount(accountId: string): Promise<AuthSession[]> {
    return this.backend.listAuthSessionsForAccount(accountId);
  }

  async countActiveAuthSessionsForAccount(accountId: string): Promise<number> {
    return this.backend.countActiveAuthSessionsForAccount(accountId);
  }

  async revokeOldestAuthSessionForAccount(accountId: string): Promise<void> {
    return this.backend.revokeOldestAuthSessionForAccount(accountId);
  }

  async getServerSetting(key: string): Promise<string | null> {
    return this.backend.getServerSetting(key);
  }

  async setServerSetting(key: string, value: string): Promise<void> {
    return this.backend.setServerSetting(key, value);
  }
}
