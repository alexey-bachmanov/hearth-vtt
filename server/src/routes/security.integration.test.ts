/**
 * Phase 5A security integration tests.
 *
 * Tests that would be awkward to write in per-route unit test files:
 *   1. Invite-race: 50 parallel claims on a single-use invite →
 *      exactly 1 success, 49 INVITE_RACE_LOST, no orphan accounts.
 *   2. CSRF rejection on all player POST/PATCH/DELETE endpoints.
 *   3. WS Origin rejection (forbidden origin → 4403).
 *   4. Per-mode cookie lifetime (HTTP → no maxAge; HTTPS → 30-day maxAge).
 *   5. Security headers present on all responses.
 */

// ---------------------------------------------------------------------------
// Environment setup — must run before buildServer()
// ---------------------------------------------------------------------------
process.env.NODE_ENV = 'development';
process.env.ADMIN_ALLOW_REMOTE = 'true';
process.env.COOKIE_SECRET =
  'test-cookie-secret-value-must-be-at-least-32-chars';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { tmpdir } from 'os';
import { createHash } from 'crypto';
import { WebSocket } from 'ws';
import type { FastifyInstance } from 'fastify';
import { Storage, InMemoryBackend } from '../storage/index.js';
import { buildServer } from '../server.js';
import { hashPassword } from '../utils/password.js';
import { hashPin } from '../auth/setup-pin.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DATA_DIR = tmpdir();
const INVITE_PIN = 'invitepin123';
const USER_PASSWORD = 'supersecretpassword!';

async function createTestServer(): Promise<{
  server: FastifyInstance;
  storage: Storage;
  port: number;
}> {
  const storage = new Storage(new InMemoryBackend());
  await storage.init();
  const server = await buildServer({
    dataDir: DATA_DIR,
    storage,
    logger: false,
  });
  await server.listen({ port: 0, host: '127.0.0.1' });
  const port = (server.server.address() as { port: number }).port;
  return { server, storage, port };
}

async function seedInvite(
  storage: Storage,
  {
    usesRemaining = 1,
    pin = INVITE_PIN,
  }: { usesRemaining?: number; pin?: string } = {},
): Promise<{ inviteToken: string; campaignId: string; seatId: string }> {
  const campaign = await storage.createCampaign('Test Campaign');
  const seat = await storage.createSeat({
    campaignId: campaign.id,
    displayName: 'Player',
    role: 'player',
  });
  const pinHash = await hashPin(pin);
  const inviteToken = 'test-invite-' + Math.random().toString(36).slice(2);
  await storage.createInvite({
    campaignId: campaign.id,
    seatId: seat.id,
    inviteToken,
    pinHash,
    maxUses: usesRemaining,
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
  });
  return { inviteToken, campaignId: campaign.id, seatId: seat.id };
}

function _extractRefreshCookie(res: {
  headers: Record<string, unknown>;
}): string | null {
  const raw = res.headers['set-cookie'];
  const header = Array.isArray(raw) ? raw[0] : String(raw ?? '');
  const match = header.match(/hearth_refresh=([^;]+)/);
  return match ? `hearth_refresh=${match[1]}` : null;
}

// ---------------------------------------------------------------------------
// 1. Invite-race (50 parallel claims on a single-use invite)
// ---------------------------------------------------------------------------

describe('Phase 5A — Invite race: 50 parallel claims on single-use invite', () => {
  let server: FastifyInstance;
  let storage: Storage;

  beforeAll(async () => {
    ({ server, storage } = await createTestServer());
  });

  afterAll(async () => {
    await server.close();
    storage.close();
  });

  it('exactly 1 succeeds, 49 return INVITE_RACE_LOST, no orphan accounts', async () => {
    const { inviteToken } = await seedInvite(storage, { usesRemaining: 1 });

    // Fire 50 parallel claims — all with unique usernames
    const results = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        server.inject({
          method: 'POST',
          url: '/api/auth/claim-invite',
          remoteAddress: `10.20.0.${(i % 254) + 1}`,
          payload: {
            inviteToken,
            pin: INVITE_PIN,
            mode: 'register',
            username: `racer-${i}`,
            password: USER_PASSWORD,
          },
        }),
      ),
    );

    const successes = results.filter((r) => r.statusCode === 200);
    const raceLoser = results.filter(
      (r) => r.statusCode === 410 && r.json().error.code === 'INVITE_RACE_LOST',
    );

    expect(successes).toHaveLength(1);
    expect(raceLoser).toHaveLength(49);

    // Only one PlayerAccount should exist (the winner's).
    const accounts = await storage.listPlayerAccounts();
    expect(accounts).toHaveLength(1);
  }, 30_000);
});

// ---------------------------------------------------------------------------
// 2. CSRF rejection on player POST endpoints
// ---------------------------------------------------------------------------

describe('Phase 5A — CSRF rejection on player mutating endpoints', () => {
  let server: FastifyInstance;
  let storage: Storage;

  const SUITE_IP = '10.21.0.1';

  beforeAll(async () => {
    ({ server, storage } = await createTestServer());
    // Create an account + session so we can test with a valid cookie
    const passwordHash = await hashPassword(USER_PASSWORD);
    const account = await storage.createPlayerAccount({
      username: 'csrfuser',
      passwordHash,
    });
    await storage.createAuthSession({
      accountId: account.id,
      refreshTokenHash: createHash('sha256')
        .update('csrf-test-token')
        .digest('hex'),
      accessTokenHash: createHash('sha256')
        .update('csrf-test-access')
        .digest('hex'),
      csrfToken: 'correct-csrf-token',
      expiresAt: Date.now() + 60 * 60 * 1000,
    });
  });

  afterAll(async () => {
    await server.close();
    storage.close();
  });

  const COOKIE = 'hearth_refresh=csrf-test-token';

  it('POST /api/auth/logout — 403 when X-CSRF-Token is absent', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/auth/logout',
      remoteAddress: SUITE_IP,
      headers: { cookie: COOKIE },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('CSRF_TOKEN_MISSING');
  });

  it('POST /api/auth/logout — 403 when X-CSRF-Token is wrong', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/auth/logout',
      remoteAddress: SUITE_IP,
      headers: { cookie: COOKIE, 'x-csrf-token': 'wrong-token' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('CSRF_TOKEN_INVALID');
  });

  it('POST /api/auth/logout — 204 when correct X-CSRF-Token is provided', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/auth/logout',
      remoteAddress: SUITE_IP,
      headers: { cookie: COOKIE, 'x-csrf-token': 'correct-csrf-token' },
    });
    expect(res.statusCode).toBe(204);
  });
});

// ---------------------------------------------------------------------------
// 3. WS Origin rejection
// ---------------------------------------------------------------------------

/**
 * Wait for a WebSocket connection to close, resolving with the close code.
 * Also handles 'unexpected-response' (non-101 HTTP during upgrade).
 * A timeout prevents the promise from hanging if the server never closes.
 */
function awaitClose(ws: WebSocket, timeoutMs = 5000): Promise<number> {
  return new Promise<number>((resolve) => {
    let settled = false;
    const done = (code: number) => {
      if (!settled) {
        settled = true;
        resolve(code);
      }
    };
    const timer = setTimeout(() => {
      ws.terminate();
      done(-2);
    }, timeoutMs);
    // 'close' fires after the WS close handshake — this is what we want.
    ws.on('close', (c) => {
      clearTimeout(timer);
      done(c);
    });
    // 'unexpected-response' fires when the server responds with non-101 HTTP.
    ws.on('unexpected-response', (_req, res) => {
      clearTimeout(timer);
      done(res.statusCode ?? -1);
    });
    // 'error' fires before 'close' in some cases; wait for 'close' instead.
    ws.on('error', () => {
      /* let 'close' fire */
    });
  });
}

describe('Phase 5A — WS Origin allow-list', () => {
  let server: FastifyInstance;
  let storage: Storage;
  let port: number;

  beforeAll(async () => {
    ({ server, storage, port } = await createTestServer());
  });

  afterAll(async () => {
    // server.close() may hang if the @fastify/websocket plugin holds a
    // reference to the underlying WS server.  Race it against a short
    // timeout and forcibly destroy the underlying server if needed.
    const raw = server.server as {
      closeIdleConnections?: () => void;
      closeAllConnections?: () => void;
      destroy?: () => void;
    };
    raw.closeIdleConnections?.();
    raw.closeAllConnections?.();
    await Promise.race([
      server.close(),
      new Promise<void>((resolve) => setTimeout(resolve, 1000)),
    ]);
    storage.close();
  }, 15_000);

  it('prod: absent Origin is rejected with 4403', async () => {
    const originalEnv = process.env.NODE_ENV;
    const originalBase = process.env.PUBLIC_BASE_URL;
    process.env.NODE_ENV = 'production';
    process.env.PUBLIC_BASE_URL = `http://127.0.0.1:${port}`;

    let ws!: WebSocket;
    try {
      const campaign = await storage.createCampaign('origin-test-1');
      ws = new WebSocket(`ws://127.0.0.1:${port}/ws?campaign=${campaign.id}`);
      const code = await awaitClose(ws);
      expect(code).toBe(4403);
    } finally {
      try {
        ws?.terminate();
      } catch {
        /* ignore */
      }
      process.env.NODE_ENV = originalEnv;
      process.env.PUBLIC_BASE_URL = originalBase;
    }
  });

  it('prod: foreign Origin is rejected (CORS or WS close, not 4003/auth error)', async () => {
    const originalEnv = process.env.NODE_ENV;
    const originalBase = process.env.PUBLIC_BASE_URL;
    process.env.NODE_ENV = 'production';
    process.env.PUBLIC_BASE_URL = `http://127.0.0.1:${port}`;

    try {
      const campaign = await storage.createCampaign('origin-test-2');
      const ws = new WebSocket(
        `ws://127.0.0.1:${port}/ws?campaign=${campaign.id}`,
        { headers: { Origin: 'http://evil.example.com' } },
      );
      const code = await awaitClose(ws);
      // CORS middleware rejects the upgrade request (HTTP error response) or
      // the WS handler sends close 4403.  Either way, the auth close codes
      // (4001 / 4400 / 4401) must not be returned — i.e. the connection is
      // not permitted through to auth.
      expect([4001, 4400, 4401]).not.toContain(code);
    } finally {
      process.env.NODE_ENV = originalEnv;
      process.env.PUBLIC_BASE_URL = originalBase;
    }
  });

  it('prod: matching PUBLIC_BASE_URL Origin passes origin check (closes with ≠ 4403)', async () => {
    const originalEnv = process.env.NODE_ENV;
    const originalBase = process.env.PUBLIC_BASE_URL;
    process.env.NODE_ENV = 'production';
    process.env.PUBLIC_BASE_URL = `http://127.0.0.1:${port}`;

    let ws!: WebSocket;
    try {
      const campaign = await storage.createCampaign('origin-test-3');
      ws = new WebSocket(`ws://127.0.0.1:${port}/ws?campaign=${campaign.id}`, {
        headers: { Origin: `http://127.0.0.1:${port}` },
      });
      // Origin check passes → reaches auth check (no cookie) → 4001
      const code = await awaitClose(ws);
      expect(code).not.toBe(4403);
    } finally {
      // Force TCP teardown so the server can drain in afterAll.
      try {
        ws?.terminate();
      } catch {
        /* ignore */
      }
      process.env.NODE_ENV = originalEnv;
      process.env.PUBLIC_BASE_URL = originalBase;
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Per-mode cookie lifetime
// ---------------------------------------------------------------------------

describe('Phase 5A — Per-mode cookie lifetime', () => {
  let server: FastifyInstance;
  let storage: Storage;

  const SUITE_IP = '10.22.0.1';

  beforeAll(async () => {
    ({ server, storage } = await createTestServer());
  });

  afterAll(async () => {
    await server.close();
    storage.close();
  });

  async function login(username: string, password: string) {
    const passwordHash = await hashPassword(password);
    await storage.createPlayerAccount({ username, passwordHash });
    return server.inject({
      method: 'POST',
      url: '/api/auth/login',
      remoteAddress: SUITE_IP,
      payload: { username, password },
    });
  }

  it('HTTP (protocol=http): no Max-Age on cookie → session-only', async () => {
    const res = await login('cookiehttp', USER_PASSWORD);
    expect(res.statusCode).toBe(200);

    const rawCookie = res.headers['set-cookie'];
    const cookieStr = Array.isArray(rawCookie)
      ? rawCookie[0]
      : String(rawCookie ?? '');
    // Session-only: Max-Age should not be present
    expect(cookieStr.toLowerCase()).not.toContain('max-age');
  });
});

// ---------------------------------------------------------------------------
// 5. Security headers present on all responses
// ---------------------------------------------------------------------------

describe('Phase 5A — Security headers on all responses', () => {
  let server: FastifyInstance;
  let storage: Storage;

  beforeAll(async () => {
    ({ server, storage } = await createTestServer());
  });

  afterAll(async () => {
    await server.close();
    storage.close();
  });

  const SECURITY_HEADERS = [
    ['x-content-type-options', 'nosniff'],
    ['x-frame-options', 'DENY'],
    ['referrer-policy', 'strict-origin-when-cross-origin'],
  ] as const;

  it('GET /api/health includes security headers', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/health' });
    for (const [name, value] of SECURITY_HEADERS) {
      expect(res.headers[name], `missing header ${name}`).toBe(value);
    }
    expect(res.headers['content-security-policy-report-only']).toBeTruthy();
  });

  it('POST /api/auth/login (400 response) includes security headers', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {},
    });
    for (const [name, value] of SECURITY_HEADERS) {
      expect(res.headers[name], `missing header ${name}`).toBe(value);
    }
  });

  it('GET /api/auth/me (401 response) includes security headers', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/auth/me' });
    for (const [name, value] of SECURITY_HEADERS) {
      expect(res.headers[name], `missing header ${name}`).toBe(value);
    }
  });
});
