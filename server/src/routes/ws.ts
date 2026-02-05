/**
 * WebSocket endpoint for realtime communication.
 *
 * Routes:
 * - GET /ws - WebSocket upgrade endpoint
 *
 * Implements the realtime protocol defined in docs/protocols/realtime-ws.md.
 * This is a stub implementation for Phase 6.
 */

import type { FastifyInstance } from 'fastify';

export async function wsRoutes(server: FastifyInstance) {
  /**
   * GET /ws - WebSocket endpoint
   */
  server.get('/ws', { websocket: true }, (socket, req) => {
    server.log.info('WebSocket client connected');

    // Send welcome message
    socket.send(
      JSON.stringify({
        type: 'welcome',
        protocolVersion: '1.0',
        serverVersion: '0.1.0',
        seatId: 'seat-mock-001',
        campaignId: 'campaign-mock-001',
      }),
    );

    socket.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());

        // Handle ping/pong
        if (data.type === 'ping') {
          socket.send(
            JSON.stringify({
              type: 'pong',
            }),
          );
        }

        // Handle resume
        if (data.type === 'resume') {
          server.log.info('Client resuming from event: %d', data.lastEventSeq);
          // Stub: In a real implementation, send event backlog or sync.initial
        }

        // Handle action dispatch
        if (data.type === 'action') {
          server.log.info('Received action: %s', JSON.stringify(data.payload));
          // Stub: In a real implementation, dispatch to GameEngine
        }
      } catch (err) {
        server.log.warn('Invalid WebSocket message received');
      }
    });

    socket.on('close', () => {
      server.log.info('WebSocket client disconnected');
    });
  });
}
