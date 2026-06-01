/**
 * admin-accounts route integration tests.
 *
 * Tests for:
 * - GET  /api/admin/accounts
 * - POST /api/admin/accounts/:id/reset-password
 * - POST /api/admin/accounts/:id/revoke-sessions
 *
 * Patterns follow admin-auth.test.ts: one server per suite, unique IP per suite,
 * admin login via API helpers.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { tmpdir } from 'os';
import type { FastifyInstance } from 'fastify';
import { Storage, InMemoryBackend } from '../storage/index.js';
import { buildServer } from '../server.js';
import { hashPin } from '../auth/setup-pin.js';
import { createAccount } from '../domain/auth/account.js';

// ---------------------------------------------------------------------------
// Module-level environment setup
// ---------------------------------------------------------------------------

process.env.NODE_ENV = 'development';
process.env.ADMIN_ALLOW_REMOTE = 'true';
process.env.COOKIE_SECRET =
  'test-cookie-secret-value-must-be-at-least-32-chars';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DATA_DIR = tmpdir();
const ADMIN_PIN = 'ADMINPIN1';
const ADMIN_PASSWORD = 'secure-admin-password-123';
const USER_PASSWORD = 'securepassword';

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

/** Seed storage with a setup-PIN record so /api/admin/setup works. */
async function seedAdmin(storage: Storage): Promise<void> {
  const pinHash = await hashPin(ADMIN_PIN);
  await storage.createServerAdmin({
    usernameOrEmail: 'admin',
    pinHash,
    setupPinExpiresAt: Date.now() + 60_000,
  });
}

/** Call /api/admin/setup to create an admin password; returns session cookie + CSRF token. */
async function setupAdmin(
  server: FastifyInstance,
  remoteAddress: string,
): Promise<{ cookie: string; csrfToken: string }> {
  const res = await server.inject({
    method: 'POST',
    url: '/api/admin/setup',
    payload: { setupPin: ADMIN_PIN, newPassword: ADMIN_PASSWORD },
    remoteAddress,
  });
  expect(res.statusCode).toBe(200);

  const body = res.json<{ csrfToken: string }>();
  const raw = Array.isArray(res.headers['set-cookie'])
    ? res.headers['set-cookie'][0]
    : (res.headers['set-cookie'] as string);
  const cookie = raw.split(';')[0].trim();
  return { cookie, csrfToken: body.csrfToken };
}

// ============================================================================
// GET /api/admin/accounts
// ============================================================================

describe('GET /api/admin/accounts', () => {
  let server: FastifyInstance;
  let storage: Storage;
  let cookie: string;
  const IP = '10.10.1.1';

  beforeAll(async () => {
    ({ server, storage } = await createTestServer());
    await seedAdmin(storage);
    ({ cookie } = await setupAdmin(server, IP));
  });

  afterAll(async () => {
    await server.close();
    storage.close();
  });

  it('returns 401 without admin session', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/admin/accounts',
      remoteAddress: IP,
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns empty list when no player accounts exist', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/admin/accounts',
      headers: { cookie },
      remoteAddress: IP,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.accounts).toBeInstanceOf(Array);
    expect(body.accounts).toHaveLength(0);
  });

  it('returns account summaries with correct fields', async () => {
    const account = await createAccount('listme', USER_PASSWORD, storage);

    const res = await server.inject({
      method: 'GET',
      url: '/api/admin/accounts',
      headers: { cookie },
      remoteAddress: IP,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const found = body.accounts.find(
      (a: { id: string }) => a.id === account.id,
    );
    expect(found).toBeTruthy();
    expect(found.username).toBe('listme');
    expect(found.seatCount).toBe(0);
    expect(found.seatIds).toEqual([]);
    expect(found.mustChangePassword).toBe(false);
    expect(typeof found.createdAt).toBe('string');
    expect(found.lastLoginAt).toBeNull();
  });

  it('returns correct seatCount and seatIds for an account with a bound seat', async () => {
    const account = await createAccount('seatcount', USER_PASSWORD, storage);
    const campaign = await storage.createCampaign('SC Campaign');
    const seat = await storage.createSeat({
      campaignId: campaign.id,
      displayName: 'Counted Seat',
      role: 'player',
    });
    await storage.updateSeat(campaign.id, seat.id, { accountId: account.id });

    const res = await server.inject({
      method: 'GET',
      url: '/api/admin/accounts',
      headers: { cookie },
      remoteAddress: IP,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const found = body.accounts.find(
      (a: { id: string }) => a.id === account.id,
    );
    expect(found.seatCount).toBe(1);
    expect(found.seatIds).toEqual([seat.id]);
  });
});

// ============================================================================
// POST /api/admin/accounts/:id/reset-password
// ============================================================================

describe('POST /api/admin/accounts/:id/reset-password', () => {
  let server: FastifyInstance;
  let storage: Storage;
  let cookie: string;
  let csrfToken: string;
  const IP = '10.10.2.1';

  beforeAll(async () => {
    ({ server, storage } = await createTestServer());
    await seedAdmin(storage);
    ({ cookie, csrfToken } = await setupAdmin(server, IP));
  });

  afterAll(async () => {
    await server.close();
    storage.close();
  });

  it('returns 401 without admin session', async () => {
    const account = await createAccount('noreset', USER_PASSWORD, storage);
    const res = await server.inject({
      method: 'POST',
      url: `/api/admin/accounts/${account.id}/reset-password`,
      remoteAddress: IP,
      headers: { 'X-CSRF-Token': csrfToken },
      payload: { temporaryPassword: 'newpassword1' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 without CSRF token', async () => {
    const account = await createAccount('nocsrf', USER_PASSWORD, storage);
    const res = await server.inject({
      method: 'POST',
      url: `/api/admin/accounts/${account.id}/reset-password`,
      remoteAddress: IP,
      headers: { cookie },
      payload: { temporaryPassword: 'newpassword1' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('CSRF_TOKEN_MISSING');
  });

  it('returns 404 for unknown account id', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/admin/accounts/nonexistent-id/reset-password',
      remoteAddress: IP,
      headers: { cookie, 'X-CSRF-Token': csrfToken },
      payload: { temporaryPassword: 'newpassword1' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('ACCOUNT_NOT_FOUND');
  });

  it('returns 400 for missing temporaryPassword', async () => {
    const account = await createAccount('badpayload', USER_PASSWORD, storage);
    const res = await server.inject({
      method: 'POST',
      url: `/api/admin/accounts/${account.id}/reset-password`,
      remoteAddress: IP,
      headers: { cookie, 'X-CSRF-Token': csrfToken },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('sets new password hash and mustChangePassword=true, revokes sessions', async () => {
    const account = await createAccount('resetme', USER_PASSWORD, storage);

    // Login as the player to create a session
    const loginRes = await server.inject({
      method: 'POST',
      url: '/api/auth/login',
      remoteAddress: '10.10.2.99',
      payload: { username: 'resetme', password: USER_PASSWORD },
    });
    expect(loginRes.statusCode).toBe(200);

    // Admin resets the password
    const res = await server.inject({
      method: 'POST',
      url: `/api/admin/accounts/${account.id}/reset-password`,
      remoteAddress: IP,
      headers: { cookie, 'X-CSRF-Token': csrfToken },
      payload: { temporaryPassword: 'temporarypass123' },
    });
    expect(res.statusCode).toBe(204);

    // Account should now have mustChangePassword=true
    const updated = await storage.getPlayerAccountById(account.id);
    expect(updated!.mustChangePassword).toBe(true);

    // Old password no longer works (passwordHash changed)
    const oldCookie = Array.isArray(loginRes.headers['set-cookie'])
      ? loginRes.headers['set-cookie'].find((c: string) =>
          c.startsWith('hearth_refresh='),
        )
      : loginRes.headers['set-cookie'];
    const cookieHeader = oldCookie?.split(';')[0];

    if (cookieHeader) {
      const meRes = await server.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: { cookie: cookieHeader },
      });
      // Session revoked — /me returns 401
      expect(meRes.statusCode).toBe(401);
    }
  });
});

// ============================================================================
// POST /api/admin/accounts/:id/revoke-sessions
// ============================================================================

describe('POST /api/admin/accounts/:id/revoke-sessions', () => {
  let server: FastifyInstance;
  let storage: Storage;
  let cookie: string;
  let csrfToken: string;
  const IP = '10.10.3.1';

  beforeAll(async () => {
    ({ server, storage } = await createTestServer());
    await seedAdmin(storage);
    ({ cookie, csrfToken } = await setupAdmin(server, IP));
  });

  afterAll(async () => {
    await server.close();
    storage.close();
  });

  it('returns 401 without admin session', async () => {
    const account = await createAccount('norevokeauth', USER_PASSWORD, storage);
    const res = await server.inject({
      method: 'POST',
      url: `/api/admin/accounts/${account.id}/revoke-sessions`,
      remoteAddress: IP,
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 without CSRF token', async () => {
    const account = await createAccount('norevokecsrf', USER_PASSWORD, storage);
    const res = await server.inject({
      method: 'POST',
      url: `/api/admin/accounts/${account.id}/revoke-sessions`,
      remoteAddress: IP,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('CSRF_TOKEN_MISSING');
  });

  it('returns 404 for unknown account id', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/admin/accounts/unknown-id/revoke-sessions',
      remoteAddress: IP,
      headers: { cookie, 'X-CSRF-Token': csrfToken },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('ACCOUNT_NOT_FOUND');
  });

  it('revokes sessions — subsequent /me returns 401', async () => {
    await createAccount('kicking', USER_PASSWORD, storage);

    const loginRes = await server.inject({
      method: 'POST',
      url: '/api/auth/login',
      remoteAddress: '10.10.3.99',
      payload: { username: 'kicking', password: USER_PASSWORD },
    });
    expect(loginRes.statusCode).toBe(200);

    const playerCookieRaw = Array.isArray(loginRes.headers['set-cookie'])
      ? loginRes.headers['set-cookie'].find((c: string) =>
          c.startsWith('hearth_refresh='),
        )
      : loginRes.headers['set-cookie'];
    const playerCookie = playerCookieRaw?.split(';')[0];

    // Verify /me works before revocation
    const meBefore = await server.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: playerCookie },
    });
    expect(meBefore.statusCode).toBe(200);

    // Get account id
    const account = await storage.getPlayerAccountByUsername('kicking');

    // Admin revokes sessions
    const revokeRes = await server.inject({
      method: 'POST',
      url: `/api/admin/accounts/${account!.id}/revoke-sessions`,
      remoteAddress: IP,
      headers: { cookie, 'X-CSRF-Token': csrfToken },
    });
    expect(revokeRes.statusCode).toBe(204);

    // /me should now return 401
    const meAfter = await server.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: playerCookie },
    });
    expect(meAfter.statusCode).toBe(401);
  });

  it('is idempotent — 204 even when no active sessions', async () => {
    const account = await createAccount('noop', USER_PASSWORD, storage);
    const res = await server.inject({
      method: 'POST',
      url: `/api/admin/accounts/${account.id}/revoke-sessions`,
      remoteAddress: IP,
      headers: { cookie, 'X-CSRF-Token': csrfToken },
    });
    expect(res.statusCode).toBe(204);
  });
});

// ============================================================================
// DELETE /api/admin/accounts/:id  (501 stub)
// ============================================================================

describe('DELETE /api/admin/accounts/:id', () => {
  let server: FastifyInstance;
  let storage: Storage;
  let cookie: string;
  let csrfToken: string;
  const IP = '10.10.4.1';

  beforeAll(async () => {
    ({ server, storage } = await createTestServer());
    await seedAdmin(storage);
    ({ cookie, csrfToken } = await setupAdmin(server, IP));
  });

  afterAll(async () => {
    await server.close();
    storage.close();
  });

  it('returns 401 without admin session', async () => {
    const account = await createAccount('deleteme401', USER_PASSWORD, storage);
    const res = await server.inject({
      method: 'DELETE',
      url: `/api/admin/accounts/${account.id}`,
      remoteAddress: IP,
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 without CSRF token', async () => {
    const account = await createAccount('deleteme403', USER_PASSWORD, storage);
    const res = await server.inject({
      method: 'DELETE',
      url: `/api/admin/accounts/${account.id}`,
      remoteAddress: IP,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('CSRF_TOKEN_MISSING');
  });

  it('returns 501 NOT_IMPLEMENTED when authenticated', async () => {
    const account = await createAccount('deleteme501', USER_PASSWORD, storage);
    const res = await server.inject({
      method: 'DELETE',
      url: `/api/admin/accounts/${account.id}`,
      remoteAddress: IP,
      headers: { cookie, 'X-CSRF-Token': csrfToken },
    });
    expect(res.statusCode).toBe(501);
    expect(res.json().error.code).toBe('NOT_IMPLEMENTED');
  });
});

// ============================================================================
// POST /api/admin/accounts/:id/disconnect-seat  (501 stub)
// ============================================================================

describe('POST /api/admin/accounts/:id/disconnect-seat', () => {
  let server: FastifyInstance;
  let storage: Storage;
  let cookie: string;
  let csrfToken: string;
  const IP = '10.10.5.1';

  beforeAll(async () => {
    ({ server, storage } = await createTestServer());
    await seedAdmin(storage);
    ({ cookie, csrfToken } = await setupAdmin(server, IP));
  });

  afterAll(async () => {
    await server.close();
    storage.close();
  });

  it('returns 401 without admin session', async () => {
    const account = await createAccount(
      'disconnect401',
      USER_PASSWORD,
      storage,
    );
    const res = await server.inject({
      method: 'POST',
      url: `/api/admin/accounts/${account.id}/disconnect-seat`,
      remoteAddress: IP,
      headers: { 'X-CSRF-Token': csrfToken },
      payload: { seatId: 'seat-id' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 without CSRF token', async () => {
    const account = await createAccount(
      'disconnect403',
      USER_PASSWORD,
      storage,
    );
    const res = await server.inject({
      method: 'POST',
      url: `/api/admin/accounts/${account.id}/disconnect-seat`,
      remoteAddress: IP,
      headers: { cookie },
      payload: { seatId: 'seat-id' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('CSRF_TOKEN_MISSING');
  });

  it('returns 501 NOT_IMPLEMENTED when authenticated', async () => {
    const account = await createAccount(
      'disconnect501',
      USER_PASSWORD,
      storage,
    );
    const res = await server.inject({
      method: 'POST',
      url: `/api/admin/accounts/${account.id}/disconnect-seat`,
      remoteAddress: IP,
      headers: { cookie, 'X-CSRF-Token': csrfToken },
      payload: { seatId: 'seat-id' },
    });
    expect(res.statusCode).toBe(501);
    expect(res.json().error.code).toBe('NOT_IMPLEMENTED');
  });
});
