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
import { clientMessageSchema, type ServerMessage } from '@hearth-vtt/shared';

export async function wsRoutes(server: FastifyInstance) {
  /**
   * GET /ws - WebSocket endpoint
   */
  server.get('/ws', { websocket: true }, (socket, _req) => {
    server.log.info('WebSocket client connected');

    // Send welcome message
    const welcome: ServerMessage = {
      type: 'welcome',
      protocolVersion: '1.0',
      serverVersion: '0.1.0',
      seatId: 'seat-mock-001',
      seatRole: 'player',
      campaignId: 'campaign-mock-001',
    };
    socket.send(JSON.stringify(welcome));

    socket.on('message', (raw) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.toString());
      } catch {
        server.log.warn('WebSocket message was not valid JSON');
        const err: ServerMessage = {
          type: 'error',
          payload: {
            code: 'INVALID_JSON',
            message: 'Message must be valid JSON',
          },
        };
        socket.send(JSON.stringify(err));
        return;
      }

      const result = clientMessageSchema.safeParse(parsed);
      if (!result.success) {
        server.log.warn('Invalid WebSocket message: %s', result.error.message);
        const err: ServerMessage = {
          type: 'error',
          payload: {
            code: 'INVALID_MESSAGE',
            message: 'Unrecognised message type or shape',
          },
        };
        socket.send(JSON.stringify(err));
        return;
      }

      const message = result.data;

      if (message.type === 'ping') {
        const pong: ServerMessage = { type: 'pong' };
        socket.send(JSON.stringify(pong));
      }

      if (message.type === 'resume') {
        server.log.info('Client resuming from event: %d', message.lastEventSeq);
        // Stub: In a real implementation, send event backlog or sync.initial
      }

      if (message.type === 'action') {
        server.log.info('Received action: %s', JSON.stringify(message.payload));
        // Stub: In a real implementation, dispatch to GameEngine
      }
    });

    socket.on('close', () => {
      server.log.info('WebSocket client disconnected');
    });
  });
}
