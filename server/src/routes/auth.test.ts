import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { tmpdir } from 'os';
import type { FastifyInstance } from 'fastify';
import { Storage, InMemoryBackend } from '../storage/index.js';
import { buildServer } from '../server.js';
import { hashPin } from '../auth/setup-pin.js';
import { createAccount } from '../domain/auth/account.js';

// ---------------------------------------------------------------------------
// Environment setup — must run before buildServer()
// ---------------------------------------------------------------------------

process.env.NODE_ENV = 'development';
process.env.ADMIN_ALLOW_REMOTE = 'true';
process.env.COOKIE_SECRET =
  'test-cookie-secret-value-must-be-at-least-32-chars';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DATA_DIR = tmpdir();
const INVITE_PIN = 'invitepin123';
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

/**
 * Seed a campaign + seat + invite into storage.
 * Returns the invite token and the IDs.
 */
async function seedCampaignSeatInvite(
  storage: Storage,
  { pin = INVITE_PIN, usesRemaining = 1 } = {},
): Promise<{
  campaignId: string;
  seatId: string;
  inviteToken: string;
}> {
  const campaign = await storage.createCampaign('Test Campaign');
  const seat = await storage.createSeat({
    campaignId: campaign.id,
    displayName: 'Player Seat',
    role: 'player',
  });

  const pinHash = await hashPin(pin);
  const inviteToken =
    'test-invite-token-' + Math.random().toString(36).slice(2);

  await storage.createInvite({
    campaignId: campaign.id,
    seatId: seat.id,
    inviteToken,
    pinHash,
    maxUses: usesRemaining,
    expiresAt: Date.now() + 60 * 60 * 1000, // 1 hour
  });

  return { campaignId: campaign.id, seatId: seat.id, inviteToken };
}

/**
 * Extract the hearth_refresh cookie value from a response.
 */
function extractRefreshCookie(res: {
  headers: Record<string, unknown>;
}): string | null {
  const raw = Array.isArray(res.headers['set-cookie'])
    ? res.headers['set-cookie'].find((c: string) =>
        c.startsWith('hearth_refresh='),
      )
    : typeof res.headers['set-cookie'] === 'string'
      ? res.headers['set-cookie']
      : null;

  if (!raw || !raw.startsWith('hearth_refresh=')) return null;
  return raw.split(';')[0]; // "hearth_refresh=<value>"
}

// ============================================================================
// POST /api/auth/claim-invite
// ============================================================================

describe('POST /api/auth/claim-invite', () => {
  let server: FastifyInstance;
  let storage: Storage;

  // Unique IP for this suite to avoid loginRateLimitMap spillover between suites.
  const SUITE_IP = '10.0.1.1';

  beforeAll(async () => {
    ({ server, storage } = await createTestServer());
  });

  afterAll(async () => {
    await server.close();
    storage.close();
  });

  it('register mode: creates account, binds seat, sets cookie', async () => {
    const { inviteToken, campaignId, seatId } =
      await seedCampaignSeatInvite(storage);

    const res = await server.inject({
      method: 'POST',
      url: '/api/auth/claim-invite',
      payload: {
        inviteToken,
        pin: INVITE_PIN,
        mode: 'register',
        username: 'alice',
        password: USER_PASSWORD,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.campaignId).toBe(campaignId);
    expect(body.seatId).toBe(seatId);
    expect(body.role).toBe('player');
    expect(body.accountId).toBeTruthy();
    expect(extractRefreshCookie(res)).not.toBeNull();
  });

  it('login mode: authenticates existing account, binds seat', async () => {
    // Create account first, use a fresh invite for a new seat
    const account = await createAccount('bob', USER_PASSWORD, storage);
    const { inviteToken, campaignId, seatId } =
      await seedCampaignSeatInvite(storage);

    const res = await server.inject({
      method: 'POST',
      url: '/api/auth/claim-invite',
      payload: {
        inviteToken,
        pin: INVITE_PIN,
        mode: 'login',
        username: 'bob',
        password: USER_PASSWORD,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.accountId).toBe(account.id);
    expect(body.campaignId).toBe(campaignId);
    expect(body.seatId).toBe(seatId);
  });

  it('returns 404 for unknown invite token', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/auth/claim-invite',
      payload: {
        inviteToken: 'nonexistent-token',
        pin: INVITE_PIN,
        mode: 'register',
        username: 'charlie',
        password: USER_PASSWORD,
      },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('INVITE_NOT_FOUND');
  });

  it('returns 401 for wrong PIN', async () => {
    const { inviteToken } = await seedCampaignSeatInvite(storage);

    const res = await server.inject({
      method: 'POST',
      url: '/api/auth/claim-invite',
      payload: {
        inviteToken,
        pin: 'wrongpin',
        mode: 'register',
        username: 'dave',
        password: USER_PASSWORD,
      },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('INVALID_PIN');
  });

  it('returns 409 for duplicate username in register mode', async () => {
    await createAccount('evan', USER_PASSWORD, storage);
    const { inviteToken } = await seedCampaignSeatInvite(storage);

    const res = await server.inject({
      method: 'POST',
      url: '/api/auth/claim-invite',
      payload: {
        inviteToken,
        pin: INVITE_PIN,
        mode: 'register',
        username: 'evan',
        password: USER_PASSWORD,
      },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('USERNAME_TAKEN');
  });

  it('returns 401 for wrong password in login mode', async () => {
    await createAccount('grace', USER_PASSWORD, storage);
    const { inviteToken } = await seedCampaignSeatInvite(storage);

    const res = await server.inject({
      method: 'POST',
      url: '/api/auth/claim-invite',
      remoteAddress: SUITE_IP,
      payload: {
        inviteToken,
        pin: INVITE_PIN,
        mode: 'login',
        username: 'grace',
        password: 'wrongpassword',
      },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('INVALID_CREDENTIALS');
  });

  it('returns 410 for an expired invite', async () => {
    const campaign = await storage.createCampaign('Expired Campaign');
    const seat = await storage.createSeat({
      campaignId: campaign.id,
      displayName: 'Seat',
      role: 'player',
    });
    const pinHash = await hashPin(INVITE_PIN);
    const expiredToken = 'expired-token-' + Math.random().toString(36).slice(2);
    await storage.createInvite({
      campaignId: campaign.id,
      seatId: seat.id,
      inviteToken: expiredToken,
      pinHash,
      maxUses: 1,
      expiresAt: Date.now() - 1000, // already expired
    });

    const res = await server.inject({
      method: 'POST',
      url: '/api/auth/claim-invite',
      payload: {
        inviteToken: expiredToken,
        pin: INVITE_PIN,
        mode: 'register',
        username: 'henry',
        password: USER_PASSWORD,
      },
    });

    expect(res.statusCode).toBe(410);
    expect(res.json().error.code).toBe('INVITE_RACE_LOST');
  });
});

// ============================================================================
// POST /api/auth/login
// ============================================================================

describe('POST /api/auth/login', () => {
  let server: FastifyInstance;
  let storage: Storage;

  // Unique IP for this suite to avoid loginRateLimitMap spillover between suites.
  const SUITE_IP = '10.0.2.1';

  beforeAll(async () => {
    ({ server, storage } = await createTestServer());
    await createAccount('loginuser', USER_PASSWORD, storage);
  });

  afterAll(async () => {
    await server.close();
    storage.close();
  });

  it('returns MeResponse and sets cookie on valid credentials', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/auth/login',
      remoteAddress: SUITE_IP,
      payload: { username: 'loginuser', password: USER_PASSWORD },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.username).toBe('loginuser');
    expect(body.seats).toBeInstanceOf(Array);
    expect(extractRefreshCookie(res)).not.toBeNull();
  });

  it('returns 401 for wrong password', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/auth/login',
      remoteAddress: SUITE_IP,
      payload: { username: 'loginuser', password: 'wrongpassword' },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('INVALID_CREDENTIALS');
  });

  it('returns 401 for unknown username', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/auth/login',
      remoteAddress: SUITE_IP,
      payload: { username: 'nobody', password: USER_PASSWORD },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('INVALID_CREDENTIALS');
  });

  it('returns 400 when fields are missing', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'loginuser' },
    });

    expect(res.statusCode).toBe(400);
  });
});

// ============================================================================
// POST /api/auth/logout
// ============================================================================

describe('POST /api/auth/logout', () => {
  let server: FastifyInstance;
  let storage: Storage;

  // Unique IP for this suite.
  const SUITE_IP = '10.0.3.1';

  beforeAll(async () => {
    ({ server, storage } = await createTestServer());
  });

  afterAll(async () => {
    await server.close();
    storage.close();
  });

  it('clears the cookie and returns 204 (with valid session)', async () => {
    await createAccount('logoutuser', USER_PASSWORD, storage);

    // Login first
    const loginRes = await server.inject({
      method: 'POST',
      url: '/api/auth/login',
      remoteAddress: SUITE_IP,
      payload: { username: 'logoutuser', password: USER_PASSWORD },
    });
    const cookie = extractRefreshCookie(loginRes)!;
    expect(cookie).not.toBeNull();

    const res = await server.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie },
    });

    expect(res.statusCode).toBe(204);
    // Cookie should be cleared (set-cookie header clears hearth_refresh)
    const rawSetCookie = res.headers['set-cookie'];
    const cookieHeader = Array.isArray(rawSetCookie)
      ? rawSetCookie.join('; ')
      : String(rawSetCookie ?? '');
    expect(cookieHeader).toContain('hearth_refresh=;');
  });

  it('returns 204 even with no cookie (idempotent)', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/auth/logout',
    });
    expect(res.statusCode).toBe(204);
  });

  it('session is revoked after logout — subsequent /me returns 401', async () => {
    await createAccount('logoutme', USER_PASSWORD, storage);

    const loginRes = await server.inject({
      method: 'POST',
      url: '/api/auth/login',
      remoteAddress: SUITE_IP,
      payload: { username: 'logoutme', password: USER_PASSWORD },
    });
    const cookie = extractRefreshCookie(loginRes)!;

    await server.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie },
    });

    const meRes = await server.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie },
    });

    expect(meRes.statusCode).toBe(401);
  });
});

// ============================================================================
// POST /api/auth/refresh
// ============================================================================

describe('POST /api/auth/refresh', () => {
  let server: FastifyInstance;
  let storage: Storage;

  // Unique IP for this suite.
  const SUITE_IP = '10.0.4.1';

  beforeAll(async () => {
    ({ server, storage } = await createTestServer());
    await createAccount('refreshuser', USER_PASSWORD, storage);
  });

  afterAll(async () => {
    await server.close();
    storage.close();
  });

  it('returns a new accessToken when refresh cookie is valid', async () => {
    const loginRes = await server.inject({
      method: 'POST',
      url: '/api/auth/login',
      remoteAddress: SUITE_IP,
      payload: { username: 'refreshuser', password: USER_PASSWORD },
    });
    const cookie = extractRefreshCookie(loginRes)!;

    const res = await server.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().accessToken).toBeTruthy();
  });

  it('refresh token is stable — same cookie works on second call', async () => {
    const loginRes = await server.inject({
      method: 'POST',
      url: '/api/auth/login',
      remoteAddress: SUITE_IP,
      payload: { username: 'refreshuser', password: USER_PASSWORD },
    });
    const cookie = extractRefreshCookie(loginRes)!;

    const res1 = await server.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: { cookie },
    });
    const res2 = await server.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: { cookie },
    });

    expect(res1.statusCode).toBe(200);
    expect(res2.statusCode).toBe(200);
    // Access tokens are different but both valid
    expect(res1.json().accessToken).not.toBe(res2.json().accessToken);
  });

  it('returns 401 with no cookie', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/auth/refresh',
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 after session is revoked', async () => {
    const loginRes = await server.inject({
      method: 'POST',
      url: '/api/auth/login',
      remoteAddress: SUITE_IP,
      payload: { username: 'refreshuser', password: USER_PASSWORD },
    });
    const cookie = extractRefreshCookie(loginRes)!;

    await server.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie },
    });

    const res = await server.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: { cookie },
    });

    // Session is revoked — getAuthSession returns null, so we get UNAUTHORIZED.
    // The revoked-token reuse detection path (SESSION_REVOKED) is not reachable
    // via the in-memory/SQLite backends because getAuthSession filters revoked sessions.
    expect(res.statusCode).toBe(401);
  });
});

// ============================================================================
// GET /api/auth/me
// ============================================================================

describe('GET /api/auth/me', () => {
  let server: FastifyInstance;
  let storage: Storage;

  // Unique IP for this suite.
  const SUITE_IP = '10.0.5.1';

  beforeAll(async () => {
    ({ server, storage } = await createTestServer());
  });

  afterAll(async () => {
    await server.close();
    storage.close();
  });

  it('returns MeResponse with correct username and empty seats', async () => {
    await createAccount('meuser', USER_PASSWORD, storage);

    const loginRes = await server.inject({
      method: 'POST',
      url: '/api/auth/login',
      remoteAddress: SUITE_IP,
      payload: { username: 'meuser', password: USER_PASSWORD },
    });
    const cookie = extractRefreshCookie(loginRes)!;

    const res = await server.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.username).toBe('meuser');
    expect(body.seats).toEqual([]);
  });

  it('seats includes bound campaigns after claim-invite', async () => {
    await createAccount('seated', USER_PASSWORD, storage);
    const { inviteToken, campaignId } = await seedCampaignSeatInvite(storage);

    await server.inject({
      method: 'POST',
      url: '/api/auth/claim-invite',
      remoteAddress: SUITE_IP,
      payload: {
        inviteToken,
        pin: INVITE_PIN,
        mode: 'login',
        username: 'seated',
        password: USER_PASSWORD,
      },
    });

    const loginRes = await server.inject({
      method: 'POST',
      url: '/api/auth/login',
      remoteAddress: SUITE_IP,
      payload: { username: 'seated', password: USER_PASSWORD },
    });
    const cookie = extractRefreshCookie(loginRes)!;

    const res = await server.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.seats).toHaveLength(1);
    expect(body.seats[0].campaignId).toBe(campaignId);
    expect(body.seats[0].role).toBe('player');
  });

  it('returns 401 with no cookie', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/auth/me',
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 with invalid cookie value', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: 'hearth_refresh=bogus-token-value' },
    });
    expect(res.statusCode).toBe(401);
  });
});
