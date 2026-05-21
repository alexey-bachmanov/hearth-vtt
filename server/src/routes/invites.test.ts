// ---------------------------------------------------------------------------
// Module-level environment setup — must appear before any imports.
// ---------------------------------------------------------------------------
process.env.NODE_ENV = 'development'; // Prevents 501 guard in inviteRoutes
process.env.ADMIN_ALLOW_REMOTE = 'true'; // Allows inject() to use any IP
process.env.COOKIE_SECRET = 'test-cookie-secret-value-must-be-at-least-32-chars';

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

const CAMPAIGN_ID = 'campaign-mock-001';
const KNOWN_INVITE_ID = 'invite-001';
const UNKNOWN_INVITE_ID = 'invite-does-not-exist';

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

  beforeAll(async () => {
    ({ server, storage } = await createTestServer());
    await seedAdmin(storage);
    const { cookie } = await setupViaApi(server, '10.20.0.0');
    validCookie = cookie;
  });

  afterAll(async () => {
    await server.close();
    storage.close();
  });

  it('returns 401 when unauthenticated', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/campaigns/${CAMPAIGN_ID}/invites`,
      remoteAddress: '10.20.0.1',
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 200 with invites array of count 2 for a known campaign', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/campaigns/${CAMPAIGN_ID}/invites`,
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

  beforeAll(async () => {
    ({ server, storage } = await createTestServer());
    await seedAdmin(storage);
    await setupViaApi(server, '10.21.0.0');
    const { cookie, csrfToken } = await loginFresh(server, '10.21.0.1');
    validCookie = cookie;
    validCsrfToken = csrfToken;
  });

  afterAll(async () => {
    await server.close();
    storage.close();
  });

  it('returns 401 when unauthenticated', async () => {
    const res = await server.inject({
      method: 'POST',
      url: `/api/campaigns/${CAMPAIGN_ID}/invites`,
      payload: {
        seatId: 'seat-player-001',
        rolesGranted: ['player'],
        pin: '1234',
        expiresIn: 3600,
      },
      remoteAddress: '10.21.0.2',
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 403 when CSRF token is missing', async () => {
    const res = await server.inject({
      method: 'POST',
      url: `/api/campaigns/${CAMPAIGN_ID}/invites`,
      headers: { Cookie: validCookie },
      payload: {
        seatId: 'seat-player-001',
        rolesGranted: ['player'],
        pin: '1234',
        expiresIn: 3600,
      },
      remoteAddress: '10.21.0.3',
    });

    expect(res.statusCode).toBe(403);
  });

  it('returns 400 INVALID_REQUEST when required body fields are missing', async () => {
    const res = await server.inject({
      method: 'POST',
      url: `/api/campaigns/${CAMPAIGN_ID}/invites`,
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
      url: `/api/campaigns/${CAMPAIGN_ID}/invites`,
      headers: { Cookie: validCookie, 'X-CSRF-Token': validCsrfToken },
      payload: {
        seatId: 'seat-player-001',
        rolesGranted: ['player'],
        pin: '1234',
        expiresIn: 3600,
      },
      remoteAddress: '10.21.0.5',
    });

    expect(res.statusCode).toBe(201);
    const body = res.json<{
      invite: { inviteToken: string; inviteUrl: string };
    }>();
    expect(body).toHaveProperty('invite');
    expect(typeof body.invite.inviteToken).toBe('string');
    expect(typeof body.invite.inviteUrl).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/campaigns/:id/invites/:inviteId
// ---------------------------------------------------------------------------

describe('DELETE /api/campaigns/:id/invites/:inviteId', () => {
  let server: FastifyInstance;
  let storage: Storage;
  let validCookie: string;
  let validCsrfToken: string;

  beforeAll(async () => {
    ({ server, storage } = await createTestServer());
    await seedAdmin(storage);
    await setupViaApi(server, '10.22.0.0');
    const { cookie, csrfToken } = await loginFresh(server, '10.22.0.1');
    validCookie = cookie;
    validCsrfToken = csrfToken;
  });

  afterAll(async () => {
    await server.close();
    storage.close();
  });

  it('returns 401 when unauthenticated', async () => {
    const res = await server.inject({
      method: 'DELETE',
      url: `/api/campaigns/${CAMPAIGN_ID}/invites/${KNOWN_INVITE_ID}`,
      remoteAddress: '10.22.0.2',
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 404 INVITE_NOT_FOUND for an unknown inviteId', async () => {
    const res = await server.inject({
      method: 'DELETE',
      url: `/api/campaigns/${CAMPAIGN_ID}/invites/${UNKNOWN_INVITE_ID}`,
      headers: { Cookie: validCookie, 'X-CSRF-Token': validCsrfToken },
      remoteAddress: '10.22.0.3',
    });

    expect(res.statusCode).toBe(404);
    expect(res.json<{ error: { code: string } }>().error.code).toBe(
      'INVITE_NOT_FOUND',
    );
  });

  it('returns 204 on successful deletion of a known inviteId', async () => {
    const res = await server.inject({
      method: 'DELETE',
      url: `/api/campaigns/${CAMPAIGN_ID}/invites/${KNOWN_INVITE_ID}`,
      headers: { Cookie: validCookie, 'X-CSRF-Token': validCsrfToken },
      remoteAddress: '10.22.0.4',
    });

    expect(res.statusCode).toBe(204);
  });
});
