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

process.env.NODE_ENV = 'development';
process.env.ADMIN_ALLOW_REMOTE = 'true';
process.env.COOKIE_SECRET =
  'test-cookie-secret-value-must-be-at-least-32-chars';

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

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

// ============================================================================
// GET /api/campaigns
// ============================================================================

describe('GET /api/campaigns', () => {
  let server: FastifyInstance;
  let storage: Storage;

  beforeAll(async () => {
    ({ server, storage } = await createTestServer());
  });

  afterAll(async () => {
    await server.close();
    storage.close();
  });

  it('returns { campaigns: [] } when no campaigns exist', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/campaigns',
      remoteAddress: '10.20.0.1',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ campaigns: [] });
  });

  it('returns all campaigns after one is created', async () => {
    await storage.createCampaign('Test Campaign');

    const res = await server.inject({
      method: 'GET',
      url: '/api/campaigns',
      remoteAddress: '10.20.0.2',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ campaigns: { name: string }[] }>();
    expect(body.campaigns).toHaveLength(1);
    expect(body.campaigns[0].name).toBe('Test Campaign');
  });
});

// ============================================================================
// GET /api/campaigns/:id
// ============================================================================

describe('GET /api/campaigns/:id', () => {
  let server: FastifyInstance;
  let storage: Storage;

  beforeAll(async () => {
    ({ server, storage } = await createTestServer());
  });

  afterAll(async () => {
    await server.close();
    storage.close();
  });

  it('returns the campaign object when it exists', async () => {
    const created = await storage.createCampaign('My Campaign');

    const res = await server.inject({
      method: 'GET',
      url: `/api/campaigns/${created.id}`,
      remoteAddress: '10.21.0.1',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: created.id, name: 'My Campaign' });
  });

  it('returns 404 CAMPAIGN_NOT_FOUND for an unknown ID', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/campaigns/nonexistent-id',
      remoteAddress: '10.21.0.2',
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({
      error: { code: 'CAMPAIGN_NOT_FOUND' },
    });
  });
});

// ============================================================================
// POST /api/campaigns
// ============================================================================

describe('POST /api/campaigns', () => {
  let server: FastifyInstance;
  let storage: Storage;
  let cookie: string;
  let csrfToken: string;

  beforeAll(async () => {
    ({ server, storage } = await createTestServer());
    await seedAdmin(storage);
    ({ cookie, csrfToken } = await setupViaApi(server, '10.22.0.1'));
  });

  afterAll(async () => {
    await server.close();
    storage.close();
  });

  it('returns 401 when no session cookie is provided', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/campaigns',
      payload: { name: 'New Campaign' },
      remoteAddress: '10.22.0.2',
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 403 CSRF_TOKEN_MISSING when cookie is present but X-CSRF-Token header is absent', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/campaigns',
      payload: { name: 'New Campaign' },
      headers: { Cookie: cookie },
      remoteAddress: '10.22.0.3',
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({
      error: { code: 'CSRF_TOKEN_MISSING' },
    });
  });

  it('returns 201 with a campaign object on success', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/campaigns',
      payload: { name: 'My New Campaign' },
      headers: { Cookie: cookie, 'X-CSRF-Token': csrfToken },
      remoteAddress: '10.22.0.4',
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      campaign: { name: 'My New Campaign' },
    });
  });

  it('returns 400 INVALID_NAME when name is empty string', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/campaigns',
      payload: { name: '' },
      headers: { Cookie: cookie, 'X-CSRF-Token': csrfToken },
      remoteAddress: '10.22.0.5',
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: 'INVALID_NAME' } });
  });

  it('returns 400 INVALID_NAME when name is whitespace only', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/campaigns',
      payload: { name: '   ' },
      headers: { Cookie: cookie, 'X-CSRF-Token': csrfToken },
      remoteAddress: '10.22.0.6',
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: 'INVALID_NAME' } });
  });

  it('returns 400 INVALID_NAME when name field is missing', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/campaigns',
      payload: {},
      headers: { Cookie: cookie, 'X-CSRF-Token': csrfToken },
      remoteAddress: '10.22.0.7',
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: 'INVALID_NAME' } });
  });
});

// ============================================================================
// DELETE /api/campaigns/:id
// ============================================================================

describe('DELETE /api/campaigns/:id', () => {
  let server: FastifyInstance;
  let storage: Storage;
  let cookie: string;
  let csrfToken: string;

  beforeAll(async () => {
    ({ server, storage } = await createTestServer());
    await seedAdmin(storage);
    ({ cookie, csrfToken } = await setupViaApi(server, '10.23.0.1'));
  });

  afterAll(async () => {
    await server.close();
    storage.close();
  });

  it('returns 401 when no session cookie is provided', async () => {
    const campaign = await storage.createCampaign('Campaign To Delete');

    const res = await server.inject({
      method: 'DELETE',
      url: `/api/campaigns/${campaign.id}`,
      remoteAddress: '10.23.0.2',
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 204 and campaign no longer appears in list after deletion', async () => {
    const campaign = await storage.createCampaign('Campaign To Delete');

    const deleteRes = await server.inject({
      method: 'DELETE',
      url: `/api/campaigns/${campaign.id}`,
      headers: { Cookie: cookie, 'X-CSRF-Token': csrfToken },
      remoteAddress: '10.23.0.3',
    });

    expect(deleteRes.statusCode).toBe(204);

    const listRes = await server.inject({
      method: 'GET',
      url: '/api/campaigns',
      remoteAddress: '10.23.0.4',
    });

    const body = listRes.json<{ campaigns: { id: string }[] }>();
    expect(body.campaigns.find((c) => c.id === campaign.id)).toBeUndefined();
  });

  it('returns 404 CAMPAIGN_NOT_FOUND for an unknown ID with valid auth', async () => {
    const res = await server.inject({
      method: 'DELETE',
      url: '/api/campaigns/nonexistent-id',
      headers: { Cookie: cookie, 'X-CSRF-Token': csrfToken },
      remoteAddress: '10.23.0.5',
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({
      error: { code: 'CAMPAIGN_NOT_FOUND' },
    });
  });
});

// ============================================================================
// PATCH /api/campaigns/:id
// ============================================================================

describe('PATCH /api/campaigns/:id', () => {
  let server: FastifyInstance;
  let storage: Storage;
  let cookie: string;
  let csrfToken: string;

  beforeAll(async () => {
    ({ server, storage } = await createTestServer());
    await seedAdmin(storage);
    ({ cookie, csrfToken } = await setupViaApi(server, '10.24.0.1'));
  });

  afterAll(async () => {
    await server.close();
    storage.close();
  });

  it('returns 401 when no session cookie is provided', async () => {
    const campaign = await storage.createCampaign('Original Name');
    const res = await server.inject({
      method: 'PATCH',
      url: `/api/campaigns/${campaign.id}`,
      payload: { name: 'New Name' },
      remoteAddress: '10.24.0.2',
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 CSRF_TOKEN_MISSING when CSRF header is absent', async () => {
    const campaign = await storage.createCampaign('No CSRF');
    const res = await server.inject({
      method: 'PATCH',
      url: `/api/campaigns/${campaign.id}`,
      payload: { name: 'New Name' },
      headers: { Cookie: cookie },
      remoteAddress: '10.24.0.3',
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: { code: 'CSRF_TOKEN_MISSING' } });
  });

  it('returns 200 with updated campaign object on success', async () => {
    const campaign = await storage.createCampaign('Old Name');
    const res = await server.inject({
      method: 'PATCH',
      url: `/api/campaigns/${campaign.id}`,
      payload: { name: 'Renamed Campaign' },
      headers: { Cookie: cookie, 'X-CSRF-Token': csrfToken },
      remoteAddress: '10.24.0.4',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ campaign: { id: string; name: string } }>();
    expect(body.campaign.id).toBe(campaign.id);
    expect(body.campaign.name).toBe('Renamed Campaign');
  });

  it('persists the rename — GET returns new name', async () => {
    const campaign = await storage.createCampaign('Before Rename');
    await server.inject({
      method: 'PATCH',
      url: `/api/campaigns/${campaign.id}`,
      payload: { name: 'After Rename' },
      headers: { Cookie: cookie, 'X-CSRF-Token': csrfToken },
      remoteAddress: '10.24.0.5',
    });
    const getRes = await server.inject({
      method: 'GET',
      url: `/api/campaigns/${campaign.id}`,
      remoteAddress: '10.24.0.6',
    });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json()).toMatchObject({ name: 'After Rename' });
  });

  it('returns 400 INVALID_NAME when name is empty', async () => {
    const campaign = await storage.createCampaign('Empty Name Test');
    const res = await server.inject({
      method: 'PATCH',
      url: `/api/campaigns/${campaign.id}`,
      payload: { name: '' },
      headers: { Cookie: cookie, 'X-CSRF-Token': csrfToken },
      remoteAddress: '10.24.0.7',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: 'INVALID_NAME' } });
  });

  it('returns 404 CAMPAIGN_NOT_FOUND for an unknown ID', async () => {
    const res = await server.inject({
      method: 'PATCH',
      url: '/api/campaigns/nonexistent-id',
      payload: { name: 'Ghost' },
      headers: { Cookie: cookie, 'X-CSRF-Token': csrfToken },
      remoteAddress: '10.24.0.8',
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { code: 'CAMPAIGN_NOT_FOUND' } });
  });
});
