import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteStorage } from './sqlite-storage.js';

describe('SqliteStorage (:memory: mode)', () => {
  let storage: SqliteStorage;

  beforeEach(async () => {
    storage = new SqliteStorage({ dataDir: ':memory:' });
    await storage.init();
  });

  afterEach(() => {
    storage.close();
  });

  // ==========================================================================
  // Campaign CRUD
  // ==========================================================================

  describe('Campaign CRUD', () => {
    it('creates a campaign and retrieves it by ID', async () => {
      const campaign = await storage.createCampaign('Test Campaign');
      expect(campaign.name).toBe('Test Campaign');
      expect(campaign.id).toBeTruthy();
      expect(campaign.createdAt).toBeGreaterThan(0);

      const retrieved = await storage.getCampaign(campaign.id);
      expect(retrieved).toEqual(campaign);
    });

    it('returns null for a nonexistent campaign ID', async () => {
      const result = await storage.getCampaign(
        '00000000-0000-0000-0000-000000000000',
      );
      expect(result).toBeNull();
    });

    it('lists campaigns ordered by created_at DESC', async () => {
      await storage.createCampaign('Alpha');
      await storage.createCampaign('Beta');
      const campaigns = await storage.listCampaigns();
      expect(campaigns).toHaveLength(2);
      expect(campaigns[0].name).toBe('Beta');
      expect(campaigns[1].name).toBe('Alpha');
    });

    it('returns empty array when no campaigns exist', async () => {
      const campaigns = await storage.listCampaigns();
      expect(campaigns).toHaveLength(0);
    });

    it('deletes a campaign and cascades to child rows', async () => {
      const campaign = await storage.createCampaign('To Delete');

      const seat = await storage.createSeat({
        campaignId: campaign.id,
        displayName: 'Player One',
        role: 'player',
      });
      await storage.createInvite({
        campaignId: campaign.id,
        seatId: seat.id,
        inviteToken: 'cascade-test-token',
        pinHash: 'hash',
        maxUses: 1,
        expiresAt: Date.now() + 3600_000,
      });
      await storage.createAuthSession({
        campaignId: campaign.id,
        seatId: seat.id,
        refreshTokenHash: 'cascade-refresh-hash',
        accessTokenHash: 'cascade-access-hash',
        expiresAt: Date.now() + 3600_000,
      });

      await storage.deleteCampaign(campaign.id);

      expect(await storage.getCampaign(campaign.id)).toBeNull();
      expect(await storage.getSeat(campaign.id, seat.id)).toBeNull();
      expect(await storage.getInvite('cascade-test-token')).toBeNull();
      // getAuthSession filters revoked_at IS NULL; deleted rows return null
      expect(await storage.getAuthSession('cascade-refresh-hash')).toBeNull();
    });

    it('silently succeeds when deleting a nonexistent campaign', async () => {
      await expect(
        storage.deleteCampaign('00000000-0000-0000-0000-000000000000'),
      ).resolves.toBeUndefined();
    });
  });

  // ==========================================================================
  // Entity CRUD
  // ==========================================================================

  describe('Entity CRUD', () => {
    let campaignId: string;
    let otherCampaignId: string;

    beforeEach(async () => {
      const c1 = await storage.createCampaign('Main Campaign');
      const c2 = await storage.createCampaign('Other Campaign');
      campaignId = c1.id;
      otherCampaignId = c2.id;
    });

    it('creates an entity and retrieves it by ID', async () => {
      const entity = await storage.createEntity(campaignId, 'actor', {
        name: 'Gandalf',
      });

      expect(entity.id).toBeTruthy();
      expect(entity.campaignId).toBe(campaignId);
      expect(entity.type).toBe('actor');
      expect(entity.data).toEqual({ name: 'Gandalf' });

      const retrieved = await storage.getEntity(campaignId, entity.id);
      expect(retrieved).toEqual(entity);
    });

    it('returns null for an entity looked up with a different campaignId', async () => {
      const entity = await storage.createEntity(campaignId, 'actor', {});
      expect(await storage.getEntity(otherCampaignId, entity.id)).toBeNull();
    });

    it('updates entity data', async () => {
      const entity = await storage.createEntity(campaignId, 'actor', {
        hp: 10,
      });
      const updated = await storage.updateEntity(campaignId, entity.id, {
        hp: 8,
      });
      expect(updated.data).toEqual({ hp: 8 });
      expect(updated.updatedAt).toBeGreaterThanOrEqual(entity.updatedAt);
    });

    it('deletes an entity', async () => {
      const entity = await storage.createEntity(campaignId, 'actor', {});
      await storage.deleteEntity(campaignId, entity.id);
      expect(await storage.getEntity(campaignId, entity.id)).toBeNull();
    });

    it('lists all entities for a campaign (excludes other campaigns)', async () => {
      await storage.createEntity(campaignId, 'actor', { name: 'Frodo' });
      await storage.createEntity(campaignId, 'actor', { name: 'Sam' });
      await storage.createEntity(otherCampaignId, 'actor', { name: 'Sauron' });

      const entities = await storage.listEntities(campaignId);
      expect(entities).toHaveLength(2);
      expect(entities.every((e) => e.campaignId === campaignId)).toBe(true);
    });

    it('lists entities filtered by type', async () => {
      await storage.createEntity(campaignId, 'actor', { name: 'Aragorn' });
      await storage.createEntity(campaignId, 'item', { name: 'Sword' });
      await storage.createEntity(campaignId, 'item', { name: 'Shield' });

      const items = await storage.listEntities(campaignId, 'item');
      expect(items).toHaveLength(2);
      expect(items.every((e) => e.type === 'item')).toBe(true);
    });
  });

  // ==========================================================================
  // Event sequencing
  // ==========================================================================

  describe('Event sequencing', () => {
    let campaignId: string;
    let otherCampaignId: string;

    beforeEach(async () => {
      const c1 = await storage.createCampaign('Campaign A');
      const c2 = await storage.createCampaign('Campaign B');
      campaignId = c1.id;
      otherCampaignId = c2.id;
    });

    it('appends an event and retrieves it', async () => {
      const event = await storage.appendEvent(campaignId, {
        campaignId,
        entityId: 'entity-1',
        type: 'move',
        data: { x: 5, y: 3 },
      });

      expect(event.id).toBeTruthy();
      expect(event.type).toBe('move');
      expect(event.timestamp).toBeGreaterThan(0);

      const events = await storage.getEvents(campaignId);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ type: 'move', data: { x: 5, y: 3 } });
    });

    it('returns events in ascending timestamp order', async () => {
      await storage.appendEvent(campaignId, {
        campaignId,
        entityId: null,
        type: 'first',
        data: {},
      });
      await storage.appendEvent(campaignId, {
        campaignId,
        entityId: null,
        type: 'second',
        data: {},
      });
      await storage.appendEvent(campaignId, {
        campaignId,
        entityId: null,
        type: 'third',
        data: {},
      });

      const events = await storage.getEvents(campaignId);
      expect(events).toHaveLength(3);
      // ASC ordering by timestamp
      expect(events[0].type).toBe('first');
      expect(events[2].type).toBe('third');
    });

    it('filters events after a given timestamp', async () => {
      const e1 = await storage.appendEvent(campaignId, {
        campaignId,
        entityId: null,
        type: 'early',
        data: {},
      });
      // Ensure the next event has a strictly later timestamp
      await new Promise((r) => setTimeout(r, 2));
      await storage.appendEvent(campaignId, {
        campaignId,
        entityId: null,
        type: 'late',
        data: {},
      });

      const events = await storage.getEvents(campaignId, {
        afterTimestamp: e1.timestamp,
      });
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('late');
    });

    it('does not return events from another campaign', async () => {
      await storage.appendEvent(campaignId, {
        campaignId,
        entityId: null,
        type: 'event-a',
        data: {},
      });
      await storage.appendEvent(otherCampaignId, {
        campaignId: otherCampaignId,
        entityId: null,
        type: 'event-b',
        data: {},
      });

      const eventsA = await storage.getEvents(campaignId);
      expect(eventsA).toHaveLength(1);
      expect(eventsA[0].type).toBe('event-a');
    });
  });

  // ==========================================================================
  // Server admin
  // ==========================================================================

  describe('Server admin', () => {
    it('creates a server admin and retrieves it', async () => {
      const admin = await storage.createServerAdmin({
        usernameOrEmail: 'admin@example.com',
        pinHash: 'pin-hash-value',
        setupPinExpiresAt: Date.now() + 3600_000,
      });

      expect(admin.id).toBeTruthy();
      expect(admin.usernameOrEmail).toBe('admin@example.com');
      expect(admin.passwordHash).toBeNull();

      const retrieved = await storage.getServerAdmin();
      expect(retrieved?.id).toBe(admin.id);
    });

    it('returns null when no admin exists', async () => {
      expect(await storage.getServerAdmin()).toBeNull();
    });

    it('updates server admin fields', async () => {
      const admin = await storage.createServerAdmin({
        usernameOrEmail: 'admin',
        pinHash: 'old-pin',
        setupPinExpiresAt: Date.now() + 3600_000,
      });

      await storage.updateServerAdmin(admin.id, {
        passwordHash: 'new-password-hash',
        pinHash: null,
      });

      const updated = await storage.getServerAdmin();
      expect(updated?.passwordHash).toBe('new-password-hash');
      expect(updated?.pinHash).toBeNull();
    });
  });

  // ==========================================================================
  // Admin sessions
  // ==========================================================================

  describe('Admin sessions', () => {
    let adminId: string;

    beforeEach(async () => {
      const admin = await storage.createServerAdmin({
        usernameOrEmail: 'admin',
        pinHash: 'pin',
        setupPinExpiresAt: Date.now() + 3600_000,
      });
      adminId = admin.id;
    });

    it('creates and retrieves an admin session by token hash', async () => {
      const session = await storage.createAdminSession({
        adminId,
        sessionTokenHash: 'session-token-hash',
        csrfToken: 'csrf-token',
        expiresAt: Date.now() + 3600_000,
      });

      expect(session.adminId).toBe(adminId);

      const retrieved = await storage.getAdminSession('session-token-hash');
      expect(retrieved?.id).toBe(session.id);
    });

    it('returns null for a revoked session', async () => {
      const session = await storage.createAdminSession({
        adminId,
        sessionTokenHash: 'revoked-token-hash',
        csrfToken: 'csrf',
        expiresAt: Date.now() + 3600_000,
      });

      await storage.revokeAdminSession(session.id);
      expect(await storage.getAdminSession('revoked-token-hash')).toBeNull();
    });

    it('lists all admin sessions (including revoked)', async () => {
      const s1 = await storage.createAdminSession({
        adminId,
        sessionTokenHash: 'hash-1',
        csrfToken: 'csrf-1',
        expiresAt: Date.now() + 3600_000,
      });
      await storage.createAdminSession({
        adminId,
        sessionTokenHash: 'hash-2',
        csrfToken: 'csrf-2',
        expiresAt: Date.now() + 3600_000,
      });
      await storage.revokeAdminSession(s1.id);

      const sessions = await storage.listAdminSessions();
      expect(sessions).toHaveLength(2);
    });

    it('cleanupExpiredAdminSessions removes expired and revoked sessions', async () => {
      const active = await storage.createAdminSession({
        adminId,
        sessionTokenHash: 'active-hash',
        csrfToken: 'csrf',
        expiresAt: Date.now() + 3600_000,
      });
      await storage.createAdminSession({
        adminId,
        sessionTokenHash: 'expired-hash',
        csrfToken: 'csrf',
        expiresAt: Date.now() - 1000,
      });
      const toRevoke = await storage.createAdminSession({
        adminId,
        sessionTokenHash: 'revoked-hash',
        csrfToken: 'csrf',
        expiresAt: Date.now() + 3600_000,
      });
      await storage.revokeAdminSession(toRevoke.id);

      await storage.cleanupExpiredAdminSessions();

      const remaining = await storage.listAdminSessions();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe(active.id);
    });
  });

  // ==========================================================================
  // Seats
  // ==========================================================================

  describe('Seats', () => {
    let campaignId: string;

    beforeEach(async () => {
      const campaign = await storage.createCampaign('Seat Campaign');
      campaignId = campaign.id;
    });

    it('creates and retrieves a seat', async () => {
      const seat = await storage.createSeat({
        campaignId,
        displayName: 'The DM',
        role: 'gm',
      });

      expect(seat.role).toBe('gm');
      expect(seat.isActive).toBe(true);
      expect(seat.campaignId).toBe(campaignId);

      const retrieved = await storage.getSeat(campaignId, seat.id);
      expect(retrieved).toEqual(seat);
    });

    it('returns null for a seat looked up with a different campaignId', async () => {
      const other = await storage.createCampaign('Other');
      const seat = await storage.createSeat({
        campaignId: other.id,
        displayName: 'Player',
        role: 'player',
      });
      expect(await storage.getSeat(campaignId, seat.id)).toBeNull();
    });

    it('lists seats for a campaign', async () => {
      await storage.createSeat({ campaignId, displayName: 'GM', role: 'gm' });
      await storage.createSeat({
        campaignId,
        displayName: 'P1',
        role: 'player',
      });

      const seats = await storage.listSeats(campaignId);
      expect(seats).toHaveLength(2);
    });

    it('updates a seat', async () => {
      const seat = await storage.createSeat({
        campaignId,
        displayName: 'Old Name',
        role: 'player',
      });
      await storage.updateSeat(campaignId, seat.id, {
        displayName: 'New Name',
        isActive: false,
      });

      const updated = await storage.getSeat(campaignId, seat.id);
      expect(updated?.displayName).toBe('New Name');
      expect(updated?.isActive).toBe(false);
    });

    it('deletes a seat', async () => {
      const seat = await storage.createSeat({
        campaignId,
        displayName: 'Temp',
        role: 'spectator',
      });
      await storage.deleteSeat(campaignId, seat.id);
      expect(await storage.getSeat(campaignId, seat.id)).toBeNull();
    });
  });

  // ==========================================================================
  // Invites
  // ==========================================================================

  describe('Invites', () => {
    let campaignId: string;
    let seatId: string;

    beforeEach(async () => {
      const campaign = await storage.createCampaign('Invite Campaign');
      campaignId = campaign.id;
      const seat = await storage.createSeat({
        campaignId,
        displayName: 'Player',
        role: 'player',
      });
      seatId = seat.id;
    });

    it('creates an invite and retrieves it by token', async () => {
      const invite = await storage.createInvite({
        campaignId,
        seatId,
        inviteToken: 'invite-token-xyz',
        pinHash: 'pin-hash',
        maxUses: 3,
        expiresAt: Date.now() + 3600_000,
      });

      expect(invite.usesRemaining).toBe(3);

      const retrieved = await storage.getInvite('invite-token-xyz');
      expect(retrieved?.id).toBe(invite.id);
      expect(retrieved?.usesRemaining).toBe(3);
    });

    it('decrements usesRemaining on claim', async () => {
      await storage.createInvite({
        campaignId,
        seatId,
        inviteToken: 'use-token',
        pinHash: 'hash',
        maxUses: 2,
        expiresAt: Date.now() + 3600_000,
      });

      await storage.decrementInviteUses('use-token');

      const invite = await storage.getInvite('use-token');
      expect(invite?.usesRemaining).toBe(1);
    });

    it('does not decrement usesRemaining below zero', async () => {
      await storage.createInvite({
        campaignId,
        seatId,
        inviteToken: 'zero-token',
        pinHash: 'hash',
        maxUses: 1,
        expiresAt: Date.now() + 3600_000,
      });

      await storage.decrementInviteUses('zero-token');
      await storage.decrementInviteUses('zero-token'); // no-op when already 0

      const invite = await storage.getInvite('zero-token');
      expect(invite?.usesRemaining).toBe(0);
    });

    it('sets revokedAt on revoke (does not delete the row)', async () => {
      await storage.createInvite({
        campaignId,
        seatId,
        inviteToken: 'revoke-token',
        pinHash: 'hash',
        maxUses: 1,
        expiresAt: Date.now() + 3600_000,
      });

      await storage.revokeInvite('revoke-token');

      const invite = await storage.getInvite('revoke-token');
      expect(invite).not.toBeNull();
      expect(invite?.revokedAt).not.toBeNull();
    });

    it('lists invites for a specific seat (excludes other seats)', async () => {
      const otherSeat = await storage.createSeat({
        campaignId,
        displayName: 'Other',
        role: 'player',
      });

      await storage.createInvite({
        campaignId,
        seatId,
        inviteToken: 'token-a',
        pinHash: 'h',
        maxUses: 1,
        expiresAt: Date.now() + 3600_000,
      });
      await storage.createInvite({
        campaignId,
        seatId: otherSeat.id,
        inviteToken: 'token-b',
        pinHash: 'h',
        maxUses: 1,
        expiresAt: Date.now() + 3600_000,
      });

      const invites = await storage.listInvitesForSeat(campaignId, seatId);
      expect(invites).toHaveLength(1);
      expect(invites[0].inviteToken).toBe('token-a');
    });

    it('returns null for a nonexistent token', async () => {
      expect(await storage.getInvite('no-such-token')).toBeNull();
    });
  });

  // ==========================================================================
  // Auth sessions
  // ==========================================================================

  describe('Auth sessions', () => {
    let campaignId: string;
    let seatId: string;

    beforeEach(async () => {
      const campaign = await storage.createCampaign('Auth Campaign');
      campaignId = campaign.id;
      const seat = await storage.createSeat({
        campaignId,
        displayName: 'Player',
        role: 'player',
      });
      seatId = seat.id;
    });

    it('creates and retrieves an auth session by refresh token hash', async () => {
      const session = await storage.createAuthSession({
        campaignId,
        seatId,
        refreshTokenHash: 'refresh-hash-xyz',
        accessTokenHash: 'access-hash-xyz',
        expiresAt: Date.now() + 3600_000,
      });

      const retrieved = await storage.getAuthSession('refresh-hash-xyz');
      expect(retrieved?.id).toBe(session.id);
      expect(retrieved?.seatId).toBe(seatId);
    });

    it('returns null for a revoked auth session', async () => {
      const session = await storage.createAuthSession({
        campaignId,
        seatId,
        refreshTokenHash: 'to-revoke-hash',
        accessTokenHash: 'access-hash',
        expiresAt: Date.now() + 3600_000,
      });

      await storage.revokeAuthSession(campaignId, session.id);
      expect(await storage.getAuthSession('to-revoke-hash')).toBeNull();
    });

    it('rotates refresh token hash via updateAuthSession', async () => {
      const session = await storage.createAuthSession({
        campaignId,
        seatId,
        refreshTokenHash: 'old-refresh-hash',
        accessTokenHash: 'access-hash',
        expiresAt: Date.now() + 3600_000,
      });

      await storage.updateAuthSession(campaignId, session.id, {
        refreshTokenHash: 'new-refresh-hash',
      });

      expect(await storage.getAuthSession('old-refresh-hash')).toBeNull();
      expect(await storage.getAuthSession('new-refresh-hash')).not.toBeNull();
    });

    it('lists auth sessions for a seat (excludes other seats)', async () => {
      const otherSeat = await storage.createSeat({
        campaignId,
        displayName: 'Other',
        role: 'spectator',
      });

      await storage.createAuthSession({
        campaignId,
        seatId,
        refreshTokenHash: 'hash-s1',
        accessTokenHash: 'access-s1',
        expiresAt: Date.now() + 3600_000,
      });
      await storage.createAuthSession({
        campaignId,
        seatId: otherSeat.id,
        refreshTokenHash: 'hash-s2',
        accessTokenHash: 'access-s2',
        expiresAt: Date.now() + 3600_000,
      });

      const sessions = await storage.listAuthSessionsForSeat(
        campaignId,
        seatId,
      );
      expect(sessions).toHaveLength(1);
      expect(sessions[0].refreshTokenHash).toBe('hash-s1');
    });
  });

  // ==========================================================================
  // Transactions (not yet implemented)
  // ==========================================================================

  describe('Transactions', () => {
    let campaignId: string;

    beforeEach(async () => {
      const campaign = await storage.createCampaign('Tx Campaign');
      campaignId = campaign.id;
    });

    // TODO(tech-debt): these stubs throw until transactions are implemented
    it('beginTransaction throws "not yet implemented"', async () => {
      await expect(storage.beginTransaction(campaignId)).rejects.toThrow();
    });

    it('commitTransaction throws "not yet implemented"', async () => {
      await expect(storage.commitTransaction(campaignId)).rejects.toThrow();
    });

    it('rollbackTransaction throws "not yet implemented"', async () => {
      await expect(storage.rollbackTransaction(campaignId)).rejects.toThrow();
    });
  });
});
