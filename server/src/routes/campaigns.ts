/**
 * Campaign management endpoints.
 *
 * Routes:
 * - GET /api/campaigns - List all campaigns
 * - POST /api/campaigns - Create a new campaign
 * - GET /api/campaigns/:id - Get campaign details
 * - DELETE /api/campaigns/:id - Delete a campaign
 */

import type { FastifyInstance } from 'fastify';
import type { Storage } from '../storage/storage.js';

export async function campaignRoutes(
  server: FastifyInstance,
  options: { storage: Storage },
) {
  /**
   * GET /api/campaigns - List all campaigns
   */
  server.get('/api/campaigns', async () => {
    const campaigns = await options.storage.listCampaigns();
    return { campaigns };
  });

  /**
   * GET /api/campaigns/:id - Get campaign details
   */
  server.get<{ Params: { id: string } }>(
    '/api/campaigns/:id',
    async (request, reply) => {
      const campaign = await options.storage.getCampaign(request.params.id);
      if (!campaign) {
        reply.code(404);
        return {
          error: {
            code: 'CAMPAIGN_NOT_FOUND',
            message: 'Campaign not found',
          },
        };
      }
      return campaign;
    },
  );

  /**
   * POST /api/campaigns - Create a new campaign
   */
  server.post<{ Body: { name: string } }>(
    '/api/campaigns',
    async (request, reply) => {
      const { name } = request.body;
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        reply.code(400);
        return {
          error: {
            code: 'INVALID_NAME',
            message: 'Campaign name is required',
          },
        };
      }
      const campaign = await options.storage.createCampaign(name.trim());
      reply.code(201);
      return { campaign };
    },
  );

  /**
   * DELETE /api/campaigns/:id - Delete a campaign
   */
  server.delete<{ Params: { id: string } }>(
    '/api/campaigns/:id',
    async (request, reply) => {
      const campaign = await options.storage.getCampaign(request.params.id);
      if (!campaign) {
        reply.code(404);
        return {
          error: {
            code: 'CAMPAIGN_NOT_FOUND',
            message: 'Campaign not found',
          },
        };
      }
      await options.storage.deleteCampaign(request.params.id);
      reply.code(204);
      return;
    },
  );
}
