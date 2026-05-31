/**
 * Player authentication endpoints.
 *
 * Routes:
 * - POST /api/auth/claim-invite     — claim invite (login or register mode)
 * - POST /api/auth/login             — username + password login
 * - POST /api/auth/logout            — revoke current session
 * - POST /api/auth/logout-all        — revoke all sessions for the account
 * - POST /api/auth/refresh           — mint new access token from refresh cookie
 * - POST /api/auth/change-password   — change password (CSRF + auth required)
 * - GET  /api/auth/me                — return MeResponse for the current session
 *
 * Architecture:
 * - All business rules live in server/src/domain/auth/account.ts.
 * - Storage is injected as an option; this module has no direct DB imports.
 * - Rate limiting uses an in-memory bucket per IP (productionization via
 *   @fastify/rate-limit is Tech Debt).
 *
 * @see docs/decisions/010-player-account-model.md
 * @see docs/components/auth-join-flow.md
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomBytes, createHash } from 'crypto';
import type { Storage, PlayerAccount, Seat } from '../storage/index.js';
import type { MeResponse, SeatSummary } from '@hearth-vtt/shared';
import { changePasswordRequestSchema } from '@hearth-vtt/shared';
import { generateCsrfToken, requirePlayerCsrfToken } from '../auth/csrf.js';
import { buildRefreshCookieOptions } from '../auth/cookies.js';
import {
  createAccount,
  bindSeat,
  AccountError,
} from '../domain/auth/account.js';

import { verifyPassword, hashPassword } from '../utils/password.js';

// ============================================================================
// Constants
// ============================================================================

const REFRESH_COOKIE = 'hearth_refresh';
const REFRESH_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days (session expiresAt)

/**
 * In-memory rate limit: max login attempts per IP within a window.
 * Applies to POST /api/auth/login and the password-verify step of
 * POST /api/auth/claim-invite.
 *
 * Note: this map is module-level and is cleared on server restart.
 * Promoted to @fastify/rate-limit + Redis when multi-process is needed.
 */
const loginRateLimitMap = new Map<string, { count: number; resetAt: number }>();

const LOGIN_RATE_MAX = 10;
const LOGIN_RATE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Maximum number of concurrent active (non-revoked, non-expired) sessions
 * allowed per account. When a new session is created and the account is at
 * the cap, the oldest active session is evicted first.
 */
const SESSION_CAP = 64;

/**
 * Minimum response time for credential-validation paths (ms).
 *
 * Ensures that both "account not found" and "wrong password" responses take at
 * least this long, making it impractical to enumerate valid usernames via
 * wall-clock timing even if scrypt completes faster than usual.
 */
const AUTH_MIN_DELAY_MS = 200;

/**
 * Dummy scrypt hash used to normalise timing when an account does not exist.
 * Pre-computed once at module load; running verifyPassword against it ensures
 * scrypt always executes on the credential-validation path regardless of
 * whether the username was found.
 */
const DUMMY_HASH_FOR_TIMING: Promise<string> = hashPassword(
  'hearth-dummy-timing-normalisation-do-not-use',
);

/**
 * Sleep for the given number of milliseconds.
 */
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ============================================================================
// Token helpers (SHA-256 hashing of random tokens — mirrors admin-auth.ts)
// ============================================================================

/**
 * Generate a cryptographically random 32-byte hex token.
 */
function generateToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Hash a token for storage with SHA-256.
 * Random tokens are already high-entropy; SHA-256 is sufficient here.
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// ============================================================================
// Rate limit helper
// ============================================================================

/**
 * Check whether the given IP is within the login rate limit.
 *
 * @param ip - Client IP address.
 * @returns `true` if the request is allowed; `false` if rate-limited.
 *
 * Side effects:
 * - Increments the attempt counter in `loginRateLimitMap`.
 * - Resets the counter when the window expires.
 */
function checkLoginRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = loginRateLimitMap.get(ip);

  if (!record || record.resetAt < now) {
    loginRateLimitMap.set(ip, {
      count: 1,
      resetAt: now + LOGIN_RATE_WINDOW_MS,
    });
    return true;
  }

  if (record.count >= LOGIN_RATE_MAX) {
    return false;
  }

  record.count += 1;
  return true;
}

// ============================================================================
// MeResponse builder
// ============================================================================

/**
 * Build a `MeResponse` for the given account by joining all active seats
 * with their campaign names.
 *
 * Iterates all campaigns and filters seats by accountId. This is acceptable
 * for typical self-hosted server sizes (dozens of campaigns).
 *
 * @param account - The authenticated PlayerAccount.
 * @param storage - Storage facade for campaign and seat queries.
 * @returns A `MeResponse` ready to be serialised as a JSON response.
 */
async function buildMeResponse(
  account: PlayerAccount,
  storage: Storage,
): Promise<MeResponse> {
  const campaigns = await storage.listCampaigns();
  const seatSummaries: SeatSummary[] = [];

  for (const campaign of campaigns) {
    const seats = await storage.listSeats(campaign.id);
    for (const seat of seats) {
      if (seat.accountId === account.id && seat.isActive) {
        seatSummaries.push({
          campaignId: campaign.id,
          campaignName: campaign.name,
          seatId: seat.id,
          role: seat.role as SeatSummary['role'],
        });
      }
    }
  }

  return {
    accountId: account.id,
    username: account.username,
    seats: seatSummaries,
    mustChangePassword: account.mustChangePassword,
  };
}

// ============================================================================
// Player session resolver
// ============================================================================

/**
 * Resolve the player AuthSession from the `hearth_refresh` cookie.
 *
 * Returns `{ account, sessionId }` on success.
 * Sends a 401 response and returns `null` on failure.
 *
 * Revoked-token detection: if the session exists but has `revokedAt != null`,
 * returns 401. The session is already revoked so no further action is taken.
 *
 * @param request - Incoming Fastify request.
 * @param reply   - Fastify reply (used to send 401 on failure).
 * @param storage - Storage facade.
 */
async function resolvePlayerSession(
  request: FastifyRequest,
  reply: FastifyReply,
  storage: Storage,
): Promise<{
  account: PlayerAccount;
  sessionId: string;
  csrfToken: string;
} | null> {
  const refreshToken = request.cookies[REFRESH_COOKIE];

  if (!refreshToken) {
    reply.code(401);
    await reply.send({
      error: { code: 'UNAUTHORIZED', message: 'Not authenticated.' },
    });
    return null;
  }

  const tokenHash = hashToken(refreshToken);
  const session = await storage.getAuthSession(tokenHash);

  if (!session) {
    reply.code(401);
    await reply.send({
      error: { code: 'UNAUTHORIZED', message: 'Session not found.' },
    });
    return null;
  }

  if (session.revokedAt !== null) {
    reply.code(401);
    await reply.send({
      error: { code: 'SESSION_REVOKED', message: 'Session has been revoked.' },
    });
    return null;
  }

  if (session.expiresAt < Date.now()) {
    reply.code(401);
    await reply.send({
      error: { code: 'SESSION_EXPIRED', message: 'Session has expired.' },
    });
    return null;
  }

  const account = await storage.getPlayerAccountById(session.accountId);
  if (!account) {
    reply.code(401);
    await reply.send({
      error: { code: 'UNAUTHORIZED', message: 'Account not found.' },
    });
    return null;
  }

  return { account, sessionId: session.id, csrfToken: session.csrfToken };
}

// ============================================================================
// Route registration
// ============================================================================

export async function authRoutes(
  server: FastifyInstance,
  options: { storage: Storage },
) {
  const { storage } = options;

  // --------------------------------------------------------------------------
  // POST /api/auth/claim-invite
  // --------------------------------------------------------------------------

  /**
   * Claim an invite to bind a seat to a PlayerAccount.
   *
   * Accepts `mode: 'register'` (create new account) or `mode: 'login'`
   * (authenticate existing account). Validates the invite token and PIN,
   * then binds the seat and creates an AuthSession.
   *
   * Returns: ClaimInviteResponse + sets `hearth_refresh` cookie.
   * 400: missing fields or validation failure.
   * 401: wrong PIN or wrong password.
   * 404: invite not found.
   * 409: username taken (register) or seat already bound to another account.
   * 410: invite revoked, expired, or exhausted.
   * 429: rate limited.
   */
  server.post<{
    Body: {
      inviteToken: string;
      pin: string;
      mode: 'register' | 'login';
      username: string;
      password: string;
    };
  }>('/api/auth/claim-invite', async (request, reply) => {
    const { inviteToken, pin, mode, username, password } = request.body;

    if (!inviteToken || !pin || !mode || !username || !password) {
      reply.code(400);
      return {
        error: {
          code: 'INVALID_REQUEST',
          message:
            'inviteToken, pin, mode, username, and password are required.',
        },
      };
    }

    // --- Validate invite ---
    const invite = await storage.getInvite(inviteToken);

    if (!invite) {
      reply.code(404);
      return {
        error: {
          code: 'INVITE_NOT_FOUND',
          message: 'Invite not found or expired.',
        },
      };
    }

    if (invite.revokedAt !== null) {
      reply.code(410);
      return {
        error: {
          code: 'INVITE_REVOKED',
          message: 'This invite has been revoked.',
        },
      };
    }

    // --- Verify PIN ---
    // 200ms floor normalises timing between invalid-PIN and correct-PIN paths.
    const [pinValid] = await Promise.all([
      verifyPassword(pin, invite.pinHash),
      sleep(AUTH_MIN_DELAY_MS),
    ]);
    if (!pinValid) {
      reply.code(401);
      return { error: { code: 'INVALID_PIN', message: 'Incorrect PIN.' } };
    }

    // --- Resolve seat + campaignId ---
    // Invites reference a seatId; we need to find the owning campaign.
    const campaigns = await storage.listCampaigns();
    let seat: Seat | null = null;
    let campaignId: string | null = null;

    for (const campaign of campaigns) {
      const found = await storage.getSeat(campaign.id, invite.seatId);
      if (found) {
        seat = found;
        campaignId = campaign.id;
        break;
      }
    }

    if (!seat || !campaignId) {
      reply.code(500);
      return {
        error: {
          code: 'SEAT_NOT_FOUND',
          message: 'Invite references a seat that no longer exists.',
        },
      };
    }

    // --- Atomically consume invite use BEFORE any account mutation ---
    // Guards against concurrent claims on the same invite. If zero rows are
    // affected the invite was already exhausted/expired; no account is created.
    const consumed = await storage.consumeInviteAtomic(inviteToken, Date.now());
    if (!consumed) {
      reply.code(410);
      return {
        error: {
          code: 'INVITE_RACE_LOST',
          message:
            'This invite has already been claimed or has expired. Ask your GM for a new one.',
        },
      };
    }

    // --- Resolve or create account ---
    let account: PlayerAccount;

    if (mode === 'register') {
      try {
        account = await createAccount(username, password, storage);
      } catch (err) {
        if (err instanceof AccountError) {
          const status = err.code === 'USERNAME_TAKEN' ? 409 : 400;
          reply.code(status);
          return { error: { code: err.code, message: err.message } };
        }
        throw err;
      }
    } else {
      // mode === 'login'
      const ip = request.ip;
      if (!checkLoginRateLimit(ip)) {
        reply.code(429);
        return {
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many login attempts. Please try again later.',
          },
        };
      }

      const existing = await storage.getPlayerAccountByUsername(username);
      const hashToCheck =
        existing?.passwordHash ?? (await DUMMY_HASH_FOR_TIMING);
      const [passwordValid] = await Promise.all([
        verifyPassword(password, hashToCheck),
        sleep(AUTH_MIN_DELAY_MS),
      ]);

      if (!existing || !passwordValid) {
        reply.code(401);
        return {
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid username or password.',
          },
        };
      }

      account = existing;
    }

    // --- Bind seat ---
    try {
      await bindSeat(account.id, campaignId, seat.id, storage);
    } catch (err) {
      if (err instanceof AccountError) {
        reply.code(409);
        return { error: { code: err.code, message: err.message } };
      }
      throw err;
    }

    // --- Create auth session ---
    const refreshToken = generateToken();
    const csrfToken = generateCsrfToken();
    const now = Date.now();

    // Evict the oldest session if the account is at the cap.
    const activeCount =
      await storage.countActiveAuthSessionsForAccount(account.id);
    if (activeCount >= SESSION_CAP) {
      await storage.revokeOldestAuthSessionForAccount(account.id);
    }

    await storage.createAuthSession({
      accountId: account.id,
      refreshTokenHash: hashToken(refreshToken),
      csrfToken,
      expiresAt: now + REFRESH_DURATION_MS,
    });

    await storage.updatePlayerAccountLastLogin(account.id);

    reply.setCookie(
      REFRESH_COOKIE,
      refreshToken,
      await buildRefreshCookieOptions(request, storage),
    );

    reply.code(200);
    return {
      accountId: account.id,
      campaignId,
      seatId: seat.id,
      role: seat.role,
      csrfToken,
    };
  });

  // --------------------------------------------------------------------------
  // POST /api/auth/login
  // --------------------------------------------------------------------------

  /**
   * Log in to an existing PlayerAccount with username + password.
   *
   * Returns: LoginResponse (= MeResponse) + sets `hearth_refresh` cookie.
   * 400: missing fields.
   * 401: invalid credentials.
   * 429: rate limited.
   */
  server.post<{ Body: { username: string; password: string } }>(
    '/api/auth/login',
    async (request, reply) => {
      const { username, password } = request.body;

      if (!username || !password) {
        reply.code(400);
        return {
          error: {
            code: 'INVALID_REQUEST',
            message: 'username and password are required.',
          },
        };
      }

      const ip = request.ip;
      if (!checkLoginRateLimit(ip)) {
        reply.code(429);
        return {
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many login attempts. Please try again later.',
          },
        };
      }

      const account = await storage.getPlayerAccountByUsername(username);

      // Always run scrypt regardless of account existence to prevent
      // username enumeration via timing. The 200ms floor further normalises
      // the response time between not-found and wrong-password paths.
      const hashToCheck =
        account?.passwordHash ?? (await DUMMY_HASH_FOR_TIMING);
      const [passwordValid] = await Promise.all([
        verifyPassword(password, hashToCheck),
        sleep(AUTH_MIN_DELAY_MS),
      ]);

      if (!account || !passwordValid) {
        reply.code(401);
        return {
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid username or password.',
          },
        };
      }

      const refreshToken = generateToken();
      const csrfToken = generateCsrfToken();
      const now = Date.now();

      // Evict the oldest session if the account is at the cap.
      const activeCount =
        await storage.countActiveAuthSessionsForAccount(account.id);
      if (activeCount >= SESSION_CAP) {
        await storage.revokeOldestAuthSessionForAccount(account.id);
      }

      await storage.createAuthSession({
        accountId: account.id,
        refreshTokenHash: hashToken(refreshToken),
        csrfToken,
        expiresAt: now + REFRESH_DURATION_MS,
      });

      await storage.updatePlayerAccountLastLogin(account.id);

      reply.setCookie(
        REFRESH_COOKIE,
        refreshToken,
        await buildRefreshCookieOptions(request, storage),
      );

      reply.code(200);
      return { ...(await buildMeResponse(account, storage)), csrfToken };
    },
  );

  // --------------------------------------------------------------------------
  // POST /api/auth/logout
  // --------------------------------------------------------------------------

  /**
   * Revoke the current AuthSession and clear the refresh cookie.
   *
   * Returns 204 regardless of whether a valid session was found (idempotent).
   */
  server.post(
    '/api/auth/logout',
    { preHandler: requirePlayerCsrfToken(storage) },
    async (request, reply) => {
      const refreshToken = request.cookies[REFRESH_COOKIE];

      if (refreshToken) {
        const tokenHash = hashToken(refreshToken);
        const session = await storage.getAuthSession(tokenHash);
        if (session && session.revokedAt === null) {
          await storage.revokeAuthSession(session.id);
        }
      }

      reply.clearCookie(REFRESH_COOKIE, { path: '/' });
      reply.code(204);
      return;
    },
  );

  // --------------------------------------------------------------------------
  // POST /api/auth/refresh
  // --------------------------------------------------------------------------

  /**
   * Refresh the CSRF token for the current session.
   *
   * The refresh cookie is validated; the refresh token itself is NOT rotated
   * (stable refresh per ADR-010 §4). Cookie + CSRF is the sole auth scheme
   * (single-token model; no access token). Reuse detection: a revoked session
   * returns 401.
   *
   * Returns: RefreshResponse `{ csrfToken }`.
   * 401: missing cookie, session not found, expired, or revoked.
   */
  server.post('/api/auth/refresh', async (request, reply) => {
    const resolved = await resolvePlayerSession(request, reply, storage);
    if (!resolved) return;

    const { sessionId, csrfToken } = resolved;

    await storage.updateAuthSession(sessionId, {
      lastUsedAt: Date.now(),
    });

    reply.code(200);
    return { csrfToken };
  });

  // --------------------------------------------------------------------------
  // GET /api/auth/me
  // --------------------------------------------------------------------------

  /**
   * Return the MeResponse for the currently authenticated player.
   *
   * Uses the `hearth_refresh` cookie to resolve the session. Called by the
   * client auth guard on every protected-route mount.
   *
   * Returns: MeResponse `{ accountId, username, seats, mustChangePassword }`.
   * 401: not authenticated, session expired, or revoked.
   */
  server.get('/api/auth/me', async (request, reply) => {
    const resolved = await resolvePlayerSession(request, reply, storage);
    if (!resolved) return;

    reply.code(200);
    return buildMeResponse(resolved.account, storage);
  });

  // --------------------------------------------------------------------------
  // POST /api/auth/change-password
  // --------------------------------------------------------------------------

  /**
   * Change the current player's password.
   *
   * Requires CSRF token and a valid refresh-cookie session. Verifies the
   * current password before accepting the new one. On success, clears the
   * mustChangePassword flag and returns the updated MeResponse (so the client
   * can update state without a separate /me call).
   *
   * Returns: MeResponse (200) on success.
   * 400: validation failure.
   * 401: wrong current password, or not authenticated.
   * 403: CSRF failure.
   */
  server.post(
    '/api/auth/change-password',
    { preHandler: requirePlayerCsrfToken(storage) },
    async (request, reply) => {
      const resolved = await resolvePlayerSession(request, reply, storage);
      if (!resolved) return;

      const parsed = changePasswordRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return {
          error: {
            code: 'INVALID_REQUEST',
            message: parsed.error.message,
          },
        };
      }

      const { currentPassword, newPassword } = parsed.data;

      // Verify current password
      const valid = await verifyPassword(
        currentPassword,
        resolved.account.passwordHash,
      );
      if (!valid) {
        reply.code(401);
        return {
          error: {
            code: 'WRONG_PASSWORD',
            message: 'Current password is incorrect.',
          },
        };
      }

      const newHash = await hashPassword(newPassword);
      // mustChangePassword=false clears the forced-change flag; also updates hash
      await storage.setPlayerAccountMustChangePassword(
        resolved.account.id,
        false,
        newHash,
      );

      // Reload account so mustChangePassword=false is reflected in the response
      const updated = await storage.getPlayerAccountById(resolved.account.id);
      if (!updated) {
        reply.code(500);
        return {
          error: {
            code: 'INTERNAL',
            message: 'Account not found after update.',
          },
        };
      }

      reply.code(200);
      return buildMeResponse(updated, storage);
    },
  );

  // --------------------------------------------------------------------------
  // POST /api/auth/logout-all
  // --------------------------------------------------------------------------

  /**
   * Revoke all active sessions for the current player account.
   *
   * Requires CSRF token and a valid refresh-cookie session. Useful for
   * "log out everywhere" from all devices. The current session is also
   * revoked, so the client should redirect to login.
   *
   * Returns 204 on success.
   * 401: not authenticated.
   * 403: CSRF failure.
   */
  server.post(
    '/api/auth/logout-all',
    { preHandler: requirePlayerCsrfToken(storage) },
    async (request, reply) => {
      const resolved = await resolvePlayerSession(request, reply, storage);
      if (!resolved) return;

      await storage.revokeAllAuthSessionsForAccount(resolved.account.id);

      // Clear the refresh cookie
      reply
        .clearCookie(REFRESH_COOKIE, { path: '/', httpOnly: true })
        .code(204)
        .send();
    },
  );
}
