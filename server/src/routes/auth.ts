/**
 * Authentication endpoints.
 *
 * Routes:
 * - POST /api/auth/claim-invite - Claim an invite and create session
 * - POST /api/auth/refresh - Refresh access token
 * - POST /api/auth/logout - Logout and clear session
 *
 * Note: These are stub implementations for Phase 6.
 * Full authentication will be implemented in future phases.
 */

import type { FastifyInstance, FastifyReply } from 'fastify';

interface ClaimInviteBody {
  inviteToken: string;
  pin: string;
  deviceName?: string;
  userAgent?: string;
}

export async function authRoutes(server: FastifyInstance) {
  // SECURITY: These are stub routes with hardcoded credentials.
  // Only allow in development to prevent accidental production deployment.
  if (process.env.NODE_ENV === 'production') {
    server.all('/api/auth/*', async (request, reply) => {
      reply.code(501);
      return {
        error: {
          code: 'NOT_IMPLEMENTED',
          message:
            'Player authentication not yet implemented. Use admin authentication instead.',
        },
      };
    });
    return;
  }

  /**
   * POST /api/auth/claim-invite - Claim invite and create session
   */
  server.post<{ Body: ClaimInviteBody }>(
    '/api/auth/claim-invite',
    async (request, reply) => {
      const { inviteToken, pin, deviceName } = request.body;

      // Validate request body
      if (!inviteToken || !pin) {
        reply.code(400);
        return {
          error: {
            code: 'INVALID_REQUEST',
            message: 'inviteToken and pin are required',
          },
        };
      }

      // Stub: Check for specific error cases for testing
      if (inviteToken === 'expired-token') {
        reply.code(404);
        return {
          error: {
            code: 'INVITE_NOT_FOUND',
            message: 'Invite not found or expired',
          },
        };
      }

      if (inviteToken === 'claimed-token') {
        reply.code(409);
        return {
          error: {
            code: 'INVITE_ALREADY_CLAIMED',
            message: 'This invite has already been claimed',
          },
        };
      }

      if (pin !== '1234') {
        reply.code(403);
        return {
          error: {
            code: 'INVALID_PIN',
            message: 'Incorrect PIN',
          },
        };
      }

      // Stub: Return mock session data
      const mockSession = {
        campaignId: 'campaign-mock-001',
        seatId: 'seat-mock-001',
        role: 'player',
        redirectUrl: '/play',
      };

      // Set mock refresh token cookie
      reply.setCookie('hearth_refresh', 'mock-refresh-token-' + Date.now(), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 30 * 24 * 60 * 60, // 30 days
      });

      reply.code(200);
      return mockSession;
    },
  );

  /**
   * POST /api/auth/refresh - Refresh access token
   */
  server.post('/api/auth/refresh', async (request, reply) => {
    const refreshToken = request.cookies.hearth_refresh;

    if (!refreshToken) {
      reply.code(401);
      return {
        error: {
          code: 'UNAUTHORIZED',
          message: 'No refresh token provided',
        },
      };
    }

    // Stub: Return mock access token
    const mockAccessToken = {
      accessToken: 'mock-access-token-' + Date.now(),
      expiresIn: 900, // 15 minutes
    };

    // Rotate refresh token (set new cookie)
    reply.setCookie('hearth_refresh', 'mock-refresh-token-' + Date.now(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });

    reply.code(200);
    return mockAccessToken;
  });

  /**
   * POST /api/auth/logout - Logout and clear session
   */
  server.post('/api/auth/logout', async (request, reply) => {
    // Clear refresh token cookie
    reply.clearCookie('hearth_refresh', {
      path: '/',
    });

    reply.code(204);
    return;
  });
}
