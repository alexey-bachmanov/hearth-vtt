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

      await storage.deleteCampaign(campaign.id);

      expect(await storage.getCampaign(campaign.id)).toBeNull();
      expect(await storage.getSeat(campaign.id, seat.id)).toBeNull();
      expect(await storage.getInvite('cascade-test-token')).toBeNull();
      // Auth sessions are account-scoped and are NOT cascade-deleted by campaign deletion.
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

    it('assigns monotonically increasing seq values per campaign', async () => {
      const e1 = await storage.appendEvent(campaignId, {
        campaignId,
        entityId: null,
        type: 'first',
        data: {},
      });
      const e2 = await storage.appendEvent(campaignId, {
        campaignId,
        entityId: null,
        type: 'second',
        data: {},
      });
      const e3 = await storage.appendEvent(campaignId, {
        campaignId,
        entityId: null,
        type: 'third',
        data: {},
      });

      expect(e1.seq).toBe(1);
      expect(e2.seq).toBe(2);
      expect(e3.seq).toBe(3);
    });

    it('seq numbering is independent between campaigns', async () => {
      const eA = await storage.appendEvent(campaignId, {
        campaignId,
        entityId: null,
        type: 'a',
        data: {},
      });
      const eB = await storage.appendEvent(otherCampaignId, {
        campaignId: otherCampaignId,
        entityId: null,
        type: 'b',
        data: {},
      });
      expect(eA.seq).toBe(1);
      expect(eB.seq).toBe(1);
    });

    it('seq is persisted and returned in getEvents', async () => {
      await storage.appendEvent(campaignId, {
        campaignId,
        entityId: null,
        type: 'x',
        data: {},
      });
      await storage.appendEvent(campaignId, {
        campaignId,
        entityId: null,
        type: 'y',
        data: {},
      });

      const events = await storage.getEvents(campaignId);
      expect(events[0].seq).toBe(1);
      expect(events[1].seq).toBe(2);
    });

    it('getMaxEventSeq returns 0 for a campaign with no events', async () => {
      const max = await storage.getMaxEventSeq(campaignId);
      expect(max).toBe(0);
    });

    it('getMaxEventSeq returns the highest seq after appending events', async () => {
      await storage.appendEvent(campaignId, {
        campaignId,
        entityId: null,
        type: 'a',
        data: {},
      });
      await storage.appendEvent(campaignId, {
        campaignId,
        entityId: null,
        type: 'b',
        data: {},
      });
      const max = await storage.getMaxEventSeq(campaignId);
      expect(max).toBe(2);
    });

    it('filters events after a given seq (afterSeq)', async () => {
      await storage.appendEvent(campaignId, {
        campaignId,
        entityId: null,
        type: 'one',
        data: {},
      });
      await storage.appendEvent(campaignId, {
        campaignId,
        entityId: null,
        type: 'two',
        data: {},
      });
      await storage.appendEvent(campaignId, {
        campaignId,
        entityId: null,
        type: 'three',
        data: {},
      });

      const events = await storage.getEvents(campaignId, { afterSeq: 1 });
      expect(events).toHaveLength(2);
      expect(events[0].type).toBe('two');
      expect(events[1].type).toBe('three');
    });

    it('afterSeq: 0 returns all events', async () => {
      await storage.appendEvent(campaignId, {
        campaignId,
        entityId: null,
        type: 'sole',
        data: {},
      });
      const events = await storage.getEvents(campaignId, { afterSeq: 0 });
      expect(events).toHaveLength(1);
    });
  });

  // ==========================================================================
  // Snapshots
  // ==========================================================================

  describe('Snapshots', () => {
    let campaignId: string;

    beforeEach(async () => {
      const c = await storage.createCampaign('Snapshot Campaign');
      campaignId = c.id;
    });

    it('getLatestSnapshot returns null when no snapshot exists', async () => {
      const snap = await storage.getLatestSnapshot(campaignId);
      expect(snap).toBeNull();
    });

    it('putSnapshot and getLatestSnapshot round-trip', async () => {
      const blob = { tokens: [{ id: 'tk-1', x: 10, y: 20 }] };
      await storage.putSnapshot(campaignId, 5, blob);

      const snap = await storage.getLatestSnapshot(campaignId);
      expect(snap).not.toBeNull();
      expect(snap!.seq).toBe(5);
      expect(snap!.blob).toEqual(blob);
    });

    it('putSnapshot overwrites a previous snapshot for the same campaign', async () => {
      await storage.putSnapshot(campaignId, 3, { version: 'v1' });
      await storage.putSnapshot(campaignId, 7, { version: 'v2' });

      const snap = await storage.getLatestSnapshot(campaignId);
      expect(snap!.seq).toBe(7);
      expect(snap!.blob).toEqual({ version: 'v2' });
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

    it('atomically consumes an invite use and returns true on success', async () => {
      await storage.createInvite({
        campaignId,
        seatId,
        inviteToken: 'use-token',
        pinHash: 'hash',
        maxUses: 2,
        expiresAt: Date.now() + 3600_000,
      });

      const result = await storage.consumeInviteAtomic('use-token', Date.now());
      expect(result).toBe(true);

      const invite = await storage.getInvite('use-token');
      expect(invite?.usesRemaining).toBe(1);
    });

    it('returns false and does not decrement when usesRemaining is 0', async () => {
      await storage.createInvite({
        campaignId,
        seatId,
        inviteToken: 'zero-token',
        pinHash: 'hash',
        maxUses: 1,
        expiresAt: Date.now() + 3600_000,
      });

      const first = await storage.consumeInviteAtomic('zero-token', Date.now());
      expect(first).toBe(true);

      const second = await storage.consumeInviteAtomic('zero-token', Date.now());
      expect(second).toBe(false);

      const invite = await storage.getInvite('zero-token');
      expect(invite?.usesRemaining).toBe(0);
    });

    it('returns false for an expired invite without decrementing', async () => {
      await storage.createInvite({
        campaignId,
        seatId,
        inviteToken: 'expired-token',
        pinHash: 'hash',
        maxUses: 5,
        expiresAt: Date.now() - 1, // already expired
      });

      const result = await storage.consumeInviteAtomic('expired-token', Date.now());
      expect(result).toBe(false);

      const invite = await storage.getInvite('expired-token');
      expect(invite?.usesRemaining).toBe(5); // unchanged
    });

    it('returns false for a revoked invite without decrementing', async () => {
      await storage.createInvite({
        campaignId,
        seatId,
        inviteToken: 'revoked-consume-token',
        pinHash: 'hash',
        maxUses: 5,
        expiresAt: Date.now() + 3600_000,
      });

      await storage.revokeInvite('revoked-consume-token');

      const result = await storage.consumeInviteAtomic('revoked-consume-token', Date.now());
      expect(result).toBe(false);

      const invite = await storage.getInvite('revoked-consume-token');
      expect(invite?.usesRemaining).toBe(5); // unchanged
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
    let accountId: string;

    beforeEach(async () => {
      const account = await storage.createPlayerAccount({
        username: 'testplayer',
        passwordHash: 'hashed-password',
      });
      accountId = account.id;
    });

    it('creates and retrieves an auth session by refresh token hash', async () => {
      const session = await storage.createAuthSession({
        accountId,
        refreshTokenHash: 'refresh-hash-xyz',
        accessTokenHash: 'access-hash-xyz',
        expiresAt: Date.now() + 3600_000,
        csrfToken: 'csrf-xyz',
      });

      const retrieved = await storage.getAuthSession('refresh-hash-xyz');
      expect(retrieved?.id).toBe(session.id);
      expect(retrieved?.accountId).toBe(accountId);
    });

    it('returns null for a revoked auth session', async () => {
      const session = await storage.createAuthSession({
        accountId,
        refreshTokenHash: 'to-revoke-hash',
        accessTokenHash: 'access-hash',
        expiresAt: Date.now() + 3600_000,
        csrfToken: 'csrf-revoke',
      });

      await storage.revokeAuthSession(session.id);
      expect(await storage.getAuthSession('to-revoke-hash')).toBeNull();
    });

    it('updates refresh token hash via updateAuthSession', async () => {
      const session = await storage.createAuthSession({
        accountId,
        refreshTokenHash: 'old-refresh-hash',
        accessTokenHash: 'access-hash',
        expiresAt: Date.now() + 3600_000,
        csrfToken: 'csrf-update',
      });

      await storage.updateAuthSession(session.id, {
        refreshTokenHash: 'new-refresh-hash',
      });

      expect(await storage.getAuthSession('old-refresh-hash')).toBeNull();
      expect(await storage.getAuthSession('new-refresh-hash')).not.toBeNull();
    });

    it('lists auth sessions for an account (excludes other accounts)', async () => {
      const otherAccount = await storage.createPlayerAccount({
        username: 'otherplayer',
        passwordHash: 'hashed-password-2',
      });

      await storage.createAuthSession({
        accountId,
        refreshTokenHash: 'hash-s1',
        accessTokenHash: 'access-s1',
        expiresAt: Date.now() + 3600_000,
        csrfToken: 'csrf-s1',
      });
      await storage.createAuthSession({
        accountId: otherAccount.id,
        refreshTokenHash: 'hash-s2',
        accessTokenHash: 'access-s2',
        expiresAt: Date.now() + 3600_000,
        csrfToken: 'csrf-s2',
      });

      const sessions = await storage.listAuthSessionsForAccount(accountId);
      expect(sessions).toHaveLength(1);
      expect(sessions[0].refreshTokenHash).toBe('hash-s1');
    });

    it('revokes all sessions for an account', async () => {
      await storage.createAuthSession({
        accountId,
        refreshTokenHash: 'hash-b1',
        accessTokenHash: 'access-b1',
        expiresAt: Date.now() + 3600_000,
        csrfToken: 'csrf-b1',
      });
      await storage.createAuthSession({
        accountId,
        refreshTokenHash: 'hash-b2',
        accessTokenHash: 'access-b2',
        expiresAt: Date.now() + 3600_000,
        csrfToken: 'csrf-b2',
      });

      await storage.revokeAllAuthSessionsForAccount(accountId);

      expect(await storage.getAuthSession('hash-b1')).toBeNull();
      expect(await storage.getAuthSession('hash-b2')).toBeNull();
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

// ============================================================================
// InMemoryBackend — new storage primitive parity tests
// ============================================================================

import { Storage } from './storage.js';
import { InMemoryBackend } from './in-memory-storage.js';

describe('InMemoryBackend — new storage primitives', () => {
  let storage: Storage;
  let campaignId: string;

  beforeEach(async () => {
    storage = new Storage(new InMemoryBackend());
    const c = await storage.createCampaign('Test');
    campaignId = c.id;
  });

  describe('seq and getMaxEventSeq', () => {
    it('assigns seq starting from 1 and incrementing', async () => {
      const e1 = await storage.appendEvent(campaignId, {
        campaignId,
        entityId: null,
        type: 'a',
        data: {},
      });
      const e2 = await storage.appendEvent(campaignId, {
        campaignId,
        entityId: null,
        type: 'b',
        data: {},
      });
      expect(e1.seq).toBe(1);
      expect(e2.seq).toBe(2);
    });

    it('getMaxEventSeq returns 0 for empty campaign', async () => {
      expect(await storage.getMaxEventSeq(campaignId)).toBe(0);
    });

    it('getMaxEventSeq returns highest seq after appends', async () => {
      await storage.appendEvent(campaignId, {
        campaignId,
        entityId: null,
        type: 'x',
        data: {},
      });
      await storage.appendEvent(campaignId, {
        campaignId,
        entityId: null,
        type: 'y',
        data: {},
      });
      expect(await storage.getMaxEventSeq(campaignId)).toBe(2);
    });

    it('seq is returned in getEvents', async () => {
      await storage.appendEvent(campaignId, {
        campaignId,
        entityId: null,
        type: 'first',
        data: {},
      });
      const events = await storage.getEvents(campaignId);
      expect(events[0].seq).toBe(1);
    });
  });

  describe('afterSeq filter', () => {
    it('filters events with seq > afterSeq', async () => {
      await storage.appendEvent(campaignId, {
        campaignId,
        entityId: null,
        type: 'one',
        data: {},
      });
      await storage.appendEvent(campaignId, {
        campaignId,
        entityId: null,
        type: 'two',
        data: {},
      });
      await storage.appendEvent(campaignId, {
        campaignId,
        entityId: null,
        type: 'three',
        data: {},
      });

      const results = await storage.getEvents(campaignId, { afterSeq: 1 });
      expect(results).toHaveLength(2);
      expect(results[0].type).toBe('two');
      expect(results[1].type).toBe('three');
    });

    it('afterSeq: 0 returns all events', async () => {
      await storage.appendEvent(campaignId, {
        campaignId,
        entityId: null,
        type: 'only',
        data: {},
      });
      const results = await storage.getEvents(campaignId, { afterSeq: 0 });
      expect(results).toHaveLength(1);
    });
  });

  describe('snapshots', () => {
    it('getLatestSnapshot returns null when no snapshot exists', async () => {
      expect(await storage.getLatestSnapshot(campaignId)).toBeNull();
    });

    it('putSnapshot and getLatestSnapshot round-trip', async () => {
      const blob = { tokens: [{ id: 'tk-1', x: 3, y: 7 }] };
      await storage.putSnapshot(campaignId, 4, blob);
      const snap = await storage.getLatestSnapshot(campaignId);
      expect(snap).not.toBeNull();
      expect(snap!.seq).toBe(4);
      expect(snap!.blob).toEqual(blob);
    });

    it('putSnapshot replaces a previous snapshot', async () => {
      await storage.putSnapshot(campaignId, 2, { v: 1 });
      await storage.putSnapshot(campaignId, 9, { v: 2 });
      const snap = await storage.getLatestSnapshot(campaignId);
      expect(snap!.seq).toBe(9);
      expect(snap!.blob).toEqual({ v: 2 });
    });
  });
});
