/**
 * Seat management endpoints.
 *
 * Routes:
 * - GET /api/campaigns/:id/seats - List seats for a campaign
 * - POST /api/campaigns/:id/seats - Create a new seat
 * - PATCH /api/campaigns/:id/seats/:seatId - Update seat metadata
 * - DELETE /api/campaigns/:id/seats/:seatId - Delete a seat
 *
 * Note: These are stub implementations for Phase 6.
 * Full seat management will be implemented in future phases.
 */

import type { FastifyInstance } from 'fastify';
import type { Storage } from '../storage/storage.js';
import { requireAdminAuth, requireCsrfToken } from './admin-auth.js';

// Mock seat data
const mockSeats = [
  {
    id: 'seat-admin-001',
    campaignId: 'campaign-mock-001',
    name: 'Admin',
    role: 'admin',
    isImmutable: true,
    createdAt: new Date('2026-01-15T10:30:00Z').toISOString(),
    updatedAt: new Date('2026-01-15T10:30:00Z').toISOString(),
  },
  {
    id: 'seat-player-001',
    campaignId: 'campaign-mock-001',
    name: 'Player 1',
    role: 'player',
    isImmutable: false,
    createdAt: new Date('2026-01-15T11:00:00Z').toISOString(),
    updatedAt: new Date('2026-01-15T11:00:00Z').toISOString(),
  },
  {
    id: 'seat-player-002',
    campaignId: 'campaign-mock-001',
    name: 'Player 2',
    role: 'player',
    isImmutable: false,
    createdAt: new Date('2026-01-16T09:00:00Z').toISOString(),
    updatedAt: new Date('2026-01-16T09:00:00Z').toISOString(),
  },
];

export async function seatRoutes(
  server: FastifyInstance,
  options: { storage: Storage },
) {
  /**
   * GET /api/campaigns/:id/seats - List seats for a campaign
   * Protected: Requires admin authentication
   */
  server.get<{ Params: { id: string } }>(
    '/api/campaigns/:id/seats',
    { preHandler: requireAdminAuth(options.storage) },
    async (request) => {
      const campaignId = request.params.id;
      const seats = mockSeats.filter((seat) => seat.campaignId === campaignId);
      return { seats };
    },
  );

  /**
   * POST /api/campaigns/:id/seats - Create a new seat
   * Protected: Requires admin authentication and CSRF token
   */
  server.post<{ Params: { id: string }; Body: { name: string; role: string } }>(
    '/api/campaigns/:id/seats',
    {
      preHandler: [
        requireAdminAuth(options.storage),
        requireCsrfToken(options.storage),
      ],
    },
    async (request, reply) => {
      const { name, role } = request.body;
      const campaignId = request.params.id;

      if (!name || !role) {
        reply.code(400);
        return {
          error: {
            code: 'INVALID_REQUEST',
            message: 'name and role are required',
          },
        };
      }

      // Create mock seat
      const newSeat = {
        id: 'seat-' + Date.now(),
        campaignId,
        name,
        role,
        isImmutable: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      reply.code(201);
      return newSeat;
    },
  );

  /**
   * PATCH /api/campaigns/:id/seats/:seatId - Update seat metadata
   * Protected: Requires admin authentication and CSRF token
   */
  server.patch<{
    Params: { id: string; seatId: string };
    Body: { name?: string; role?: string };
  }>(
    '/api/campaigns/:id/seats/:seatId',
    {
      preHandler: [
        requireAdminAuth(options.storage),
        requireCsrfToken(options.storage),
      ],
    },
    async (request, reply) => {
      const { name, role } = request.body;
      const { seatId } = request.params;

      // Find existing seat
      const existingSeat = mockSeats.find((seat) => seat.id === seatId);

      if (!existingSeat) {
        reply.code(404);
        return {
          error: {
            code: 'SEAT_NOT_FOUND',
            message: 'Seat not found',
          },
        };
      }

      // Return updated seat
      const updatedSeat = {
        ...existingSeat,
        name: name || existingSeat.name,
        role: role || existingSeat.role,
        updatedAt: new Date().toISOString(),
      };

      reply.code(200);
      return updatedSeat;
    },
  );

  /**
   * DELETE /api/campaigns/:id/seats/:seatId - Delete a seat
   * Protected: Requires admin authentication and CSRF token
   */
  server.delete<{ Params: { id: string; seatId: string } }>(
    '/api/campaigns/:id/seats/:seatId',
    {
      preHandler: [
        requireAdminAuth(options.storage),
        requireCsrfToken(options.storage),
      ],
    },
    async (request, reply) => {
      const { seatId } = request.params;

      // Find seat
      const seat = mockSeats.find((s) => s.id === seatId);

      if (!seat) {
        reply.code(404);
        return {
          error: {
            code: 'SEAT_NOT_FOUND',
            message: 'Seat not found',
          },
        };
      }

      // Prevent deleting admin seat
      if (seat.isImmutable) {
        reply.code(403);
        return {
          error: {
            code: 'SEAT_IMMUTABLE',
            message: 'Cannot delete immutable admin seat',
          },
        };
      }

      reply.code(204);
      return;
    },
  );
}
