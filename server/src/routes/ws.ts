/**
 * WebSocket endpoint for realtime communication.
 *
 * Routes:
 * - GET /ws?campaign=<campaignId> - WebSocket upgrade endpoint
 *
 * On upgrade, the handler resolves (authPrincipal, campaignId) → seatId via
 * storage. In non-production environments a dev-bypass falls back to
 * hardcoded mock identifiers when no valid auth session exists, so the
 * client can connect without a full auth stack during development.
 *
 * Implements the realtime protocol defined in docs/protocols/realtime-ws.md.
 */

import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { clientMessageSchema, type ServerMessage } from '@hearth-vtt/shared';
import type { Storage } from '../storage/index.js';

// ── Dev-bypass fallback identifiers ──────────────────────────────────────────

const DEV_CAMPAIGN_ID = 'campaign-mock-001';
const DEV_SEAT_ID = 'seat-mock-001';
const DEV_SEAT_ROLE = 'player' as const;

// ── Auth resolution ───────────────────────────────────────────────────────────

interface ResolvedConnection {
  campaignId: string;
  seatId: string;
  seatRole: 'gm' | 'player' | 'spectator';
}

/**
 * Attempts to resolve a seat from the refresh-token cookie and the requested
 * campaignId.
 *
 * Returns `null` if the cookie is absent, the session is not found / revoked /
 * expired, or the seat does not belong to the requested campaign.
 */
async function resolveAuthSession(
  req: FastifyRequest,
  campaignId: string,
  storage: Storage,
): Promise<ResolvedConnection | null> {
  const refreshToken = req.cookies['hearth_refresh'];
  if (!refreshToken) return null;

  // Tokens are stored as SHA-256 hashes — hash before lookup.
  const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
  const session = await storage.getAuthSession(tokenHash);

  if (
    !session ||
    session.revokedAt !== null ||
    session.expiresAt < Date.now()
  ) {
    return null;
  }

  // Verify the session's seat belongs to the requested campaign and is active.
  const seat = await storage.getSeat(campaignId, session.seatId);
  if (!seat || !seat.isActive) return null;

  return { campaignId, seatId: seat.id, seatRole: seat.role };
}

// ── Route registration ────────────────────────────────────────────────────────

export async function wsRoutes(
  server: FastifyInstance,
  options: { storage: Storage },
) {
  /**
   * GET /ws?campaign=<campaignId> - WebSocket upgrade endpoint
   *
   * Query params:
   *   campaign — the campaign ID to connect to (required in production)
   *
   * In production, a valid `hearth_refresh` cookie is required. The cookie is
   * resolved to a seat via storage; the seat must belong to the requested
   * campaign and be active.
   *
   * In development (NODE_ENV !== 'production'), missing or invalid auth falls
   * back to the hardcoded mock seat so the client can connect without a full
   * auth stack.
   */
  server.get('/ws', { websocket: true }, async (socket, req) => {
    const query = req.query as Record<string, string | undefined>;
    const campaignIdParam = query['campaign'];
    const isProduction = process.env.NODE_ENV === 'production';

    let connection: ResolvedConnection;

    if (campaignIdParam) {
      const resolved = await resolveAuthSession(
        req,
        campaignIdParam,
        options.storage,
      );
      if (resolved) {
        connection = resolved;
      } else if (!isProduction) {
        // Dev-bypass: use mock seat but honour the provided campaignId so
        // integration tests can target a real campaign.
        connection = {
          campaignId: campaignIdParam,
          seatId: DEV_SEAT_ID,
          seatRole: DEV_SEAT_ROLE,
        };
      } else {
        socket.close(4001, 'Unauthorized');
        return;
      }
    } else if (!isProduction) {
      // Dev-bypass: no campaign param — use fully hardcoded mock connection.
      connection = {
        campaignId: DEV_CAMPAIGN_ID,
        seatId: DEV_SEAT_ID,
        seatRole: DEV_SEAT_ROLE,
      };
    } else {
      socket.close(4400, 'Missing campaign query parameter');
      return;
    }

    server.log.info(
      'WebSocket client connected — campaign=%s seat=%s',
      connection.campaignId,
      connection.seatId,
    );

    // Send welcome message
    const welcome: ServerMessage = {
      type: 'welcome',
      protocolVersion: '1.0',
      serverVersion: '0.1.0',
      seatId: connection.seatId,
      seatRole: connection.seatRole,
      campaignId: connection.campaignId,
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
