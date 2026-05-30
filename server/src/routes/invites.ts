/**
 * Invite management endpoints.
 *
 * Routes:
 * - GET    /api/campaigns/:id/invites                     — List invites for a campaign
 * - POST   /api/campaigns/:id/invites                     — Create a new invite
 * - DELETE /api/campaigns/:id/invites/:inviteToken        — Revoke an invite
 *
 * All mutations require admin authentication and a CSRF token.
 * Invite tokens are 48 hex characters (24 random bytes).
 *
 * @see docs/protocols/http-api.md
 * @see docs/components/auth-join-flow.md
 */

import { randomBytes } from 'crypto';
import type { FastifyInstance } from 'fastify';
import type { Storage } from '../storage/storage.js';
import { requireAdminAuth, requireCsrfToken } from './admin-auth.js';
import { hashPassword } from '../utils/password.js';

export async function inviteRoutes(
  server: FastifyInstance,
  options: { storage: Storage },
) {
  const { storage } = options;

  /**
   * GET /api/campaigns/:id/invites — List all invites across all seats in a campaign.
   * Protected: Requires admin authentication.
   *
   * Returns invites without the pinHash (server-only field).
   */
  server.get<{ Params: { id: string } }>(
    '/api/campaigns/:id/invites',
    { preHandler: requireAdminAuth(storage) },
    async (request) => {
      const { id: campaignId } = request.params;
      const seats = await storage.listSeats(campaignId);
      const inviteArrays = await Promise.all(
        seats.map((seat) => storage.listInvitesForSeat(campaignId, seat.id)),
      );
      const invites = inviteArrays
        .flat()
        .map(({ pinHash: _pinHash, ...rest }) => ({
          ...rest,
          expiresAt: new Date(rest.expiresAt).toISOString(),
          createdAt: new Date(rest.createdAt).toISOString(),
          revokedAt:
            rest.revokedAt != null
              ? new Date(rest.revokedAt).toISOString()
              : null,
        }));
      return { invites };
    },
  );

  /**
   * POST /api/campaigns/:id/invites — Create a new invite for a seat.
   * Protected: Requires admin authentication and CSRF token.
   *
   * Body: { seatId: string, pin: string, expiresIn: number (seconds), maxUses?: number }
   * Returns 201 with { invite: { id, inviteToken, inviteUrl, expiresAt } }.
   * Returns 400 on missing/invalid fields.
   */
  server.post<{
    Params: { id: string };
    Body: {
      seatId?: unknown;
      pin?: unknown;
      expiresIn?: unknown;
      maxUses?: unknown;
    };
  }>(
    '/api/campaigns/:id/invites',
    {
      preHandler: [requireAdminAuth(storage), requireCsrfToken(storage)],
    },
    async (request, reply) => {
      const { seatId, pin, expiresIn, maxUses } = request.body ?? {};

      if (typeof seatId !== 'string' || seatId.trim().length < 1) {
        reply.code(400);
        return {
          error: { code: 'INVALID_REQUEST', message: 'seatId is required' },
        };
      }

      if (typeof pin !== 'string' || pin.length < 4 || pin.length > 64) {
        reply.code(400);
        return {
          error: {
            code: 'INVALID_REQUEST',
            message: 'pin is required (4–64 characters)',
          },
        };
      }

      if (
        typeof expiresIn !== 'number' ||
        !Number.isInteger(expiresIn) ||
        expiresIn <= 0
      ) {
        reply.code(400);
        return {
          error: {
            code: 'INVALID_REQUEST',
            message: 'expiresIn must be a positive integer (seconds)',
          },
        };
      }

      const resolvedMaxUses =
        maxUses === undefined
          ? 1
          : typeof maxUses === 'number' &&
              Number.isInteger(maxUses) &&
              maxUses > 0
            ? maxUses
            : null;

      if (resolvedMaxUses === null) {
        reply.code(400);
        return {
          error: {
            code: 'INVALID_REQUEST',
            message: 'maxUses must be a positive integer',
          },
        };
      }

      const { id: campaignId } = request.params;
      const pinHash = await hashPassword(pin);
      const inviteToken = randomBytes(24).toString('hex');
      const expiresAt = Date.now() + expiresIn * 1000;

      const invite = await storage.createInvite({
        campaignId,
        seatId: seatId.trim(),
        inviteToken,
        pinHash,
        maxUses: resolvedMaxUses,
        expiresAt,
      });

      const inviteUrl = `${request.protocol}://${request.hostname}/join/${inviteToken}`;

      reply.code(201);
      return {
        invite: {
          id: invite.id,
          inviteToken: invite.inviteToken,
          inviteUrl,
          expiresAt: new Date(invite.expiresAt).toISOString(),
        },
      };
    },
  );

  /**
   * DELETE /api/campaigns/:id/invites/:inviteToken — Revoke an invite.
   * Protected: Requires admin authentication and CSRF token.
   *
   * The `:inviteToken` URL param is the raw invite token (not the UUID id).
   * Returns 204 on success.
   * Returns 404 if the invite is not found or does not belong to this campaign.
   */
  server.delete<{ Params: { id: string; inviteToken: string } }>(
    '/api/campaigns/:id/invites/:inviteToken',
    {
      preHandler: [requireAdminAuth(storage), requireCsrfToken(storage)],
    },
    async (request, reply) => {
      const { id: campaignId, inviteToken } = request.params;

      const invite = await storage.getInvite(inviteToken);
      if (!invite) {
        reply.code(404);
        return {
          error: { code: 'INVITE_NOT_FOUND', message: 'Invite not found' },
        };
      }

      // Verify the invite's seat belongs to this campaign
      const seat = await storage.getSeat(campaignId, invite.seatId);
      if (!seat) {
        reply.code(404);
        return {
          error: { code: 'INVITE_NOT_FOUND', message: 'Invite not found' },
        };
      }

      await storage.revokeInvite(inviteToken);
      reply.code(204).send();
    },
  );
}
