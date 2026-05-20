/**
 * admin-auth route integration tests — reference pattern for agent-written tests.
 *
 * Patterns demonstrated here:
 * - Building a real Fastify server with InMemoryBackend (no SQLite, no disk I/O)
 * - Using server.inject() for request/response testing (no real network)
 * - Seeding admin state via the HTTP API (setup route) instead of internal functions
 * - Extracting session cookies from Set-Cookie headers for subsequent requests
 * - Providing CSRF tokens in X-CSRF-Token header for protected routes
 * - Isolating module-level rate limit state across suites with unique remoteAddress values
 * - Lifetime management: one server per describe suite via beforeAll/afterAll
 *
 * Anti-patterns to avoid:
 * - Do NOT import hashPassword from admin-auth — it is not exported; use API routes instead
 * - Do NOT share a server across describe blocks that modify persistent module-level state
 *   (the rateLimitMap is module-level; use unique IPs per suite to avoid cross-contamination)
 * - Do NOT use real HTTP for route tests; always use server.inject()
 *
 * Environment setup:
 * - COOKIE_SECRET must be set before buildServer() is called (done at module top)
 * - NODE_ENV=development tells buildServer to skip client-dist lookup
 * - ADMIN_ALLOW_REMOTE=true bypasses the localhost-only gate so inject() can use any IP
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { tmpdir } from 'os';
import type { FastifyInstance } from 'fastify';
import { Storage, InMemoryBackend } from '../storage/index.js';
import { buildServer } from '../server.js';
import { hashPin } from '../auth/setup-pin.js';

// ---------------------------------------------------------------------------
// Module-level environment setup
// Must run before any buildServer() call.
// ---------------------------------------------------------------------------

process.env.NODE_ENV = 'development'; // Skip client-dist static file lookup
process.env.ADMIN_ALLOW_REMOTE = 'true'; // Allow inject() to use any remote address
process.env.COOKIE_SECRET =
  'test-cookie-secret-value-must-be-at-least-32-chars';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEST_PIN = 'TESTPIN1';
const TEST_PASSWORD = 'secure-test-password-123';
const DATA_DIR = tmpdir(); // deleteSetupPinFile() swallows ENOENT, so tmpdir() is safe

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a fresh Fastify server with an isolated in-memory storage backend.
 * Call server.close() and storage.close() in afterAll.
 */
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

/**
 * Seed the storage with a test admin that has a valid setup PIN.
 * Must be called before any route that reads getServerAdmin().
 */
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

/**
 * Bootstrap an admin password by calling POST /api/admin/setup.
 * Returns the session cookie value and CSRF token from the response.
 *
 * Important: the Set-Cookie header contains directives (Path=/, HttpOnly, …).
 * Only the `name=value` pair is forwarded in subsequent Cookie headers.
 */
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

  // Extract only the "name=value" part — directives are not sent in Cookie headers
  const rawSetCookie = Array.isArray(res.headers['set-cookie'])
    ? res.headers['set-cookie'][0]
    : (res.headers['set-cookie'] as string);
  const cookie = rawSetCookie.split(';')[0].trim();

  return { cookie, csrfToken: body.csrfToken };
}

/**
 * Log in as admin and return a fresh session cookie + CSRF token.
 * Requires that the admin password has already been set (via setupViaApi).
 */
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
// Test suites
//
// Each suite gets its own server+storage instance (beforeAll / afterAll).
// Each suite uses a unique /24 IP block (10.X.0.0/24) so the module-level
// rateLimitMap in admin-auth.ts does not bleed between suites.
// ---------------------------------------------------------------------------

// ============================================================================
// POST /api/admin/check-setup
// ============================================================================

describe('POST /api/admin/check-setup', () => {
  // This suite needs multiple distinct admin states, so each test creates its
  // own server+storage inline with try/finally for guaranteed cleanup.

  it('returns needsSetup=true when no admin exists', async () => {
    const { server, storage } = await createTestServer();
    try {
      const res = await server.inject({
        method: 'POST',
        url: '/api/admin/check-setup',
        remoteAddress: '10.1.0.1',
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        needsSetup: true,
        setupPinExpired: false,
      });
    } finally {
      await server.close();
      storage.close();
    }
  });

  it('returns needsSetup=false once a password is set via setup', async () => {
    const { server, storage } = await createTestServer();
    try {
      await seedAdmin(storage);
      await setupViaApi(server, '10.1.0.2');

      const res = await server.inject({
        method: 'POST',
        url: '/api/admin/check-setup',
        remoteAddress: '10.1.0.3',
      });

      expect(res.json()).toMatchObject({
        needsSetup: false,
        setupPinExpired: false,
      });
    } finally {
      await server.close();
      storage.close();
    }
  });

  it('returns setupPinExpired=true when PIN is expired and no password is set', async () => {
    const { server, storage } = await createTestServer();
    try {
      // Seed with an already-expired PIN
      await seedAdmin(storage, { expiresIn: -1000 });

      const res = await server.inject({
        method: 'POST',
        url: '/api/admin/check-setup',
        remoteAddress: '10.1.0.4',
      });

      expect(res.json()).toMatchObject({
        needsSetup: false,
        setupPinExpired: true,
      });
    } finally {
      await server.close();
      storage.close();
    }
  });
});

// ============================================================================
// POST /api/admin/login
// ============================================================================

describe('POST /api/admin/login', () => {
  let server: FastifyInstance;
  let storage: Storage;

  beforeAll(async () => {
    ({ server, storage } = await createTestServer());
    await seedAdmin(storage);
    // Bootstrap: set admin password once so login tests can use it
    await setupViaApi(server, '10.2.0.0');
  });

  afterAll(async () => {
    await server.close();
    storage.close();
  });

  it('returns 200 with csrfToken and session cookie on correct password', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { password: TEST_PASSWORD },
      remoteAddress: '10.2.0.1',
    });

    expect(res.statusCode).toBe(200);

    const body = res.json<{
      success: boolean;
      csrfToken: string;
      expiresAt: number;
    }>();
    expect(body.success).toBe(true);
    expect(typeof body.csrfToken).toBe('string');
    expect(body.csrfToken).toHaveLength(64); // 32 random bytes → 64 hex chars
    expect(typeof body.expiresAt).toBe('number');
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('returns 403 INVALID_PASSWORD on incorrect password', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { password: 'wrong-password' },
      remoteAddress: '10.2.0.2',
    });

    expect(res.statusCode).toBe(403);
    expect(res.json<{ error: { code: string } }>().error.code).toBe(
      'INVALID_PASSWORD',
    );
  });

  it('returns 400 INVALID_REQUEST when password field is missing', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: {},
      remoteAddress: '10.2.0.3',
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 404 NO_ADMIN_EXISTS when no admin has been configured', async () => {
    // Needs an empty server — inline pattern keeps the main suite state clean
    const { server: emptyServer, storage: emptyStorage } =
      await createTestServer();
    try {
      const res = await emptyServer.inject({
        method: 'POST',
        url: '/api/admin/login',
        payload: { password: TEST_PASSWORD },
        remoteAddress: '10.2.0.4',
      });

      expect(res.statusCode).toBe(404);
      expect(res.json<{ error: { code: string } }>().error.code).toBe(
        'NO_ADMIN_EXISTS',
      );
    } finally {
      await emptyServer.close();
      emptyStorage.close();
    }
  });
});

// ============================================================================
// GET /api/admin/check-auth
// ============================================================================

describe('GET /api/admin/check-auth', () => {
  let server: FastifyInstance;
  let storage: Storage;
  let validSessionCookie: string;

  beforeAll(async () => {
    ({ server, storage } = await createTestServer());
    await seedAdmin(storage);

    // setupViaApi creates a session; use that cookie for authenticated tests
    const { cookie } = await setupViaApi(server, '10.3.0.0');
    validSessionCookie = cookie;
  });

  afterAll(async () => {
    await server.close();
    storage.close();
  });

  it('returns needsSetup=true when no admin has ever been configured', async () => {
    const { server: emptyServer, storage: emptyStorage } =
      await createTestServer();
    try {
      const res = await emptyServer.inject({
        method: 'GET',
        url: '/api/admin/check-auth',
        remoteAddress: '10.3.0.1',
      });

      const body = res.json<{ authenticated: boolean; needsSetup: boolean }>();
      expect(body.authenticated).toBe(false);
      expect(body.needsSetup).toBe(true);
    } finally {
      await emptyServer.close();
      emptyStorage.close();
    }
  });

  it('returns authenticated=false with no session cookie', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/admin/check-auth',
      remoteAddress: '10.3.0.2',
    });

    expect(res.json<{ authenticated: boolean }>().authenticated).toBe(false);
  });

  it('returns authenticated=true with a valid session cookie', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/admin/check-auth',
      headers: { Cookie: validSessionCookie },
      remoteAddress: '10.3.0.3',
    });

    expect(res.json<{ authenticated: boolean }>().authenticated).toBe(true);
  });
});

// ============================================================================
// POST /api/admin/logout
// ============================================================================

describe('POST /api/admin/logout', () => {
  let server: FastifyInstance;
  let storage: Storage;

  beforeAll(async () => {
    ({ server, storage } = await createTestServer());
    await seedAdmin(storage);
    // Set the admin password once; individual tests log in fresh to avoid
    // sharing session tokens and hitting CSRF confusion between tests.
    await setupViaApi(server, '10.4.0.0');
  });

  afterAll(async () => {
    await server.close();
    storage.close();
  });

  it('returns 204 and clears the session cookie on successful logout', async () => {
    const { cookie, csrfToken } = await loginFresh(server, '10.4.0.1');

    const res = await server.inject({
      method: 'POST',
      url: '/api/admin/logout',
      headers: { Cookie: cookie, 'X-CSRF-Token': csrfToken },
      remoteAddress: '10.4.0.2',
    });

    expect(res.statusCode).toBe(204);
    // Fastify clears the cookie by returning a Set-Cookie with empty value
    expect(res.headers['set-cookie']).toMatch(/hearth_admin_session=/);
  });

  it('returns 403 CSRF_TOKEN_MISSING when X-CSRF-Token header is absent', async () => {
    const { cookie } = await loginFresh(server, '10.4.0.3');

    const res = await server.inject({
      method: 'POST',
      url: '/api/admin/logout',
      headers: { Cookie: cookie }, // intentionally omit X-CSRF-Token
      remoteAddress: '10.4.0.4',
    });

    expect(res.statusCode).toBe(403);
    expect(res.json<{ error: { code: string } }>().error.code).toBe(
      'CSRF_TOKEN_MISSING',
    );
  });

  it('returns 403 CSRF_TOKEN_MISSING when no session cookie is present', async () => {
    // requireCsrfToken checks for the X-CSRF-Token header *before* the cookie,
    // so a request with neither gets CSRF_TOKEN_MISSING (403), not UNAUTHORIZED (401).
    const res = await server.inject({
      method: 'POST',
      url: '/api/admin/logout',
      remoteAddress: '10.4.0.5',
    });

    expect(res.statusCode).toBe(403);
    expect(res.json<{ error: { code: string } }>().error.code).toBe(
      'CSRF_TOKEN_MISSING',
    );
  });
});

// ============================================================================
// Rate limiting
// ============================================================================

describe('rate limiting on POST /api/admin/login', () => {
  let server: FastifyInstance;
  let storage: Storage;

  beforeAll(async () => {
    ({ server, storage } = await createTestServer());
    await seedAdmin(storage);
    await setupViaApi(server, '10.5.0.0');
  });

  afterAll(async () => {
    await server.close();
    storage.close();
  });

  it('returns 429 RATE_LIMIT_EXCEEDED after 5 failed attempts from the same IP', async () => {
    // Use a unique IP that no other suite touches to avoid state bleed
    const ip = '10.5.1.100';

    // Exhaust the 5-attempt window
    for (let i = 0; i < 5; i++) {
      const res = await server.inject({
        method: 'POST',
        url: '/api/admin/login',
        payload: { password: 'wrong' },
        remoteAddress: ip,
      });
      // Each failed attempt should be 403, not yet rate-limited
      expect(res.statusCode).toBe(403);
    }

    // 6th attempt must be rate-limited
    const blockedRes = await server.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { password: 'wrong' },
      remoteAddress: ip,
    });

    expect(blockedRes.statusCode).toBe(429);
    expect(blockedRes.json<{ error: { code: string } }>().error.code).toBe(
      'RATE_LIMIT_EXCEEDED',
    );
  });
});
