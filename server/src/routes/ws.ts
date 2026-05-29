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
import {
  clientMessageSchema,
  type ServerMessage,
  type ViewMessage,
} from '@hearth-vtt/shared';
import type { Storage } from '../storage/index.js';
import type { CampaignManager } from '../domain/engine/index.js';

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

  // Resolve seat: find the active seat for this account in the requested campaign.
  // Auth sessions are account-scoped (ADR-010); seatId is derived via account_id FK on seats.
  const seats = await storage.listSeats(campaignId);
  const seat = seats.find(
    (s) => s.accountId === session.accountId && s.isActive,
  );
  if (!seat) return null;

  return { campaignId, seatId: seat.id, seatRole: seat.role };
}

// ── Route registration ────────────────────────────────────────────────────────

export async function wsRoutes(
  server: FastifyInstance,
  options: { storage: Storage; campaignManager: CampaignManager },
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

    // ── Acquire engine ────────────────────────────────────────────────────

    let engine;
    try {
      engine = await options.campaignManager.acquire(connection.campaignId);
    } catch (err) {
      server.log.error(
        { err },
        'Failed to open engine for campaign=%s',
        connection.campaignId,
      );
      socket.close(4500, 'Engine unavailable');
      return;
    }

    server.log.info(
      'WebSocket client connected — campaign=%s seat=%s',
      connection.campaignId,
      connection.seatId,
    );

    // ── Subscribe to per-seat event stream ────────────────────────────────
    //
    // Listener is synchronous by contract (GameEngine.subscribe spec).
    // Guard with readyState so we don't write to a socket that is closing.

    const unsubscribe = engine.subscribe(connection.seatId, (event) => {
      if (socket.readyState === socket.OPEN) {
        const msg: ServerMessage = { type: 'event', event };
        socket.send(JSON.stringify(msg));
      }
    });

    // ── Send welcome ──────────────────────────────────────────────────────

    const welcome: ServerMessage = {
      type: 'welcome',
      protocolVersion: '1.0',
      serverVersion: '0.1.0',
      seatId: connection.seatId,
      seatRole: connection.seatRole,
      campaignId: connection.campaignId,
    };
    socket.send(JSON.stringify(welcome));

    // ── Per-connection clientRequestId dedup ──────────────────────────────
    //
    // Scoped to this WS connection; not durable across reconnects.
    // Prevents double-dispatch when a client retries on the same socket.

    const seenRequestIds = new Set<string>();

    // ── Message handler ───────────────────────────────────────────────────

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
        return;
      }

      if (message.type === 'view.request' || message.type === 'resume') {
        // Both result in a full SeatView being sent.
        // For 'resume', a future optimisation could send only events since
        // lastEventSeq from the engine's recentEvents window. For now we
        // always send the full view.
        if (message.type === 'resume') {
          server.log.info(
            'Client resume from seq=%d — sending full view',
            message.lastEventSeq,
          );
        }
        const view = engine.getView(connection.seatId);
        const msg: ViewMessage = { type: 'view', view };
        socket.send(JSON.stringify(msg));
        return;
      }

      if (message.type === 'dispatch') {
        // Dedup: silently ignore retried clientRequestIds on the same connection.
        const { clientRequestId } = message.input;
        if (clientRequestId !== undefined) {
          if (seenRequestIds.has(clientRequestId)) {
            server.log.warn(
              'Duplicate clientRequestId=%s ignored',
              clientRequestId,
            );
            return;
          }
          seenRequestIds.add(clientRequestId);
        }

        // Override client-supplied seatId/campaignId with server-resolved values.
        // This enforces the transport→engine boundary: engine never sees auth.
        const engineInput = {
          ...message.input,
          seatId: connection.seatId,
          campaignId: connection.campaignId,
        };

        void engine
          .dispatch(engineInput)
          .then((dispatchResult) => {
            if (!dispatchResult.accepted && socket.readyState === socket.OPEN) {
              const err: ServerMessage = {
                type: 'error',
                payload: {
                  code: 'ACTION_REJECTED',
                  message: dispatchResult.reason,
                },
              };
              socket.send(JSON.stringify(err));
            }
            // Accepted: event is broadcast to all seat subscribers by the
            // engine's append-before-broadcast step; no separate ack needed.
          })
          .catch((err) => {
            server.log.error({ err }, 'engine.dispatch threw unexpectedly');
            if (socket.readyState === socket.OPEN) {
              const errMsg: ServerMessage = {
                type: 'error',
                payload: {
                  code: 'DISPATCH_ERROR',
                  message: 'Internal error processing action',
                },
              };
              socket.send(JSON.stringify(errMsg));
            }
          });

        return;
      }
    });

    // ── Close handler ─────────────────────────────────────────────────────

    socket.on('close', () => {
      unsubscribe();
      options.campaignManager.release(connection.campaignId);
      server.log.info(
        'WebSocket client disconnected — campaign=%s seat=%s',
        connection.campaignId,
        connection.seatId,
      );
    });
  });
}
