/**
 * CSRF token generation and validation middleware for HearthVTT.
 *
 * Provides two middleware factories:
 * - `requireAdminCsrfToken` — for admin routes (validates against AdminSession)
 * - `requirePlayerCsrfToken` — for player routes (validates against AuthSession)
 *
 * Both use the synchronizer-pattern:
 *   1. Server mints a random CSRF token and stores it in the session row.
 *   2. Token is returned to the client in the JSON response body (NOT as a cookie).
 *   3. Client echoes the token back in the `X-CSRF-Token` request header.
 *   4. Middleware looks up the session by cookie, then compares the stored token
 *      to the header value using timingSafeEqual.
 *
 * Why NOT an HttpOnly CSRF cookie: the browser auto-attaches all cookies to any
 * request origin, including attacker-controlled pages. An HttpOnly CSRF cookie
 * therefore provides zero CSRF protection. The token must travel via a
 * non-cookie channel readable only by same-origin scripts (i.e., the response
 * body or a response header). XSS is mitigated separately by CSP.
 *
 * @see docs/decisions/010-player-account-model.md
 */

import { randomBytes, timingSafeEqual, createHash } from 'crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Storage } from '../storage/storage.js';

// ---------------------------------------------------------------------------
// Token generation
// ---------------------------------------------------------------------------

/**
 * Generate a cryptographically random 32-byte hex CSRF token (64 chars).
 */
export function generateCsrfToken(): string {
  return randomBytes(32).toString('hex');
}

// ---------------------------------------------------------------------------
// Timing-safe comparison helper
// ---------------------------------------------------------------------------

/**
 * Compare two CSRF token strings in constant time.
 *
 * Returns `false` immediately when lengths differ (length is publicly known
 * from any valid session, so this leaks no useful information).
 */
function csrfTokensEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  return aBuf.length === bBuf.length && timingSafeEqual(aBuf, bBuf);
}

// ---------------------------------------------------------------------------
// Admin CSRF middleware
// ---------------------------------------------------------------------------

const ADMIN_COOKIE_NAME = 'hearth_admin_session';

/**
 * Hash a session token for admin session lookup.
 * Mirrors the implementation in admin-auth.ts.
 */
function hashAdminSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Fastify preHandler middleware that validates the `X-CSRF-Token` header for
 * admin routes.
 *
 * Must be composed after `requireAdminAuth` so the admin session cookie is
 * already present.
 *
 * Usage:
 * ```ts
 * server.post('/api/admin/foo', {
 *   preHandler: [requireAdminAuth(storage), requireAdminCsrfToken(storage)],
 * }, handler);
 * ```
 */
export function requireAdminCsrfToken(storage: Storage) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const headerToken = request.headers['x-csrf-token'];

    if (!headerToken || typeof headerToken !== 'string') {
      reply.code(403);
      return reply.send({
        error: {
          code: 'CSRF_TOKEN_MISSING',
          message: 'CSRF token is required.',
        },
      });
    }

    const sessionCookie = request.cookies[ADMIN_COOKIE_NAME];
    if (!sessionCookie) {
      reply.code(401);
      return reply.send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Admin authentication required.',
        },
      });
    }

    const sessionHash = hashAdminSessionToken(sessionCookie);
    const session = await storage.getAdminSession(sessionHash);

    if (!session) {
      reply.code(401);
      return reply.send({
        error: {
          code: 'INVALID_SESSION',
          message: 'Admin session not found or revoked.',
        },
      });
    }

    if (!csrfTokensEqual(session.csrfToken, headerToken)) {
      reply.code(403);
      return reply.send({
        error: { code: 'CSRF_TOKEN_INVALID', message: 'Invalid CSRF token.' },
      });
    }
  };
}

// ---------------------------------------------------------------------------
// Player CSRF middleware
// ---------------------------------------------------------------------------

const PLAYER_COOKIE_NAME = 'hearth_refresh';

/**
 * Hash a player refresh token for session lookup.
 * Mirrors the implementation in routes/auth.ts.
 */
function hashPlayerToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Fastify preHandler middleware that validates the `X-CSRF-Token` header for
 * player routes.
 *
 * The player must be authenticated (i.e., have a valid `hearth_refresh`
 * cookie). Apply this to every state-mutating player endpoint (POST /logout,
 * POST /change-password, etc.).
 *
 * Usage:
 * ```ts
 * server.post('/api/auth/logout', {
 *   preHandler: requirePlayerCsrfToken(storage),
 * }, handler);
 * ```
 */
export function requirePlayerCsrfToken(storage: Storage) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const headerToken = request.headers['x-csrf-token'];

    if (!headerToken || typeof headerToken !== 'string') {
      reply.code(403);
      return reply.send({
        error: {
          code: 'CSRF_TOKEN_MISSING',
          message: 'CSRF token is required.',
        },
      });
    }

    const refreshCookie = request.cookies[PLAYER_COOKIE_NAME];
    if (!refreshCookie) {
      reply.code(401);
      return reply.send({
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated.' },
      });
    }

    const tokenHash = hashPlayerToken(refreshCookie);
    const session = await storage.getAuthSession(tokenHash);

    if (
      !session ||
      session.revokedAt !== null ||
      session.expiresAt < Date.now()
    ) {
      reply.code(401);
      return reply.send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Session not found or expired.',
        },
      });
    }

    if (!csrfTokensEqual(session.csrfToken, headerToken)) {
      reply.code(403);
      return reply.send({
        error: { code: 'CSRF_TOKEN_INVALID', message: 'Invalid CSRF token.' },
      });
    }
  };
}
