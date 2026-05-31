/**
 * Admin recovery endpoint.
 *
 * Routes:
 * - POST /api/admin/reset — Filesystem-flag-gated admin password reset.
 *     Public (no auth, no CSRF). Subject to the server-level localhost-only
 *     preHandler guard (ADMIN_ALLOW_REMOTE bypasses it). Rate-limited to
 *     5 requests per hour per IP.
 *
 * Flow:
 *   1. Check ${DATA_DIR}/admin-reset.flag — 404 if absent.
 *   2. Delete the flag first; if delete fails → 500 with no DB changes.
 *   3. Revoke all admin sessions and null the admin password.
 *   4. Regenerate setup PIN, write admin-setup-pin.txt, log to console.
 *   5. Return { setupPin }.
 */

import type { FastifyInstance } from 'fastify';
import { promises as fs } from 'fs';
import path from 'path';
import type { Storage } from '../storage/storage.js';
import {
  generateSetupPin,
  hashPin,
  writeSetupPinFile,
  formatSetupPinMessage,
} from '../auth/setup-pin.js';

/** Flag filename that must be present in the data directory to allow a reset. */
const RESET_FLAG_FILENAME = 'admin-reset.flag';

/** Setup PIN validity window after a recovery reset. */
const SETUP_PIN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

// ---------------------------------------------------------------------------
// In-module rate limit (separate map from admin-auth.ts to keep concerns isolated)
// ---------------------------------------------------------------------------

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

/**
 * Check whether a request from `ip` is within the allowed rate.
 *
 * @param ip         - Client IP address.
 * @param maxAttempts - Maximum requests allowed per window.
 * @param windowMs   - Length of the rate-limit window in milliseconds.
 * @returns `true` if the request is allowed; `false` if rate-limited.
 *
 * Side effects: updates `rateLimitMap`.
 */
function checkRateLimit(
  ip: string,
  maxAttempts: number,
  windowMs: number,
): boolean {
  const key = `recovery:${ip}`;
  const now = Date.now();
  const record = rateLimitMap.get(key);

  if (!record || record.resetAt < now) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (record.count >= maxAttempts) {
    return false;
  }

  record.count++;
  return true;
}

export async function adminRecoveryRoutes(
  server: FastifyInstance,
  options: { storage: Storage; dataDir: string },
) {
  const storage = options.storage;

  /**
   * POST /api/admin/reset
   *
   * Resets admin credentials using a filesystem flag as proof of local access.
   * Public (no session / no CSRF required). Rate-limited to 5 req/hour per IP.
   *
   * Prerequisites:
   *   - The operator must have created an empty file at ${DATA_DIR}/admin-reset.flag
   *
   * On success:
   *   - The flag file is deleted.
   *   - All admin sessions are revoked.
   *   - The admin password is cleared (passwordHash → null).
   *   - A fresh setup PIN is generated, written to admin-setup-pin.txt, and
   *     logged to the console.
   *   - Returns { setupPin } so the caller can display it directly (useful for
   *     scripts or headless recovery flows; the file is the canonical copy).
   */
  server.post('/api/admin/reset', async (request, reply) => {
    // Rate limit: 5 attempts per hour
    if (!checkRateLimit(request.ip, 5, 60 * 60 * 1000)) {
      reply.code(429);
      return {
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many reset attempts. Please try again later.',
        },
      };
    }

    const flagPath = path.join(options.dataDir, RESET_FLAG_FILENAME);

    // 1. Check flag exists.
    try {
      await fs.access(flagPath);
    } catch {
      reply.code(404);
      return {
        error: {
          code: 'FLAG_NOT_FOUND',
          message: `admin-reset.flag not found in data directory. Create an empty file at: ${flagPath}`,
        },
      };
    }

    // 2. Delete the flag before any DB changes.
    //    If this fails, abort — do not touch the database.
    try {
      await fs.unlink(flagPath);
    } catch {
      reply.code(500);
      return {
        error: {
          code: 'FLAG_DELETE_FAILED',
          message:
            'Failed to delete admin-reset.flag. Check file permissions. No database changes were made.',
        },
      };
    }

    // 3. Revoke all admin sessions and clear the password.
    const admin = await storage.getServerAdmin();
    if (admin) {
      const sessions = await storage.listAdminSessions();
      await Promise.all(sessions.map((s) => storage.revokeAdminSession(s.id)));

      // Clear password so old credentials no longer work.
      await storage.updateServerAdmin(admin.id, {
        passwordHash: null,
      });
    }

    // 4. Regenerate setup PIN.
    const setupPin = generateSetupPin();
    const pinHash = await hashPin(setupPin);
    const expiresAt = Date.now() + SETUP_PIN_EXPIRY_MS;

    if (admin) {
      await storage.updateServerAdmin(admin.id, {
        pinHash,
        setupPinExpiresAt: expiresAt,
      });
    }

    await writeSetupPinFile(options.dataDir, setupPin, expiresAt);
    console.log(formatSetupPinMessage(setupPin, 'localhost', 3000));
    console.log(
      '[Admin Recovery] Admin password reset complete. Use the setup PIN above to reconfigure admin access.',
    );

    reply.code(200);
    return { setupPin };
  });
}
