/**
 * Server admin authentication endpoints.
 *
 * Routes:
 * - POST /api/admin/check-setup - Check if server needs initial setup
 * - GET /api/admin/check-auth - Check authentication status
 * - POST /api/admin/setup - Complete initial setup with PIN
 * - POST /api/admin/login - Login with password (for returning admins)
 * - POST /api/admin/logout - Logout and revoke session
 * - POST /api/admin/change-password - Change admin password
 *
 * Authentication:
 * - Uses hearth_admin_session cookie (separate from seat sessions)
 * - Sessions are stored in admin_sessions table
 * - Tokens are hashed before storage
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomBytes, createHash } from 'crypto';
import type { Storage } from '../storage/storage';
import { deleteSetupPinFile } from '../auth/setup-pin.js';
import { generateCsrfToken, requireAdminCsrfToken } from '../auth/csrf.js';
import {
  hashPassword,
  verifyPassword,
  MAX_PASSWORD_LENGTH,
} from '../utils/password.js';

/** Backward-compatible alias — used internally AND re-exported for other route modules. */
const requireCsrfToken = requireAdminCsrfToken;
export { requireCsrfToken };

// Augment FastifyRequest to include adminId set by requireAdminAuth middleware
declare module 'fastify' {
  interface FastifyRequest {
    adminId?: string;
  }
}

const COOKIE_NAME = 'hearth_admin_session';
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MIN_PASSWORD_LENGTH = 8; // Minimum password length requirement

/**
 * Rate limit tracking.
 * Maps "ip:endpoint" to { count, resetAt }
 */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

/**
 * Removes expired entries from the rate limit map.
 * Called periodically to prevent unbounded memory growth.
 *
 * Side effects:
 * - Deletes entries from rateLimitMap where resetAt has passed
 */
function cleanupExpiredRateLimits(): void {
  const now = Date.now();
  let removedCount = 0;

  for (const [key, record] of rateLimitMap.entries()) {
    if (record.resetAt < now) {
      rateLimitMap.delete(key);
      removedCount++;
    }
  }

  // Log cleanup activity for monitoring (can be removed or gated by log level later)
  if (removedCount > 0) {
    console.log(
      `[Rate Limit Cleanup] Removed ${removedCount} expired entries. ${rateLimitMap.size} entries remaining.`,
    );
  }
}

/**
 * Starts periodic cleanup of expired rate limit entries.
 * Should be called once during server startup.
 *
 * @returns Interval ID that can be used to stop cleanup via clearInterval
 */
export function startRateLimitCleanup(): NodeJS.Timeout {
  const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

  // Run initial cleanup
  cleanupExpiredRateLimits();

  // Schedule periodic cleanup
  const intervalId = setInterval(cleanupExpiredRateLimits, CLEANUP_INTERVAL_MS);

  // Ensure interval doesn't prevent process exit
  intervalId.unref();

  return intervalId;
}

interface SetupBody {
  setupPin: string;
  newPassword?: string;
}

interface LoginBody {
  password: string;
}

interface ChangePasswordBody {
  currentPassword: string;
  newPassword: string;
}

/**
 * Generate a cryptographically secure session token.
 *
 * @returns 32-byte hex token
 */
function generateSessionToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Hash a session token for storage.
 * Uses simple SHA-256 since tokens are already random.
 *
 * @param token - Session token
 * @returns Hash of token
 */
function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Check if a request exceeds rate limit.
 *
 * @param ip - Client IP address
 * @param endpoint - Endpoint identifier
 * @param maxAttempts - Maximum attempts allowed in window
 * @param windowMs - Time window in milliseconds
 * @returns True if request is allowed, false if rate limit exceeded
 *
 * Side effects:
 * - Updates rateLimitMap with attempt count and reset time
 * - Automatically resets counter when window expires
 */
function checkRateLimit(
  ip: string,
  endpoint: string,
  maxAttempts: number,
  windowMs: number,
): boolean {
  const key = `${ip}:${endpoint}`;
  const now = Date.now();
  const record = rateLimitMap.get(key);

  // No record or window expired - reset counter
  if (!record || record.resetAt < now) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  // Rate limit exceeded
  if (record.count >= maxAttempts) {
    return false;
  }

  // Increment counter
  record.count++;
  return true;
}

export async function adminAuthRoutes(
  server: FastifyInstance,
  options: { storage: Storage; dataDir: string },
) {
  const storage = options.storage;

  /**
   * POST /api/admin/check-setup
   *
   * Check if the server needs initial setup.
   * Returns needsSetup=true if no admin exists or setup PIN is still valid.
   */
  server.post('/api/admin/check-setup', async (request, reply) => {
    const admin = await storage.getServerAdmin();

    if (!admin) {
      reply.code(200);
      return {
        needsSetup: true,
        setupPinExpired: false,
      };
    }

    // Admin exists - check if setup PIN is still valid
    const now = Date.now();
    const setupPinExpired =
      admin.setupPinExpiresAt === null || admin.setupPinExpiresAt < now;

    reply.code(200);
    return {
      needsSetup: !admin.passwordHash && !setupPinExpired,
      setupPinExpired: !admin.passwordHash && setupPinExpired,
    };
  });

  /**
   * GET /api/admin/check-auth
   *
   * Check if user is authenticated and if setup is needed.
   * Used by AdminLayout to guard admin routes.
   *
   * Returns:
   * - authenticated: true if valid session exists
   * - needsSetup: true if server needs initial configuration
   */
  server.get('/api/admin/check-auth', async (request, reply) => {
    // Check if setup is needed

    const admin = await storage.getServerAdmin();

    if (
      !admin ||
      (!admin.passwordHash &&
        admin.setupPinExpiresAt !== null &&
        admin.setupPinExpiresAt > Date.now())
    ) {
      reply.code(200);
      return {
        authenticated: false,
        needsSetup: true,
      };
    }

    // Admin exists, check if user is authenticated
    const sessionToken = request.cookies[COOKIE_NAME];

    if (!sessionToken) {
      reply.code(200);
      return {
        authenticated: false,
        needsSetup: false,
      };
    }

    // Verify session
    const sessionTokenHash = hashSessionToken(sessionToken);
    const session = await storage.getAdminSession(sessionTokenHash);

    if (!session) {
      reply.code(200);
      return {
        authenticated: false,
        needsSetup: false,
      };
    }

    // Check if session has expired
    if (session.expiresAt < Date.now()) {
      reply.code(200);
      return {
        authenticated: false,
        needsSetup: false,
      };
    }

    // Valid session!
    reply.code(200);
    return {
      authenticated: true,
      needsSetup: false,
    };
  });

  /**
   * POST /api/admin/setup
   *
   * Complete initial admin setup using the setup PIN.
   * Optionally sets a permanent password.
   *
   * Rate limit: 5 attempts per 10 minutes per IP
   */
  server.post<{ Body: SetupBody }>(
    '/api/admin/setup',
    async (request, reply) => {
      // Rate limiting: 5 attempts per 10 minutes
      const clientIp = request.ip;
      if (!checkRateLimit(clientIp, 'setup', 5, 10 * 60 * 1000)) {
        reply.code(429);
        return {
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many setup attempts. Please try again later.',
          },
        };
      }

      const { setupPin, newPassword } = request.body;

      // Validate request body
      if (!setupPin) {
        reply.code(400);
        return {
          error: {
            code: 'INVALID_REQUEST',
            message: 'setupPin is required',
          },
        };
      }

      // Get admin record
      const admin = await storage.getServerAdmin();

      if (!admin) {
        reply.code(404);
        return {
          error: {
            code: 'NO_ADMIN_EXISTS',
            message: 'Server admin has not been initialized',
          },
        };
      }

      // Check if setup PIN has expired
      const now = Date.now();
      if (admin.setupPinExpiresAt === null || admin.setupPinExpiresAt < now) {
        reply.code(403);
        return {
          error: {
            code: 'SETUP_PIN_EXPIRED',
            message: 'Setup PIN has expired. Contact server administrator.',
          },
        };
      }

      // Verify setup PIN
      if (!admin.pinHash) {
        reply.code(500);
        return {
          error: {
            code: 'INVALID_ADMIN_STATE',
            message: 'Admin setup PIN is not configured',
          },
        };
      }

      const pinValid = await verifyPassword(setupPin, admin.pinHash);

      if (!pinValid) {
        reply.code(403);
        return {
          error: {
            code: 'INVALID_PIN',
            message: 'Incorrect setup PIN',
          },
        };
      }

      // Set permanent password
      if (newPassword) {
        if (newPassword.length < MIN_PASSWORD_LENGTH) {
          reply.code(400);
          return {
            error: {
              code: 'PASSWORD_TOO_SHORT',
              message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
            },
          };
        }

        // Security: Prevent HashDoS by limiting password length
        if (Buffer.byteLength(newPassword, 'utf8') > MAX_PASSWORD_LENGTH) {
          reply.code(400);
          return {
            error: {
              code: 'PASSWORD_TOO_LONG',
              message: `Password cannot exceed ${MAX_PASSWORD_LENGTH} bytes`,
            },
          };
        }

        const passwordHash = await hashPassword(newPassword);
        await storage.updateServerAdmin(admin.id, {
          passwordHash,
          setupPinExpiresAt: null, // Clear setup PIN expiry
        });
      }

      // Create admin session
      const sessionToken = generateSessionToken();
      const sessionTokenHash = hashSessionToken(sessionToken);
      const csrfToken = generateCsrfToken();
      const expiresAt = Date.now() + SESSION_DURATION_MS;

      await storage.createAdminSession({
        adminId: admin.id,
        sessionTokenHash,
        csrfToken,
        expiresAt,
      });

      // Set session cookie
      reply.setCookie(COOKIE_NAME, sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production', // Require HTTPS in production, allow HTTP in dev
        sameSite: 'strict', // Strict CSRF protection for admin
        path: '/',
        maxAge: SESSION_DURATION_MS / 1000, // maxAge is in seconds
      });

      // Delete the setup PIN file since setup is now complete
      await deleteSetupPinFile(options.dataDir);

      reply.code(200);
      return {
        success: true,
        csrfToken,
        expiresAt,
      };
    },
  );

  /**
   * POST /api/admin/login
   *
   * Login as admin using password.
   *
   * Rate limit: 5 attempts per 10 minutes per IP
   */
  server.post<{ Body: LoginBody }>(
    '/api/admin/login',
    async (request, reply) => {
      // Rate limiting: 5 attempts per 10 minutes
      const clientIp = request.ip;
      if (!checkRateLimit(clientIp, 'login', 5, 10 * 60 * 1000)) {
        reply.code(429);
        return {
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many login attempts. Please try again later.',
          },
        };
      }

      const { password } = request.body;

      // Validate request body
      if (!password) {
        reply.code(400);
        return {
          error: {
            code: 'INVALID_REQUEST',
            message: 'password is required',
          },
        };
      }

      // Get admin record
      const admin = await storage.getServerAdmin();

      if (!admin) {
        reply.code(404);
        return {
          error: {
            code: 'NO_ADMIN_EXISTS',
            message: 'Server admin has not been initialized',
          },
        };
      }

      // Check if password is set
      if (!admin.passwordHash) {
        reply.code(403);
        return {
          error: {
            code: 'PASSWORD_NOT_SET',
            message: 'Admin password has not been set.',
          },
        };
      }

      // Verify password
      const passwordValid = await verifyPassword(password, admin.passwordHash);

      if (!passwordValid) {
        reply.code(403);
        return {
          error: {
            code: 'INVALID_PASSWORD',
            message: 'Incorrect password',
          },
        };
      }

      // Create admin session
      const sessionToken = generateSessionToken();
      const sessionTokenHash = hashSessionToken(sessionToken);
      const csrfToken = generateCsrfToken();
      const expiresAt = Date.now() + SESSION_DURATION_MS;

      await storage.createAdminSession({
        adminId: admin.id,
        sessionTokenHash,
        csrfToken,
        expiresAt,
      });

      // Set session cookie
      reply.setCookie(COOKIE_NAME, sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production', // Require HTTPS in production, allow HTTP in dev
        sameSite: 'strict', // Strict CSRF protection for admin
        path: '/',
        maxAge: SESSION_DURATION_MS / 1000,
      });

      reply.code(200);
      return {
        success: true,
        csrfToken,
        expiresAt,
      };
    },
  );

  /**
   * POST /api/admin/logout
   *
   * Logout current admin session and clear cookie.
   * Protected: Requires CSRF token
   */
  server.post(
    '/api/admin/logout',
    { preHandler: requireCsrfToken(storage) },
    async (request, reply) => {
      const sessionToken = request.cookies[COOKIE_NAME];

      if (sessionToken) {
        // Find and revoke the session
        const sessionTokenHash = hashSessionToken(sessionToken);
        const session = await storage.getAdminSession(sessionTokenHash);

        if (session) {
          await storage.revokeAdminSession(session.id);
        }
      }

      // Clear cookie regardless of whether session was found
      reply.clearCookie(COOKIE_NAME, {
        path: '/',
      });

      reply.code(204);
      return;
    },
  );

  /**
   * POST /api/admin/change-password
   *
   * Change admin password (requires current password or valid setup PIN).
   * Requires authentication and a valid CSRF token.
   *
   * Rate limit: 3 attempts per 10 minutes per IP
   */
  server.post<{ Body: ChangePasswordBody }>(
    '/api/admin/change-password',
    { preHandler: requireCsrfToken(storage) },
    async (request, reply) => {
      // Rate limiting: 3 attempts per 10 minutes
      const clientIp = request.ip;
      if (!checkRateLimit(clientIp, 'change-password', 3, 10 * 60 * 1000)) {
        reply.code(429);
        return {
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message:
              'Too many password change attempts. Please try again later.',
          },
        };
      }

      const { currentPassword, newPassword } = request.body;

      // Validate request body
      if (!currentPassword || !newPassword) {
        reply.code(400);
        return {
          error: {
            code: 'INVALID_REQUEST',
            message: 'currentPassword and newPassword are required',
          },
        };
      }

      if (newPassword.length < 8) {
        reply.code(400);
        return {
          error: {
            code: 'PASSWORD_TOO_SHORT',
            message: 'New password must be at least 8 characters',
          },
        };
      }

      // Security: Prevent HashDoS by limiting password length
      if (Buffer.byteLength(newPassword, 'utf8') > MAX_PASSWORD_LENGTH) {
        reply.code(400);
        return {
          error: {
            code: 'PASSWORD_TOO_LONG',
            message: `Password cannot exceed ${MAX_PASSWORD_LENGTH} bytes`,
          },
        };
      }

      // Authenticate current session
      const sessionToken = request.cookies[COOKIE_NAME];

      if (!sessionToken) {
        reply.code(401);
        return {
          error: {
            code: 'UNAUTHORIZED',
            message: 'No admin session found',
          },
        };
      }

      const sessionTokenHash = hashSessionToken(sessionToken);
      const session = await storage.getAdminSession(sessionTokenHash);

      if (!session) {
        reply.code(401);
        return {
          error: {
            code: 'INVALID_SESSION',
            message: 'Admin session not found or expired',
          },
        };
      }

      // Check if session has expired
      if (session.expiresAt < Date.now()) {
        reply.code(401);
        return {
          error: {
            code: 'SESSION_EXPIRED',
            message: 'Admin session has expired',
          },
        };
      }

      // Get admin record
      const admin = await storage.getServerAdmin();

      if (!admin) {
        reply.code(500);
        return {
          error: {
            code: 'ADMIN_NOT_FOUND',
            message: 'Admin record not found',
          },
        };
      }

      // Verify current password
      if (!admin.passwordHash) {
        reply.code(403);
        return {
          error: {
            code: 'NO_PASSWORD_SET',
            message: 'No password is currently set',
          },
        };
      }

      const passwordValid = await verifyPassword(
        currentPassword,
        admin.passwordHash,
      );

      if (!passwordValid) {
        reply.code(403);
        return {
          error: {
            code: 'INVALID_PASSWORD',
            message: 'Current password is incorrect',
          },
        };
      }

      // Update password
      const newPasswordHash = await hashPassword(newPassword);
      await storage.updateServerAdmin(admin.id, {
        passwordHash: newPasswordHash,
      });

      reply.code(200);
      return {
        success: true,
      };
    },
  );
}

/**
 * Middleware to require admin authentication.
 *
 * Checks for valid hearth_admin_session cookie and attaches adminId to request.
 * Returns 401 if not authenticated.
 *
 * Usage:
 *   server.addHook('preHandler', requireAdminAuth(storage));
 *   // or for specific routes:
 *   server.get('/api/admin/campaigns', { preHandler: requireAdminAuth(storage) }, handler);
 */
export function requireAdminAuth(storage: Storage) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const sessionToken = request.cookies[COOKIE_NAME];

    if (!sessionToken) {
      reply.code(401);
      return reply.send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Admin authentication required',
        },
      });
    }

    // Verify session
    const sessionTokenHash = hashSessionToken(sessionToken);
    const session = await storage.getAdminSession(sessionTokenHash);

    if (!session) {
      reply.code(401);
      return reply.send({
        error: {
          code: 'INVALID_SESSION',
          message: 'Admin session not found or has been revoked',
        },
      });
    }

    // Check if session has expired
    if (session.expiresAt < Date.now()) {
      reply.code(401);
      return reply.send({
        error: {
          code: 'SESSION_EXPIRED',
          message: 'Admin session has expired',
        },
      });
    }

    // Attach admin ID to request for downstream handlers
    request.adminId = session.adminId;
  };
}

/**
 * Backward-compatible alias is defined and exported near the top of this file.
 */
