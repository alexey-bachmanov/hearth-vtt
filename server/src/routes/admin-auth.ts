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
import { randomBytes, scrypt, timingSafeEqual, createHash } from 'crypto';
import { promisify } from 'util';
import type { Storage } from '../storage/storage';
import { deleteSetupPinFile } from '../auth/setup-pin.js';

const scryptAsync = promisify(scrypt);

const COOKIE_NAME = 'hearth_admin_session';
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface CheckSetupResponse {
  needsSetup: boolean;
  setupPinExpired: boolean;
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
 * Hash a password using scrypt with a random salt.
 *
 * @param password - Plain text password
 * @returns Hash string in format: salt:hash
 */
async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derivedKey.toString('hex')}`;
}

/**
 * Verify a password against a stored hash.
 *
 * @param password - Plain text password to verify
 * @param hash - Stored hash in format: salt:hash
 * @returns True if password matches
 */
async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  const [salt, storedHash] = hash.split(':');
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  const storedBuffer = Buffer.from(storedHash, 'hex');

  // Use timing-safe comparison to prevent timing attacks
  return timingSafeEqual(derivedKey, storedBuffer);
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
   */
  server.post<{ Body: SetupBody }>(
    '/api/admin/setup',
    async (request, reply) => {
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

      // Optionally set permanent password
      if (newPassword) {
        if (newPassword.length < 8) {
          reply.code(400);
          return {
            error: {
              code: 'PASSWORD_TOO_SHORT',
              message: 'Password must be at least 8 characters',
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
      const expiresAt = Date.now() + SESSION_DURATION_MS;

      await storage.createAdminSession({
        adminId: admin.id,
        sessionTokenHash,
        expiresAt,
      });

      // Set session cookie
      reply.setCookie(COOKIE_NAME, sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: SESSION_DURATION_MS / 1000, // maxAge is in seconds
      });

      // Delete the setup PIN file since setup is now complete
      await deleteSetupPinFile(options.dataDir);

      reply.code(200);
      return {
        success: true,
        expiresAt,
      };
    },
  );

  /**
   * POST /api/admin/login
   *
   * Login as admin using password.
   */
  server.post<{ Body: LoginBody }>(
    '/api/admin/login',
    async (request, reply) => {
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
      const expiresAt = Date.now() + SESSION_DURATION_MS;

      await storage.createAdminSession({
        adminId: admin.id,
        sessionTokenHash,
        expiresAt,
      });

      // Set session cookie
      reply.setCookie(COOKIE_NAME, sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: SESSION_DURATION_MS / 1000,
      });

      reply.code(200);
      return {
        success: true,
        expiresAt,
      };
    },
  );

  /**
   * POST /api/admin/logout
   *
   * Logout current admin session and clear cookie.
   */
  server.post('/api/admin/logout', async (request, reply) => {
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
  });

  /**
   * POST /api/admin/change-password
   *
   * Change admin password (requires current password or valid setup PIN).
   * Requires authentication.
   */
  server.post<{ Body: ChangePasswordBody }>(
    '/api/admin/change-password',
    async (request, reply) => {
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
    (request as any).adminId = session.adminId;
  };
}
