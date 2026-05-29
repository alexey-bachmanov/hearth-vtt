/**
 * WebSocket Client for HearthVTT realtime protocol.
 *
 * Manages the WebSocket Secure (WSS) connection lifecycle based on
 * docs/protocols/realtime-ws.md.
 *
 * Responsibilities:
 * - Connect to /ws with session cookie authentication
 * - Handle welcome and initial sync messages
 * - Ping/pong keepalive
 * - Exponential backoff reconnection
 * - Resume with lastEventSeq after reconnect
 * - Dispatch messages to appropriate stores
 *
 * Note: This is a stub implementation. Full message handling and
 * store integration will be implemented in future phases.
 */

import { connectionState } from '../state/connection.svelte';
import { campaignState } from '../state/campaign.svelte';
import { notificationState } from '../state/notifications.svelte';
import {
  serverMessageSchema,
  type ServerMessage,
  type ClientMessage,
  type ViewMessage,
  type WireEvent,
  type EngineInput,
  type GameEvent as SharedGameEvent,
} from '@hearth-vtt/shared';

/**
 * WebSocket client for realtime communication.
 *
 * Handles connection lifecycle, reconnection, and message dispatching.
 */
export class WebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectTimeout: number | null = null;
  private pingInterval: number | null = null;
  private reconnectDelay = 1000; // Start at 1 second
  private maxReconnectDelay = 30000; // Max 30 seconds
  private pingIntervalMs = 30000; // Ping every 30 seconds
  private url: string;
  private shouldReconnect = true;
  /** Campaign ID appended as `?campaign=<id>` on each connect. */
  private campaignId: string | null = null;
  /**
   * Seat ID appended as `&seat=<id>` when present.
   *
   * DEV HACK: forwarded so the server WS dev-bypass can resolve a specific
   * seeded seat. Remove after Phase 5 (real player auth).
   */
  private seatId: string | null = null;

  constructor(url = '/ws') {
    // Convert relative URL to absolute wss:// or ws://
    if (url.startsWith('/')) {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      this.url = `${protocol}//${host}${url}`;
    } else {
      this.url = url;
    }
  }

  /**
   * Connect to the WebSocket server.
   *
   * Initiates connection, sets up event handlers, and starts keepalive.
   *
   * @param campaignId - Campaign to join. Appended as `?campaign=<id>`.
   *   Persisted so reconnects re-join the same campaign automatically.
   * @param seatId - (dev only) Seat to bypass auth with. Appended as
   *   `&seat=<id>` when present. Remove after Phase 5.
   */
  connect(campaignId?: string, seatId?: string): void {
    if (campaignId) {
      this.campaignId = campaignId;
    }
    // DEV HACK: persist seatId for reconnects. Remove after Phase 5.
    if (seatId !== undefined) {
      this.seatId = seatId;
    }

    if (
      this.ws?.readyState === WebSocket.OPEN ||
      this.ws?.readyState === WebSocket.CONNECTING
    ) {
      console.log('[WebSocketClient] Already connected or connecting');
      return;
    }

    let connectUrl = this.campaignId
      ? `${this.url}?campaign=${encodeURIComponent(this.campaignId)}`
      : this.url;
    // DEV HACK: append ?seat= for server dev-bypass. Remove after Phase 5.
    if (this.seatId) {
      connectUrl += `&seat=${encodeURIComponent(this.seatId)}`;
    }

    console.log('[WebSocketClient] Connecting to', connectUrl);
    connectionState.setStatus('connecting');

    try {
      this.ws = new WebSocket(connectUrl);

      this.ws.addEventListener('open', this.handleOpen.bind(this));
      this.ws.addEventListener('message', this.handleMessage.bind(this));
      this.ws.addEventListener('close', this.handleClose.bind(this));
      this.ws.addEventListener('error', this.handleError.bind(this));
    } catch (error) {
      console.error('[WebSocketClient] Connection failed:', error);
      this.scheduleReconnect();
    }
  }

  /**
   * Disconnect from the WebSocket server.
   *
   * Closes connection gracefully and stops reconnection attempts.
   */
  disconnect(): void {
    console.log('[WebSocketClient] Disconnecting');
    this.shouldReconnect = false;
    this.stopPingInterval();
    this.clearReconnectTimeout();

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    connectionState.setStatus('disconnected');
  }

  /**
   * Send a message to the server.
   *
   * @param message - Message to send
   */
  send(message: ClientMessage): void {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      console.warn(
        '[WebSocketClient] Cannot send message: not connected',
        message,
      );
      return;
    }

    console.log('[WebSocketClient] Sending message', message);
    this.ws.send(JSON.stringify(message));
  }

  /**
   * Dispatch an engine action to the server.
   *
   * The server overrides `seatId` and `campaignId` from the authenticated
   * session, so the values from connection state are sent as hints only.
   *
   * @param actionType - Ruleset-defined action type token (e.g. `'token.move'`)
   * @param payload    - Action-specific payload (validated by the ruleset)
   * @returns The `clientRequestId` sent with the action (for correlation)
   */
  dispatch(actionType: EngineInput['actionType'], payload: unknown): string {
    const clientRequestId = `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    this.send({
      type: 'dispatch',
      input: {
        seatId: connectionState.seatId ?? '',
        campaignId: connectionState.campaignId ?? '',
        actionType,
        payload,
        clientRequestId,
      },
    });
    return clientRequestId;
  }

  /**
   * Handle WebSocket open event.
   */
  private handleOpen(): void {
    console.log('[WebSocketClient] Connection opened');
    this.reconnectDelay = 1000; // Reset backoff
    this.startPingInterval();

    // If we have a lastEventSeq, send resume message
    if (connectionState.lastEventSeq > 0) {
      console.log(
        '[WebSocketClient] Resuming from event',
        connectionState.lastEventSeq,
      );
      this.send({ type: 'resume', lastEventSeq: connectionState.lastEventSeq });
    }
  }

  /**
   * Handle incoming WebSocket message.
   */
  private handleMessage(event: MessageEvent): void {
    try {
      const raw: unknown = JSON.parse(event.data as string);
      const message = serverMessageSchema.parse(raw);
      console.log('[WebSocketClient] Received message', message);
      this.dispatchMessage(message);
    } catch (error) {
      console.error(
        '[WebSocketClient] Failed to parse/validate message:',
        error,
        event.data,
      );
    }
  }

  /**
   * Dispatch message to appropriate handler.
   */
  private dispatchMessage(message: ServerMessage): void {
    switch (message.type) {
      case 'welcome':
        this.handleWelcome(message);
        break;

      case 'view':
        this.handleView(message as ViewMessage);
        break;

      case 'event':
        this.handleEvent(message.event);
        break;

      case 'pong':
        console.log('[WebSocketClient] Pong received');
        break;

      case 'error':
        this.handleServerError(message.payload);
        break;

      default:
        console.warn('[WebSocketClient] Unknown message type:', message);
    }
  }

  /**
   * Handle welcome message from server.
   *
   * Updates connection state, then immediately requests a full SeatView so
   * the campaign state is populated from real server data rather than mock
   * defaults.
   */
  private handleWelcome(
    message: Extract<ServerMessage, { type: 'welcome' }>,
  ): void {
    console.log('[WebSocketClient] Welcome received', message);
    connectionState.handleWelcome({
      version: message.serverVersion,
      seatId: message.seatId,
      seatRole: message.seatRole,
      campaignId: message.campaignId,
    });
    // Request the initial SeatView. The server only sends view on explicit
    // request (or resume); this ensures campaign state is populated from real
    // data on every fresh connect.
    this.send({ type: 'view.request' });
  }

  /**
   * Handle a full SeatView snapshot from the server.
   *
   * Received on initial connect, after a seq gap resync, or on explicit
   * `view.request`. Applies the snapshot to campaign state and updates
   * `lastSeq`.
   */
  private handleView(message: ViewMessage): void {
    campaignState.applyView(message.view);
    connectionState.updateLastEventSeq(message.view.lastSeq);
  }

  /**
   * Handle a WireEvent from the server.
   *
   * Advances `lastSeq`, detects gaps (requesting a resync), and applies
   * full events to campaign state. Redacted events advance the counter only.
   */
  private handleEvent(wireEvent: WireEvent): void {
    const seq = wireEvent.kind === 'full' ? wireEvent.event.seq : wireEvent.seq;

    // Detect a gap in the sequence; a missing event means we may be out of
    // sync. Request a full view resync and discard this event.
    const expected = connectionState.lastEventSeq + 1;
    if (connectionState.lastEventSeq > 0 && seq > expected) {
      console.warn(
        `[WebSocketClient] Seq gap: expected ${expected}, got ${seq}. Requesting view resync.`,
      );
      this.send({ type: 'view.request' });
      return;
    }

    connectionState.updateLastEventSeq(seq);

    if (wireEvent.kind === 'full') {
      // Safe assertion: the event is Zod-validated on receipt; `data` is
      // present at runtime even though Zod infers it as optional (`z.unknown()`).
      campaignState.applyEvent(wireEvent.event as SharedGameEvent);
    }
    // Redacted events: seq is advanced above; nothing else to do.
  }

  /**
   * Handle server error message.
   */
  private handleServerError(payload: { code: string; message: string }): void {
    console.error('[WebSocketClient] Server error:', payload);

    if (
      payload.code === 'ACTION_REJECTED' ||
      payload.code === 'DISPATCH_ERROR'
    ) {
      // Snap back any pending optimistic token moves.
      campaignState.revertOptimisticMoves();
    }

    notificationState.error(payload.message);
  }

  /**
   * Handle WebSocket close event.
   */
  private handleClose(event: CloseEvent): void {
    console.log(
      '[WebSocketClient] Connection closed',
      event.code,
      event.reason,
    );
    this.stopPingInterval();

    // Check if we should reconnect
    if (this.shouldReconnect) {
      // App-level close codes (4xxx) may indicate auth failure
      if (event.code >= 4000 && event.code < 5000) {
        console.error(
          '[WebSocketClient] Auth failure, not reconnecting:',
          event.code,
        );
        connectionState.setStatus('disconnected');
        // TODO: Redirect to login or show auth error
      } else {
        connectionState.setStatus('reconnecting');
        this.scheduleReconnect();
      }
    } else {
      connectionState.setStatus('disconnected');
    }
  }

  /**
   * Handle WebSocket error event.
   */
  private handleError(event: Event): void {
    console.error('[WebSocketClient] WebSocket error:', event);
    // Errors are followed by close event, so we handle reconnect there
  }

  /**
   * Schedule reconnection with exponential backoff.
   */
  private scheduleReconnect(): void {
    this.clearReconnectTimeout();

    connectionState.incrementReconnectAttempts();

    console.log(
      `[WebSocketClient] Reconnecting in ${this.reconnectDelay}ms (attempt ${connectionState.reconnectAttempts})`,
    );

    this.reconnectTimeout = window.setTimeout(() => {
      this.connect();
    }, this.reconnectDelay);

    // Exponential backoff with max limit
    this.reconnectDelay = Math.min(
      this.reconnectDelay * 2,
      this.maxReconnectDelay,
    );
  }

  /**
   * Clear reconnect timeout.
   */
  private clearReconnectTimeout(): void {
    if (this.reconnectTimeout !== null) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  /**
   * Start ping interval for keepalive.
   */
  private startPingInterval(): void {
    this.stopPingInterval();

    this.pingInterval = window.setInterval(() => {
      this.send({ type: 'ping' });
    }, this.pingIntervalMs);
  }

  /**
   * Stop ping interval.
   */
  private stopPingInterval(): void {
    if (this.pingInterval !== null) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
}

/**
 * Singleton WebSocket client instance.
 */
export const wsClient = new WebSocketClient();
