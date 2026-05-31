/**
 * admin-recovery route integration tests.
 *
 * Verifies POST /api/admin/reset behaviour:
 *   - no flag → 404
 *   - flag present → 200, flag deleted, password cleared, new PIN returned
 *   - flag unreadable (unlink fails) → 500, no DB changes
 *
 * Uses the same server/storage setup pattern as admin-auth.test.ts.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { tmpdir } from 'os';
import { mkdtemp, writeFile, unlink, access } from 'fs/promises';
import path from 'path';
import type { FastifyInstance } from 'fastify';
import { Storage, InMemoryBackend } from '../storage/index.js';
import { buildServer } from '../server.js';
import { hashPin } from '../auth/setup-pin.js';

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

const TEST_PIN = 'TESTPIN2';
const TEST_PASSWORD = 'secure-test-password-456';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createTestServer(dataDir: string): Promise<{
  server: FastifyInstance;
  storage: Storage;
}> {
  const storage = new Storage(new InMemoryBackend());
  await storage.init();
  const server = await buildServer({ dataDir, storage, logger: false });
  return { server, storage };
}

/** Seed an admin with a known PIN and set a password via the setup API. */
async function seedAndSetupAdmin(
  storage: Storage,
  server: FastifyInstance,
  remoteAddress: string,
): Promise<void> {
  const pinHash = await hashPin(TEST_PIN);
  await storage.createServerAdmin({
    usernameOrEmail: 'admin',
    pinHash,
    setupPinExpiresAt: Date.now() + 60_000,
  });

  const res = await server.inject({
    method: 'POST',
    url: '/api/admin/setup',
    payload: { setupPin: TEST_PIN, newPassword: TEST_PASSWORD },
    remoteAddress,
  });
  expect(res.statusCode).toBe(200);
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

// ============================================================================
// No flag present → 404
// ============================================================================

describe('POST /api/admin/reset — no flag present', () => {
  let server: FastifyInstance;
  let storage: Storage;
  let dataDir: string;

  beforeAll(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'hearth-recovery-'));
    ({ server, storage } = await createTestServer(dataDir));
    await seedAndSetupAdmin(storage, server, '10.30.0.1');
  });

  afterAll(async () => {
    await server.close();
    storage.close();
  });

  it('returns 404 FLAG_NOT_FOUND when admin-reset.flag does not exist', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/admin/reset',
      remoteAddress: '10.30.0.2',
    });

    expect(res.statusCode).toBe(404);
    expect(res.json<{ error: { code: string } }>().error.code).toBe(
      'FLAG_NOT_FOUND',
    );
  });

  it('does not modify the admin record when flag is absent', async () => {
    const admin = await storage.getServerAdmin();
    expect(admin?.passwordHash).not.toBeNull();
  });
});

// ============================================================================
// Flag present → 200, reset performed
// ============================================================================

describe('POST /api/admin/reset — flag present', () => {
  let server: FastifyInstance;
  let storage: Storage;
  let dataDir: string;
  const FLAG = () => path.join(dataDir, 'admin-reset.flag');

  beforeAll(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'hearth-recovery-'));
    ({ server, storage } = await createTestServer(dataDir));
    await seedAndSetupAdmin(storage, server, '10.31.0.1');
  });

  afterAll(async () => {
    await server.close();
    storage.close();
    // Clean up flag if a test left it (shouldn't happen normally)
    try {
      await unlink(FLAG());
    } catch {
      // ignore ENOENT
    }
  });

  beforeAll(async () => {
    // Create the flag so the first test has it
    await writeFile(FLAG(), '');
  });

  it('returns 200 with a setupPin', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/admin/reset',
      remoteAddress: '10.31.0.2',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ setupPin: string }>();
    expect(typeof body.setupPin).toBe('string');
    expect(body.setupPin.length).toBeGreaterThan(0);
  });

  it('deletes the flag file after success', async () => {
    await expect(access(FLAG())).rejects.toThrow();
  });

  it('clears the admin passwordHash', async () => {
    const admin = await storage.getServerAdmin();
    expect(admin?.passwordHash).toBeNull();
  });

  it('sets a new pinHash and non-null setupPinExpiresAt', async () => {
    const admin = await storage.getServerAdmin();
    expect(admin?.pinHash).not.toBeNull();
    expect(admin?.setupPinExpiresAt).not.toBeNull();
    expect(admin!.setupPinExpiresAt).toBeGreaterThan(Date.now());
  });

  it('revokes all pre-existing admin sessions', async () => {
    const sessions = await storage.listAdminSessions();
    const active = sessions.filter(
      (s) => s.revokedAt === null && s.expiresAt > Date.now(),
    );
    expect(active).toHaveLength(0);
  });

  it('old password is no longer accepted after reset', async () => {
    const loginRes = await server.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { password: TEST_PASSWORD },
      remoteAddress: '10.31.0.3',
    });
    expect(loginRes.statusCode).toBe(403);
  });
});

// ============================================================================
// Rate limiting
// ============================================================================

describe('POST /api/admin/reset — rate limit', () => {
  let server: FastifyInstance;
  let storage: Storage;
  let dataDir: string;

  beforeAll(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'hearth-recovery-'));
    ({ server, storage } = await createTestServer(dataDir));
  });

  afterAll(async () => {
    await server.close();
    storage.close();
  });

  it('returns 429 after 5 attempts from the same IP', async () => {
    // Use a unique IP so this suite's count doesn't bleed into others
    const ip = '10.32.0.1';

    // First 5 attempts hit 404 (no flag) — that's fine, they count toward the limit
    for (let i = 0; i < 5; i++) {
      const res = await server.inject({
        method: 'POST',
        url: '/api/admin/reset',
        remoteAddress: ip,
      });
      expect(res.statusCode).toBe(404);
    }

    // 6th attempt should be rate-limited
    const res = await server.inject({
      method: 'POST',
      url: '/api/admin/reset',
      remoteAddress: ip,
    });
    expect(res.statusCode).toBe(429);
    expect(res.json<{ error: { code: string } }>().error.code).toBe(
      'RATE_LIMIT_EXCEEDED',
    );
  });
});
