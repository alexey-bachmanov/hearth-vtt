/**
 * Session audit endpoints.
 *
 * Routes:
 * - GET /api/campaigns/:id/sessions - List active sessions for a campaign
 * - DELETE /api/sessions/:sessionId - Revoke a session
 *
 * Note: These are stub implementations for Phase 6.
 * Full session management will be implemented in future phases.
 */

import type { FastifyInstance } from 'fastify';

// Mock session data
const mockSessions = [
  {
    id: 'session-001',
    seatId: 'seat-player-001',
    deviceName: "Alice's Laptop",
    lastUsedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 minutes ago
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
    expiresAt: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString(), // 28 days from now
  },
  {
    id: 'session-002',
    seatId: 'seat-player-002',
    deviceName: "Bob's Desktop",
    lastUsedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 minutes ago
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
    expiresAt: new Date(Date.now() + 29 * 24 * 60 * 60 * 1000).toISOString(), // 29 days from now
  },
];

export async function sessionRoutes(server: FastifyInstance) {
  /**
   * GET /api/campaigns/:id/sessions - List active sessions for a campaign
   */
  server.get<{ Params: { id: string } }>(
    '/api/campaigns/:id/sessions',
    async () => {
      // In a real implementation, this would filter by campaignId
      return { sessions: mockSessions };
    },
  );

  /**
   * DELETE /api/sessions/:sessionId - Revoke a session
   */
  server.delete<{ Params: { sessionId: string } }>(
    '/api/sessions/:sessionId',
    async (request, reply) => {
      const { sessionId } = request.params;

      // Check if session exists
      const session = mockSessions.find((s) => s.id === sessionId);

      if (!session) {
        reply.code(404);
        return {
          error: {
            code: 'SESSION_NOT_FOUND',
            message: 'Session not found',
          },
        };
      }

      reply.code(204);
      return;
    },
  );
}
