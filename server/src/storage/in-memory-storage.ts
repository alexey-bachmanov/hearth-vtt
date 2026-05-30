import { randomUUID } from 'crypto';
import type {
  AdminSession,
  AuthSession,
  Campaign,
  Entity,
  Event,
  Invite,
  PlayerAccount,
  Seat,
  ServerAdmin,
  StorageBackend,
} from './storage.js';

/**
 * In-memory implementation of StorageBackend for use in unit tests.
 *
 * Each instance starts empty. Instantiate a fresh one per test suite to
 * guarantee isolation:
 *
 *   const storage = new Storage(new InMemoryBackend());
 *   await storage.init();
 *
 * All data lives in Maps. Spread-copies are returned so callers can't
 * accidentally mutate stored records.
 */
export class InMemoryBackend implements StorageBackend {
  private campaigns = new Map<string, Campaign>();
  private entities = new Map<string, Map<string, Entity>>();
  private events = new Map<string, Event[]>();
  private snapshots = new Map<string, { seq: number; blob: unknown }>();
  private serverAdmin: ServerAdmin | null = null;
  private adminSessions = new Map<string, AdminSession>();
  private playerAccounts = new Map<string, PlayerAccount>();
  private seats = new Map<string, Map<string, Seat>>();
  private invites = new Map<string, Invite>();
  private authSessions = new Map<string, AuthSession>(); // keyed by session id
  private serverSettings = new Map<string, string>();

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async init(): Promise<void> {}
  close(): void {}

  // ---------------------------------------------------------------------------
  // Campaigns
  // ---------------------------------------------------------------------------

  async createCampaign(name: string): Promise<Campaign> {
    const now = Date.now();
    const campaign: Campaign = {
      id: randomUUID(),
      name,
      createdAt: now,
      updatedAt: now,
    };
    this.campaigns.set(campaign.id, campaign);
    return { ...campaign };
  }

  async getCampaign(id: string): Promise<Campaign | null> {
    const c = this.campaigns.get(id);
    return c ? { ...c } : null;
  }

  async listCampaigns(): Promise<Campaign[]> {
    return [...this.campaigns.values()].map((c) => ({ ...c }));
  }

  async deleteCampaign(id: string): Promise<void> {
    // Capture seat IDs before deleting so invite cleanup can reference them.
    const seatIds = new Set(this.seats.get(id)?.keys() ?? []);

    this.campaigns.delete(id);
    this.entities.delete(id);
    this.events.delete(id);
    this.snapshots.delete(id);
    this.seats.delete(id);
    // Auth sessions are account-scoped; not cascade-deleted by campaign deletion.

    for (const [token, invite] of this.invites) {
      if (seatIds.has(invite.seatId)) {
        this.invites.delete(token);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Entities
  // ---------------------------------------------------------------------------

  async createEntity(
    campaignId: string,
    type: string,
    data: Record<string, unknown>,
  ): Promise<Entity> {
    const now = Date.now();
    const entity: Entity = {
      id: randomUUID(),
      campaignId,
      type,
      data,
      createdAt: now,
      updatedAt: now,
    };
    if (!this.entities.has(campaignId))
      this.entities.set(campaignId, new Map());
    this.entities.get(campaignId)!.set(entity.id, entity);
    return { ...entity };
  }

  async getEntity(
    campaignId: string,
    entityId: string,
  ): Promise<Entity | null> {
    const e = this.entities.get(campaignId)?.get(entityId);
    return e ? { ...e } : null;
  }

  async updateEntity(
    campaignId: string,
    entityId: string,
    data: Record<string, unknown>,
  ): Promise<Entity> {
    const existing = this.entities.get(campaignId)?.get(entityId);
    if (!existing)
      throw new Error(`Entity ${entityId} not found in campaign ${campaignId}`);
    const updated: Entity = { ...existing, data, updatedAt: Date.now() };
    this.entities.get(campaignId)!.set(entityId, updated);
    return { ...updated };
  }

  async deleteEntity(campaignId: string, entityId: string): Promise<void> {
    this.entities.get(campaignId)?.delete(entityId);
  }

  async listEntities(campaignId: string, type?: string): Promise<Entity[]> {
    const all = [...(this.entities.get(campaignId)?.values() ?? [])];
    return (type !== undefined ? all.filter((e) => e.type === type) : all).map(
      (e) => ({ ...e }),
    );
  }

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  async appendEvent(
    campaignId: string,
    event: Omit<Event, 'id' | 'seq' | 'timestamp'>,
  ): Promise<Event> {
    const existing = this.events.get(campaignId) ?? [];
    const seq = existing.length > 0 ? existing[existing.length - 1].seq + 1 : 1;
    const full: Event = {
      ...event,
      id: randomUUID(),
      seq,
      timestamp: Date.now(),
    };
    if (!this.events.has(campaignId)) this.events.set(campaignId, []);
    this.events.get(campaignId)!.push(full);
    return { ...full };
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
    let results = [...(this.events.get(campaignId) ?? [])];
    if (options?.afterTimestamp !== undefined) {
      results = results.filter((e) => e.timestamp > options.afterTimestamp!);
    }
    if (options?.afterSeq !== undefined) {
      results = results.filter((e) => e.seq > options.afterSeq!);
    }
    if (options?.entityId !== undefined) {
      results = results.filter((e) => e.entityId === options.entityId);
    }
    if (options?.type !== undefined) {
      results = results.filter((e) => e.type === options.type);
    }
    if (options?.limit !== undefined) {
      results = results.slice(0, options.limit);
    }
    return results.map((e) => ({ ...e }));
  }

  async getMaxEventSeq(campaignId: string): Promise<number> {
    const events = this.events.get(campaignId) ?? [];
    if (events.length === 0) return 0;
    return events[events.length - 1].seq;
  }

  // ---------------------------------------------------------------------------
  // Snapshot operations
  // ---------------------------------------------------------------------------

  async getLatestSnapshot(
    campaignId: string,
  ): Promise<{ seq: number; blob: unknown } | null> {
    const entry = this.snapshots.get(campaignId);
    return entry ? { ...entry } : null;
  }

  async putSnapshot(
    campaignId: string,
    seq: number,
    blob: unknown,
  ): Promise<void> {
    this.snapshots.set(campaignId, { seq, blob });
  }

  // ---------------------------------------------------------------------------
  // Transactions (no-op — in-memory is always consistent)
  // ---------------------------------------------------------------------------

  async beginTransaction(_campaignId: string): Promise<void> {}
  async commitTransaction(_campaignId: string): Promise<void> {}
  async rollbackTransaction(_campaignId: string): Promise<void> {}

  // ---------------------------------------------------------------------------
  // Server admin
  // ---------------------------------------------------------------------------

  async getServerAdmin(): Promise<ServerAdmin | null> {
    return this.serverAdmin ? { ...this.serverAdmin } : null;
  }

  async createServerAdmin(data: {
    usernameOrEmail: string;
    pinHash: string;
    setupPinExpiresAt: number;
  }): Promise<ServerAdmin> {
    const now = Date.now();
    this.serverAdmin = {
      id: randomUUID(),
      usernameOrEmail: data.usernameOrEmail,
      pinHash: data.pinHash,
      passwordHash: null,
      setupPinExpiresAt: data.setupPinExpiresAt,
      createdAt: now,
      updatedAt: now,
    };
    return { ...this.serverAdmin };
  }

  async updateServerAdmin(
    adminId: string,
    data: Partial<
      Pick<ServerAdmin, 'pinHash' | 'passwordHash' | 'setupPinExpiresAt'>
    >,
  ): Promise<void> {
    if (!this.serverAdmin || this.serverAdmin.id !== adminId) {
      throw new Error(`ServerAdmin ${adminId} not found`);
    }
    Object.assign(this.serverAdmin, data, { updatedAt: Date.now() });
  }

  // ---------------------------------------------------------------------------
  // Admin sessions
  // ---------------------------------------------------------------------------

  async createAdminSession(data: {
    adminId: string;
    sessionTokenHash: string;
    csrfToken: string;
    expiresAt: number;
  }): Promise<AdminSession> {
    const now = Date.now();
    const session: AdminSession = {
      id: randomUUID(),
      adminId: data.adminId,
      sessionTokenHash: data.sessionTokenHash,
      csrfToken: data.csrfToken,
      expiresAt: data.expiresAt,
      createdAt: now,
      lastUsedAt: now,
      revokedAt: null,
    };
    this.adminSessions.set(session.id, session);
    return { ...session };
  }

  async getAdminSession(
    sessionTokenHash: string,
  ): Promise<AdminSession | null> {
    for (const session of this.adminSessions.values()) {
      if (
        session.sessionTokenHash === sessionTokenHash &&
        session.revokedAt === null
      )
        return { ...session };
    }
    return null;
  }

  async revokeAdminSession(sessionId: string): Promise<void> {
    const session = this.adminSessions.get(sessionId);
    if (session) session.revokedAt = Date.now();
  }

  async listAdminSessions(): Promise<AdminSession[]> {
    return [...this.adminSessions.values()].map((s) => ({ ...s }));
  }

  async cleanupExpiredAdminSessions(): Promise<void> {
    const now = Date.now();
    for (const [id, session] of this.adminSessions) {
      if (session.expiresAt < now || session.revokedAt !== null) {
        this.adminSessions.delete(id);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Seats
  // ---------------------------------------------------------------------------

  async createSeat(data: {
    campaignId: string;
    displayName: string;
    role: 'gm' | 'player' | 'spectator';
  }): Promise<Seat> {
    const now = Date.now();
    const seat: Seat = {
      id: randomUUID(),
      campaignId: data.campaignId,
      displayName: data.displayName,
      role: data.role,
      accountId: null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    if (!this.seats.has(data.campaignId))
      this.seats.set(data.campaignId, new Map());
    this.seats.get(data.campaignId)!.set(seat.id, seat);
    return { ...seat };
  }

  async getSeat(campaignId: string, seatId: string): Promise<Seat | null> {
    const s = this.seats.get(campaignId)?.get(seatId);
    return s ? { ...s } : null;
  }

  async listSeats(campaignId: string): Promise<Seat[]> {
    return [...(this.seats.get(campaignId)?.values() ?? [])].map((s) => ({
      ...s,
    }));
  }

  async updateSeat(
    campaignId: string,
    seatId: string,
    data: Partial<
      Pick<Seat, 'displayName' | 'role' | 'isActive' | 'accountId'>
    >,
  ): Promise<void> {
    const seat = this.seats.get(campaignId)?.get(seatId);
    if (!seat)
      throw new Error(`Seat ${seatId} not found in campaign ${campaignId}`);
    Object.assign(seat, data, { updatedAt: Date.now() });
  }

  async deleteSeat(campaignId: string, seatId: string): Promise<void> {
    this.seats.get(campaignId)?.delete(seatId);
  }

  // ---------------------------------------------------------------------------
  // Invites
  // ---------------------------------------------------------------------------

  async createInvite(data: {
    campaignId: string;
    seatId: string;
    inviteToken: string;
    pinHash: string;
    maxUses: number;
    expiresAt: number;
  }): Promise<Invite> {
    const invite: Invite = {
      id: randomUUID(),
      seatId: data.seatId,
      inviteToken: data.inviteToken,
      pinHash: data.pinHash,
      maxUses: data.maxUses,
      usesRemaining: data.maxUses,
      expiresAt: data.expiresAt,
      createdAt: Date.now(),
      revokedAt: null,
    };
    this.invites.set(data.inviteToken, invite);
    return { ...invite };
  }

  async getInvite(inviteToken: string): Promise<Invite | null> {
    const invite = this.invites.get(inviteToken);
    return invite ? { ...invite } : null;
  }

  async listInvitesForSeat(
    campaignId: string,
    seatId: string,
  ): Promise<Invite[]> {
    // Verify the seat exists within this campaign, then filter invites by seatId.
    if (!this.seats.get(campaignId)?.has(seatId)) return [];
    return [...this.invites.values()]
      .filter((i) => i.seatId === seatId)
      .map((i) => ({ ...i }));
  }

  async revokeInvite(inviteToken: string): Promise<void> {
    const invite = this.invites.get(inviteToken);
    if (invite) invite.revokedAt = Date.now();
  }

  async consumeInviteAtomic(
    inviteToken: string,
    now: number,
  ): Promise<boolean> {
    const invite = this.invites.get(inviteToken);
    if (
      !invite ||
      invite.usesRemaining <= 0 ||
      invite.revokedAt !== null ||
      invite.expiresAt <= now
    ) {
      return false;
    }
    invite.usesRemaining--;
    return true;
  }

  // ---------------------------------------------------------------------------
  // Player accounts
  // ---------------------------------------------------------------------------

  async createPlayerAccount(data: {
    username: string;
    passwordHash: string;
  }): Promise<PlayerAccount> {
    const now = Date.now();
    const account: PlayerAccount = {
      id: randomUUID(),
      username: data.username,
      passwordHash: data.passwordHash,
      mustChangePassword: false,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: null,
    };
    this.playerAccounts.set(account.id, account);
    return { ...account };
  }

  async getPlayerAccountByUsername(
    username: string,
  ): Promise<PlayerAccount | null> {
    for (const account of this.playerAccounts.values()) {
      if (account.username === username) return { ...account };
    }
    return null;
  }

  async getPlayerAccountById(id: string): Promise<PlayerAccount | null> {
    const account = this.playerAccounts.get(id);
    return account ? { ...account } : null;
  }

  async updatePlayerAccountLastLogin(id: string): Promise<void> {
    const account = this.playerAccounts.get(id);
    if (account) {
      const now = Date.now();
      account.lastLoginAt = now;
      account.updatedAt = now;
    }
  }

  async setPlayerAccountMustChangePassword(
    id: string,
    mustChangePassword: boolean,
    newPasswordHash?: string,
  ): Promise<void> {
    const account = this.playerAccounts.get(id);
    if (!account) throw new Error(`PlayerAccount ${id} not found`);
    account.mustChangePassword = mustChangePassword;
    account.updatedAt = Date.now();
    if (newPasswordHash !== undefined) {
      account.passwordHash = newPasswordHash;
    }
  }

  async listPlayerAccounts(): Promise<PlayerAccount[]> {
    return [...this.playerAccounts.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((a) => ({ ...a }));
  }

  async countSeatsForAccount(accountId: string): Promise<number> {
    let count = 0;
    for (const campaignSeats of this.seats.values()) {
      for (const seat of campaignSeats.values()) {
        if (seat.accountId === accountId && seat.isActive) count++;
      }
    }
    return count;
  }

  // ---------------------------------------------------------------------------
  // Auth sessions
  // ---------------------------------------------------------------------------

  async createAuthSession(data: {
    accountId: string;
    refreshTokenHash: string;
    accessTokenHash: string;
    csrfToken: string;
    expiresAt: number;
  }): Promise<AuthSession> {
    const now = Date.now();
    const session: AuthSession = {
      id: randomUUID(),
      accountId: data.accountId,
      refreshTokenHash: data.refreshTokenHash,
      accessTokenHash: data.accessTokenHash,
      csrfToken: data.csrfToken,
      expiresAt: data.expiresAt,
      createdAt: now,
      lastUsedAt: now,
      revokedAt: null,
    };
    this.authSessions.set(session.id, session);
    return { ...session };
  }

  async getAuthSession(refreshTokenHash: string): Promise<AuthSession | null> {
    for (const session of this.authSessions.values()) {
      if (
        session.refreshTokenHash === refreshTokenHash &&
        session.revokedAt === null
      )
        return { ...session };
    }
    return null;
  }

  async updateAuthSession(
    sessionId: string,
    data: Partial<
      Pick<AuthSession, 'refreshTokenHash' | 'accessTokenHash' | 'lastUsedAt'>
    >,
  ): Promise<void> {
    const session = this.authSessions.get(sessionId);
    if (!session) throw new Error(`AuthSession ${sessionId} not found`);
    Object.assign(session, data);
  }

  async revokeAuthSession(sessionId: string): Promise<void> {
    const session = this.authSessions.get(sessionId);
    if (session) session.revokedAt = Date.now();
  }

  async revokeAllAuthSessionsForAccount(accountId: string): Promise<void> {
    const now = Date.now();
    for (const session of this.authSessions.values()) {
      if (session.accountId === accountId && session.revokedAt === null) {
        session.revokedAt = now;
      }
    }
  }

  async listAuthSessionsForAccount(accountId: string): Promise<AuthSession[]> {
    return [...this.authSessions.values()]
      .filter((s) => s.accountId === accountId)
      .map((s) => ({ ...s }));
  }

  async getServerSetting(key: string): Promise<string | null> {
    return this.serverSettings.get(key) ?? null;
  }

  async setServerSetting(key: string, value: string): Promise<void> {
    this.serverSettings.set(key, value);
  }
}
