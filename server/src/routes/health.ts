/**
 * Health check and server info endpoints.
 *
 * Routes:
 * - GET /healthz - Kubernetes-style health check
 * - GET /health - Alias for /healthz with more details
 * - GET /api/info - Server version and protocol info
 */

import type { FastifyInstance } from 'fastify';

const VERSION = '0.1.0';
const PROTOCOL_VERSION = '1.0';

export async function healthRoutes(server: FastifyInstance) {
  /**
   * GET /healthz - Basic health check
   */
  server.get('/healthz', async () => {
    return { status: 'ok' };
  });

  /**
   * GET /health - Detailed health check
   */
  server.get('/health', async () => {
    return {
      status: 'ok',
      version: VERSION,
      uptime: process.uptime(),
      timestamp: Date.now(),
    };
  });

  /**
   * GET /api/info - Server information
   */
  server.get('/api/info', async () => {
    return {
      version: VERSION,
      protocolVersion: PROTOCOL_VERSION,
      features: ['websocket', 'campaigns', 'auth', 'seats', 'invites'],
    };
  });
}
