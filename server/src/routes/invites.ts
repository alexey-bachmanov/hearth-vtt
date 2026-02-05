/**
 * Invite management endpoints.
 *
 * Routes:
 * - GET /api/campaigns/:id/invites - List invites for a campaign
 * - POST /api/campaigns/:id/invites - Create a new invite
 * - DELETE /api/campaigns/:id/invites/:inviteId - Revoke an invite
 *
 * Note: These are stub implementations for Phase 6.
 * Full invite management will be implemented in future phases.
 */

import type { FastifyInstance } from 'fastify';

// Mock invite data
const mockInvites = [
  {
    id: 'invite-001',
    inviteToken: 'abc123def456ghi789',
    inviteUrl: 'http://localhost:3000/join/abc123def456ghi789',
    campaignId: 'campaign-mock-001',
    seatId: 'seat-player-001',
    rolesGranted: ['player'],
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    maxClaims: 1,
    claimedAt: null,
    revokedAt: null,
    createdAt: new Date('2026-02-01T10:00:00Z').toISOString(),
  },
  {
    id: 'invite-002',
    inviteToken: 'xyz789jkl012mno345',
    inviteUrl: 'http://localhost:3000/join/xyz789jkl012mno345',
    campaignId: 'campaign-mock-001',
    seatId: 'seat-player-002',
    rolesGranted: ['player'],
    expiresAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // Expired
    maxClaims: 1,
    claimedAt: new Date('2026-02-03T14:30:00Z').toISOString(),
    revokedAt: null,
    createdAt: new Date('2026-01-28T10:00:00Z').toISOString(),
  },
];

export async function inviteRoutes(server: FastifyInstance) {
  /**
   * GET /api/campaigns/:id/invites - List invites for a campaign
   */
  server.get<{ Params: { id: string } }>(
    '/api/campaigns/:id/invites',
    async (request) => {
      const campaignId = request.params.id;
      const invites = mockInvites.filter(
        (invite) => invite.campaignId === campaignId,
      );
      return { invites };
    },
  );

  /**
   * POST /api/campaigns/:id/invites - Create a new invite
   */
  server.post<{
    Params: { id: string };
    Body: {
      seatId: string;
      rolesGranted: string[];
      pin: string;
      expiresIn: number;
      maxClaims?: number;
    };
  }>('/api/campaigns/:id/invites', async (request, reply) => {
    const { seatId, rolesGranted, pin, expiresIn, maxClaims } = request.body;
    const campaignId = request.params.id;

    if (!seatId || !rolesGranted || !pin || !expiresIn) {
      reply.code(400);
      return {
        error: {
          code: 'INVALID_REQUEST',
          message: 'seatId, rolesGranted, pin, and expiresIn are required',
        },
      };
    }

    // Generate mock invite token
    const inviteToken =
      Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15);
    const inviteUrl = `${request.protocol}://${request.hostname}/join/${inviteToken}`;

    // Create mock invite
    const newInvite = {
      invite: {
        id: 'invite-' + Date.now(),
        inviteToken,
        inviteUrl,
        expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
      },
    };

    reply.code(201);
    return newInvite;
  });

  /**
   * DELETE /api/campaigns/:id/invites/:inviteId - Revoke an invite
   */
  server.delete<{ Params: { id: string; inviteId: string } }>(
    '/api/campaigns/:id/invites/:inviteId',
    async (request, reply) => {
      const { inviteId } = request.params;

      // Check if invite exists
      const invite = mockInvites.find((inv) => inv.id === inviteId);

      if (!invite) {
        reply.code(404);
        return {
          error: {
            code: 'INVITE_NOT_FOUND',
            message: 'Invite not found',
          },
        };
      }

      reply.code(204);
      return;
    },
  );
}
