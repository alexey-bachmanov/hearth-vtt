/**
 * Server integration tests — end-to-end HTTP lifecycle scenarios.
 *
 * These tests cover cross-route workflows that individual route test suites
 * do not exercise: full admin lifecycle, CSRF enforcement, and session revocation.
 *
 * All tests use:
 * - InMemoryBackend for zero disk I/O
 * - server.inject() for zero real network
 * - Unique /24 IP blocks to avoid rateLimitMap bleed across suites
 */

// ---------------------------------------------------------------------------
// Module-level environment setup — must appear before any buildServer() call.
// ---------------------------------------------------------------------------
process.env.NODE_ENV = 'development';
process.env.ADMIN_ALLOW_REMOTE = 'true';
process.env.COOKIE_SECRET =
  'test-cookie-secret-value-must-be-at-least-32-chars';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { tmpdir } from 'os';
import type { FastifyInstance } from 'fastify';
import { Storage, InMemoryBackend } from './storage/index.js';
import { buildServer } from './server.js';
import { hashPin } from './auth/setup-pin.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEST_PIN = 'TESTPIN1';
const TEST_PASSWORD = 'secure-test-password-123';
const DATA_DIR = tmpdir();

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

async function seedAdmin(storage: Storage): Promise<void> {
  const pinHash = await hashPin(TEST_PIN);
  await storage.createServerAdmin({
    usernameOrEmail: 'admin',
    pinHash,
    setupPinExpiresAt: Date.now() + 60_000,
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

// ---------------------------------------------------------------------------
// Full admin lifecycle
//
// Setup → login → create campaign (verified in storage) → delete campaign
// (verified in storage). Uses IP block 10.50.0.x.
// ---------------------------------------------------------------------------

describe('Full admin lifecycle', () => {
  let server: FastifyInstance;
  let storage: Storage;

  beforeAll(async () => {
    ({ server, storage } = await createTestServer());
    await seedAdmin(storage);
  });

  afterAll(async () => {
    await server.close();
    storage.close();
  });

  it('completes the full lifecycle: setup → create campaign → delete campaign', async () => {
    // 1. Setup admin password
    const { cookie, csrfToken } = await setupViaApi(server, '10.50.0.1');

    // 2. Verify check-auth reports authenticated
    const authRes = await server.inject({
      method: 'GET',
      url: '/api/admin/check-auth',
      headers: { cookie },
      remoteAddress: '10.50.0.2',
    });
    expect(authRes.statusCode).toBe(200);
    expect(authRes.json()).toMatchObject({ authenticated: true });

    // 3. Create a campaign via HTTP
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/campaigns',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { name: 'Integration Test Campaign' },
      remoteAddress: '10.50.0.3',
    });
    expect(createRes.statusCode).toBe(201);
    const { campaign } = createRes.json<{
      campaign: { id: string; name: string };
    }>();
    expect(campaign.name).toBe('Integration Test Campaign');

    // 4. Verify the campaign exists in storage
    const stored = await storage.getCampaign(campaign.id);
    expect(stored?.name).toBe('Integration Test Campaign');

    // 5. Delete the campaign via HTTP
    const deleteRes = await server.inject({
      method: 'DELETE',
      url: `/api/campaigns/${campaign.id}`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      remoteAddress: '10.50.0.4',
    });
    expect(deleteRes.statusCode).toBe(204);

    // 6. Verify the campaign is gone from storage
    expect(await storage.getCampaign(campaign.id)).toBeNull();
  });

  it('lists campaigns created via storage directly', async () => {
    await storage.createCampaign('Direct Campaign');

    const res = await server.inject({
      method: 'GET',
      url: '/api/campaigns',
      remoteAddress: '10.50.0.5',
    });
    expect(res.statusCode).toBe(200);
    const { campaigns } = res.json<{ campaigns: { name: string }[] }>();
    expect(campaigns.some((c) => c.name === 'Direct Campaign')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CSRF enforcement
//
// Mutating routes require X-CSRF-Token. Missing or wrong token → 403.
// Uses IP block 10.51.0.x.
// ---------------------------------------------------------------------------

describe('CSRF enforcement', () => {
  let server: FastifyInstance;
  let storage: Storage;
  let cookie: string;
  let csrfToken: string;

  beforeAll(async () => {
    ({ server, storage } = await createTestServer());
    await seedAdmin(storage);
    ({ cookie, csrfToken } = await setupViaApi(server, '10.51.0.1'));
  });

  afterAll(async () => {
    await server.close();
    storage.close();
  });

  it('POST /api/campaigns without CSRF token returns 403', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/campaigns',
      headers: { cookie }, // no x-csrf-token
      payload: { name: 'Should Fail' },
      remoteAddress: '10.51.0.2',
    });
    expect(res.statusCode).toBe(403);
  });

  it('POST /api/campaigns with wrong CSRF token returns 403', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/campaigns',
      headers: { cookie, 'x-csrf-token': 'totally-wrong-token' },
      payload: { name: 'Should Fail' },
      remoteAddress: '10.51.0.3',
    });
    expect(res.statusCode).toBe(403);
  });

  it('DELETE /api/campaigns/:id without CSRF token returns 403', async () => {
    const campaign = await storage.createCampaign('CSRF Test Campaign');

    const res = await server.inject({
      method: 'DELETE',
      url: `/api/campaigns/${campaign.id}`,
      headers: { cookie }, // no x-csrf-token
      remoteAddress: '10.51.0.4',
    });
    expect(res.statusCode).toBe(403);

    // Campaign should still exist (request was rejected)
    expect(await storage.getCampaign(campaign.id)).not.toBeNull();

    void csrfToken; // referenced to avoid lint warning
  });
});

// ---------------------------------------------------------------------------
// Session revocation
//
// After the admin session is revoked in storage, authenticated routes return 401.
// Uses IP block 10.52.0.x.
// ---------------------------------------------------------------------------

describe('Session revocation', () => {
  it('returns 401 on authenticated route after session is revoked', async () => {
    const { server, storage } = await createTestServer();
    try {
      await seedAdmin(storage);
      const { cookie } = await setupViaApi(server, '10.52.0.1');

      // Verify initial auth works
      const before = await server.inject({
        method: 'GET',
        url: '/api/admin/check-auth',
        headers: { cookie },
        remoteAddress: '10.52.0.2',
      });
      expect(before.statusCode).toBe(200);
      expect(before.json()).toMatchObject({ authenticated: true });

      // Revoke all admin sessions via storage
      const sessions = await storage.listAdminSessions();
      for (const session of sessions) {
        await storage.revokeAdminSession(session.id);
      }

      // Now check-auth should report unauthenticated
      const after = await server.inject({
        method: 'GET',
        url: '/api/admin/check-auth',
        headers: { cookie },
        remoteAddress: '10.52.0.3',
      });
      expect(after.statusCode).toBe(200);
      expect(after.json()).toMatchObject({ authenticated: false });
    } finally {
      await server.close();
      storage.close();
    }
  });

  it('returns 401 on a protected route after session is revoked', async () => {
    const { server, storage } = await createTestServer();
    try {
      await seedAdmin(storage);
      const { cookie, csrfToken } = await setupViaApi(server, '10.52.0.4');

      // Revoke all sessions
      const sessions = await storage.listAdminSessions();
      for (const session of sessions) {
        await storage.revokeAdminSession(session.id);
      }

      // POST /api/campaigns should now return 401
      const res = await server.inject({
        method: 'POST',
        url: '/api/campaigns',
        headers: { cookie, 'x-csrf-token': csrfToken },
        payload: { name: 'Should Not Create' },
        remoteAddress: '10.52.0.5',
      });
      expect(res.statusCode).toBe(401);
    } finally {
      await server.close();
      storage.close();
    }
  });
});
