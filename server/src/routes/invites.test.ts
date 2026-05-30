// ---------------------------------------------------------------------------
// Module-level environment setup — must appear before any imports.
// ---------------------------------------------------------------------------
process.env.NODE_ENV = 'development';
process.env.ADMIN_ALLOW_REMOTE = 'true'; // Allows inject() to use any IP
process.env.COOKIE_SECRET =
  'test-cookie-secret-value-must-be-at-least-32-chars';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { tmpdir } from 'os';
import type { FastifyInstance } from 'fastify';
import { Storage, InMemoryBackend } from '../storage/index.js';
import { buildServer } from '../server.js';
import { hashPin } from '../auth/setup-pin.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEST_PIN = 'TESTPIN1';
const TEST_PASSWORD = 'secure-test-password-123';
const DATA_DIR = tmpdir();

const UNKNOWN_INVITE_TOKEN = 'nonexistent-token-that-does-not-exist';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createTestServer(): Promise<{
  server: FastifyInstance;
  storage: Storage;
}> {
  const storage = new Storage(new InMemoryBackend());
  await storage.init();
  const server = await buildServer({
    dataDir: DATA_DIR,
    storage,
    logger: false,
  });
  return { server, storage };
}

async function seedAdmin(
  storage: Storage,
  { expiresIn = 60_000 }: { expiresIn?: number } = {},
): Promise<void> {
  const pinHash = await hashPin(TEST_PIN);
  await storage.createServerAdmin({
    usernameOrEmail: 'admin',
    pinHash,
    setupPinExpiresAt: Date.now() + expiresIn,
  });
}

async function setupViaApi(
  server: FastifyInstance,
  remoteAddress: string,
): Promise<{ cookie: string; csrfToken: string }> {
  const res = await server.inject({
    method: 'POST',
    url: '/api/admin/setup',
    payload: { setupPin: TEST_PIN, newPassword: TEST_PASSWORD },
    remoteAddress,
  });

  expect(res.statusCode).toBe(200);

  const body = res.json<{ csrfToken: string }>();
  const rawSetCookie = Array.isArray(res.headers['set-cookie'])
    ? res.headers['set-cookie'][0]
    : (res.headers['set-cookie'] as string);
  const cookie = rawSetCookie.split(';')[0].trim();

  return { cookie, csrfToken: body.csrfToken };
}

async function loginFresh(
  server: FastifyInstance,
  remoteAddress: string,
): Promise<{ cookie: string; csrfToken: string }> {
  const res = await server.inject({
    method: 'POST',
    url: '/api/admin/login',
    payload: { password: TEST_PASSWORD },
    remoteAddress,
  });

  expect(res.statusCode).toBe(200);

  const body = res.json<{ csrfToken: string }>();
  const rawSetCookie = Array.isArray(res.headers['set-cookie'])
    ? res.headers['set-cookie'][0]
    : (res.headers['set-cookie'] as string);
  const cookie = rawSetCookie.split(';')[0].trim();

  return { cookie, csrfToken: body.csrfToken };
}

// ---------------------------------------------------------------------------
// GET /api/campaigns/:id/invites
// ---------------------------------------------------------------------------

describe('GET /api/campaigns/:id/invites', () => {
  let server: FastifyInstance;
  let storage: Storage;
  let validCookie: string;
  let campaignId: string;

  beforeAll(async () => {
    ({ server, storage } = await createTestServer());
    await seedAdmin(storage);
    const { cookie } = await setupViaApi(server, '10.20.0.0');
    validCookie = cookie;

    // Seed a campaign with 1 seat and 2 invites
    const campaign = await storage.createCampaign('Get Invites Campaign');
    campaignId = campaign.id;
    const seat = await storage.createSeat({
      campaignId,
      displayName: 'Player Seat',
      role: 'player',
    });
    const pinHash = await hashPin(TEST_PIN);
    await storage.createInvite({
      campaignId,
      seatId: seat.id,
      inviteToken: 'test-invite-token-alpha',
      pinHash,
      maxUses: 1,
      expiresAt: Date.now() + 3600 * 1000,
    });
    await storage.createInvite({
      campaignId,
      seatId: seat.id,
      inviteToken: 'test-invite-token-beta',
      pinHash,
      maxUses: 1,
      expiresAt: Date.now() + 3600 * 1000,
    });
  });

  afterAll(async () => {
    await server.close();
    storage.close();
  });

  it('returns 401 when unauthenticated', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/campaigns/${campaignId}/invites`,
      remoteAddress: '10.20.0.1',
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 200 with invites array of count 2 for a known campaign', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/campaigns/${campaignId}/invites`,
      headers: { Cookie: validCookie },
      remoteAddress: '10.20.0.2',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ invites: unknown[] }>();
    expect(body).toHaveProperty('invites');
    expect(Array.isArray(body.invites)).toBe(true);
    expect(body.invites.length).toBe(2);
  });

  it('returns 200 with empty invites array for an unknown campaign', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/campaigns/unknown-campaign-id/invites',
      headers: { Cookie: validCookie },
      remoteAddress: '10.20.0.3',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ invites: unknown[] }>();
    expect(body).toHaveProperty('invites');
    expect(body.invites).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// POST /api/campaigns/:id/invites
// ---------------------------------------------------------------------------

describe('POST /api/campaigns/:id/invites', () => {
  let server: FastifyInstance;
  let storage: Storage;
  let validCookie: string;
  let validCsrfToken: string;
  let campaignId: string;
  let seatId: string;

  beforeAll(async () => {
    ({ server, storage } = await createTestServer());
    await seedAdmin(storage);
    await setupViaApi(server, '10.21.0.0');
    const { cookie, csrfToken } = await loginFresh(server, '10.21.0.1');
    validCookie = cookie;
    validCsrfToken = csrfToken;

    const campaign = await storage.createCampaign('Post Invite Campaign');
    campaignId = campaign.id;
    const seat = await storage.createSeat({
      campaignId,
      displayName: 'Player Seat',
      role: 'player',
    });
    seatId = seat.id;
  });

  afterAll(async () => {
    await server.close();
    storage.close();
  });

  it('returns 401 when unauthenticated', async () => {
    const res = await server.inject({
      method: 'POST',
      url: `/api/campaigns/${campaignId}/invites`,
      payload: { seatId, pin: '1234', expiresIn: 3600 },
      remoteAddress: '10.21.0.2',
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 403 when CSRF token is missing', async () => {
    const res = await server.inject({
      method: 'POST',
      url: `/api/campaigns/${campaignId}/invites`,
      headers: { Cookie: validCookie },
      payload: { seatId, pin: '1234', expiresIn: 3600 },
      remoteAddress: '10.21.0.3',
    });

    expect(res.statusCode).toBe(403);
  });

  it('returns 400 INVALID_REQUEST when required body fields are missing', async () => {
    const res = await server.inject({
      method: 'POST',
      url: `/api/campaigns/${campaignId}/invites`,
      headers: { Cookie: validCookie, 'X-CSRF-Token': validCsrfToken },
      payload: {},
      remoteAddress: '10.21.0.4',
    });

    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: { code: string } }>().error.code).toBe(
      'INVALID_REQUEST',
    );
  });

  it('returns 201 with invite containing inviteToken and inviteUrl on valid request', async () => {
    const res = await server.inject({
      method: 'POST',
      url: `/api/campaigns/${campaignId}/invites`,
      headers: { Cookie: validCookie, 'X-CSRF-Token': validCsrfToken },
      payload: { seatId, pin: '1234', expiresIn: 3600 },
      remoteAddress: '10.21.0.5',
    });

    expect(res.statusCode).toBe(201);
    const body = res.json<{
      invite: { inviteToken: string; inviteUrl: string };
    }>();
    expect(body).toHaveProperty('invite');
    expect(typeof body.invite.inviteToken).toBe('string');
    expect(body.invite.inviteToken.length).toBeGreaterThan(0);
    expect(typeof body.invite.inviteUrl).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/campaigns/:id/invites/:inviteToken
// ---------------------------------------------------------------------------

describe('DELETE /api/campaigns/:id/invites/:inviteToken', () => {
  let server: FastifyInstance;
  let storage: Storage;
  let validCookie: string;
  let validCsrfToken: string;
  let campaignId: string;
  let knownInviteToken: string;

  beforeAll(async () => {
    ({ server, storage } = await createTestServer());
    await seedAdmin(storage);
    await setupViaApi(server, '10.22.0.0');
    const { cookie, csrfToken } = await loginFresh(server, '10.22.0.1');
    validCookie = cookie;
    validCsrfToken = csrfToken;

    // Seed a campaign + seat + invite to revoke
    const campaign = await storage.createCampaign('Delete Invite Campaign');
    campaignId = campaign.id;
    const seat = await storage.createSeat({
      campaignId,
      displayName: 'Player Seat',
      role: 'player',
    });
    const pinHash = await hashPin(TEST_PIN);
    knownInviteToken = 'test-revoke-token-12345';
    await storage.createInvite({
      campaignId,
      seatId: seat.id,
      inviteToken: knownInviteToken,
      pinHash,
      maxUses: 1,
      expiresAt: Date.now() + 3600 * 1000,
    });
  });

  afterAll(async () => {
    await server.close();
    storage.close();
  });

  it('returns 401 when unauthenticated', async () => {
    const res = await server.inject({
      method: 'DELETE',
      url: `/api/campaigns/${campaignId}/invites/${knownInviteToken}`,
      remoteAddress: '10.22.0.2',
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 404 INVITE_NOT_FOUND for an unknown inviteToken', async () => {
    const res = await server.inject({
      method: 'DELETE',
      url: `/api/campaigns/${campaignId}/invites/${UNKNOWN_INVITE_TOKEN}`,
      headers: { Cookie: validCookie, 'X-CSRF-Token': validCsrfToken },
      remoteAddress: '10.22.0.3',
    });

    expect(res.statusCode).toBe(404);
    expect(res.json<{ error: { code: string } }>().error.code).toBe(
      'INVITE_NOT_FOUND',
    );
  });

  it('returns 204 on successful revocation of a known inviteToken', async () => {
    const res = await server.inject({
      method: 'DELETE',
      url: `/api/campaigns/${campaignId}/invites/${knownInviteToken}`,
      headers: { Cookie: validCookie, 'X-CSRF-Token': validCsrfToken },
      remoteAddress: '10.22.0.4',
    });

    expect(res.statusCode).toBe(204);
  });
});
