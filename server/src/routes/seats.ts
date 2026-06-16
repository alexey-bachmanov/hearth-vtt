/**
 * Seat management endpoints.
 *
 * Routes:
 * - GET    /api/campaigns/:id/seats             — List seats for a campaign
 * - POST   /api/campaigns/:id/seats             — Create a new seat
 * - PATCH  /api/campaigns/:id/seats/:seatId     — Update seat metadata
 * - DELETE /api/campaigns/:id/seats/:seatId     — Delete a seat
 *
 * All mutations require admin authentication and a CSRF token.
 *
 * @see docs/protocols/http-api.md
 */

import type { FastifyInstance } from 'fastify';
import type { SeatRole } from '@hearth-vtt/shared';
import type { Storage } from '../storage/storage.js';
import { requireAdminAuth, requireCsrfToken } from './admin-auth.js';

const VALID_ROLES: SeatRole[] = ['gm', 'player', 'spectator'];

function isValidRole(role: unknown): role is SeatRole {
  return typeof role === 'string' && (VALID_ROLES as string[]).includes(role);
}

export async function seatRoutes(
  server: FastifyInstance,
  options: { storage: Storage },
) {
  const { storage } = options;

  /**
   * GET /api/campaigns/:id/seats — List all seats for a campaign.
   * Protected: Requires admin authentication.
   */
  server.get<{ Params: { id: string } }>(
    '/api/campaigns/:id/seats',
    { preHandler: requireAdminAuth(storage) },
    async (request) => {
      const seats = await storage.listSeats(request.params.id);
      return { seats };
    },
  );

  /**
   * POST /api/campaigns/:id/seats — Create a new seat in a campaign.
   * Protected: Requires admin authentication and CSRF token.
   *
   * Body: { displayName: string, role: SeatRole }
   * Returns 201 with the created Seat on success.
   * Returns 400 on missing/invalid fields.
   */
  server.post<{
    Params: { id: string };
    Body: { displayName?: unknown; role?: unknown };
  }>(
    '/api/campaigns/:id/seats',
    {
      preHandler: [requireAdminAuth(storage), requireCsrfToken(storage)],
    },
    async (request, reply) => {
      const { displayName, role } = request.body ?? {};

      if (
        typeof displayName !== 'string' ||
        displayName.trim().length < 1 ||
        displayName.length > 64
      ) {
        reply.code(400);
        return {
          error: {
            code: 'INVALID_REQUEST',
            message: 'displayName is required (1–64 characters)',
          },
        };
      }

      if (!isValidRole(role)) {
        reply.code(400);
        return {
          error: {
            code: 'INVALID_REQUEST',
            message: `role must be one of: ${VALID_ROLES.join(', ')}`,
          },
        };
      }

      const seat = await storage.createSeat({
        campaignId: request.params.id,
        displayName: displayName.trim(),
        role: role!,
      });

      reply.code(201);
      return seat;
    },
  );

  /**
   * PATCH /api/campaigns/:id/seats/:seatId — Update seat display name, role, or active status.
   * Protected: Requires admin authentication and CSRF token.
   *
   * Body: { displayName?: string, role?: SeatRole, isActive?: boolean }
   * Returns 200 with the updated Seat on success.
   * Returns 404 if the seat is not found.
   */
  server.patch<{
    Params: { id: string; seatId: string };
    Body: { displayName?: unknown; role?: unknown; isActive?: unknown };
  }>(
    '/api/campaigns/:id/seats/:seatId',
    {
      preHandler: [requireAdminAuth(storage), requireCsrfToken(storage)],
    },
    async (request, reply) => {
      const { id: campaignId, seatId } = request.params;
      const existing = await storage.getSeat(campaignId, seatId);
      if (!existing) {
        reply.code(404);
        return { error: { code: 'SEAT_NOT_FOUND', message: 'Seat not found' } };
      }

      const { displayName, role, isActive } = request.body ?? {};

      if (displayName !== undefined) {
        if (
          typeof displayName !== 'string' ||
          displayName.trim().length < 1 ||
          displayName.length > 64
        ) {
          reply.code(400);
          return {
            error: {
              code: 'INVALID_REQUEST',
              message: 'displayName must be 1–64 characters',
            },
          };
        }
      }

      if (role !== undefined && !isValidRole(role)) {
        reply.code(400);
        return {
          error: {
            code: 'INVALID_REQUEST',
            message: `role must be one of: ${VALID_ROLES.join(', ')}`,
          },
        };
      }

      if (isActive !== undefined && typeof isActive !== 'boolean') {
        reply.code(400);
        return {
          error: {
            code: 'INVALID_REQUEST',
            message: 'isActive must be a boolean',
          },
        };
      }

      await storage.updateSeat(campaignId, seatId, {
        displayName:
          typeof displayName === 'string'
            ? displayName.trim()
            : existing.displayName,
        role: isValidRole(role) ? role : existing.role,
        isActive: typeof isActive === 'boolean' ? isActive : existing.isActive,
        accountId: existing.accountId,
      });

      const updated = await storage.getSeat(campaignId, seatId);
      reply.code(200);
      return updated;
    },
  );

  /**
   * DELETE /api/campaigns/:id/seats/:seatId — Remove a seat from a campaign.
   * Protected: Requires admin authentication and CSRF token.
   *
   * Returns 204 on success.
   * Returns 404 if the seat is not found.
   */
  server.delete<{ Params: { id: string; seatId: string } }>(
    '/api/campaigns/:id/seats/:seatId',
    {
      preHandler: [requireAdminAuth(storage), requireCsrfToken(storage)],
    },
    async (request, reply) => {
      const { id: campaignId, seatId } = request.params;
      const existing = await storage.getSeat(campaignId, seatId);
      if (!existing) {
        reply.code(404);
        return { error: { code: 'SEAT_NOT_FOUND', message: 'Seat not found' } };
      }

      await storage.deleteSeat(campaignId, seatId);
      reply.code(204).send();
    },
  );
}
