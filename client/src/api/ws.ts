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
// TODO: Uncomment when implementing full message handling
// import { campaignState } from '../state/campaign.svelte';
// import { eventLogState } from '../state/event-log.svelte';

/**
 * WebSocket message types (Server → Client).
 */
type ServerMessage =
  | {
      type: 'welcome';
      protocolVersion: string;
      serverVersion: string;
      seatId: string;
      campaignId: string;
    }
  | { type: 'sync.initial'; payload: unknown }
  | { type: 'sync.delta'; payload: unknown }
  | { type: 'event.new'; payload: unknown }
  | { type: 'prompt.create'; payload: unknown }
  | { type: 'prompt.cancel'; payload: unknown }
  | { type: 'workflow.update'; payload: unknown }
  | { type: 'token.move.preview'; payload: unknown }
  | { type: 'token.move.preview.end'; payload: unknown }
  | { type: 'pong' }
  | { type: 'error'; payload: { code: string; message: string } };

/**
 * WebSocket message types (Client → Server).
 */
type ClientMessage =
  | { type: 'resume'; lastEventSeq: number }
  | { type: 'action'; payload: unknown }
  | { type: 'workflow.input'; payload: unknown }
  | { type: 'token.move.preview'; payload: unknown }
  | { type: 'token.move'; payload: unknown }
  | { type: 'ping' };

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
   */
  connect(): void {
    if (
      this.ws?.readyState === WebSocket.OPEN ||
      this.ws?.readyState === WebSocket.CONNECTING
    ) {
      console.log('[WebSocketClient] Already connected or connecting');
      return;
    }

    console.log('[WebSocketClient] Connecting to', this.url);
    connectionState.setStatus('connecting');

    try {
      this.ws = new WebSocket(this.url);

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
      const message = JSON.parse(event.data) as ServerMessage;
      console.log('[WebSocketClient] Received message', message);

      this.dispatchMessage(message);
    } catch (error) {
      console.error(
        '[WebSocketClient] Failed to parse message:',
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

      case 'sync.initial':
        this.handleSyncInitial(message.payload);
        break;

      case 'sync.delta':
        this.handleSyncDelta(message.payload);
        break;

      case 'event.new':
        this.handleEventNew(message.payload);
        break;

      case 'prompt.create':
        this.handlePromptCreate(message.payload);
        break;

      case 'prompt.cancel':
        this.handlePromptCancel(message.payload);
        break;

      case 'workflow.update':
        this.handleWorkflowUpdate(message.payload);
        break;

      case 'token.move.preview':
        this.handleTokenMovePreview(message.payload);
        break;

      case 'token.move.preview.end':
        this.handleTokenMovePreviewEnd(message.payload);
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
   */
  private handleWelcome(message: {
    protocolVersion: string;
    serverVersion: string;
    seatId: string;
    campaignId: string;
  }): void {
    console.log('[WebSocketClient] Welcome received', message);
    connectionState.handleWelcome({
      version: message.serverVersion,
      seatId: message.seatId,
      campaignId: message.campaignId,
    });
  }

  /**
   * Handle initial sync message.
   */
  private handleSyncInitial(payload: unknown): void {
    console.log('[WebSocketClient] Initial sync - stub', payload);
    // TODO: Parse payload and update stores
    // campaignState.setInitialState(payload.campaignState);
    // eventLogState.appendEvents(payload.recentEvents);
  }

  /**
   * Handle sync delta message.
   */
  private handleSyncDelta(payload: unknown): void {
    console.log('[WebSocketClient] Sync delta - stub', payload);
    // TODO: Apply delta patch to campaign state
    // campaignState.applyDelta(payload.patch);
  }

  /**
   * Handle new event message.
   */
  private handleEventNew(payload: unknown): void {
    console.log('[WebSocketClient] Event new - stub', payload);
    // TODO: Add event to log
    // eventLogState.appendEvent(payload.record);
    // Update lastEventSeq
    // if (payload.record.seq) {
    //   connectionState.updateLastEventSeq(payload.record.seq);
    // }
  }

  /**
   * Handle prompt create message.
   */
  private handlePromptCreate(payload: unknown): void {
    console.log('[WebSocketClient] Prompt create - stub', payload);
    // TODO: Display prompt UI
  }

  /**
   * Handle prompt cancel message.
   */
  private handlePromptCancel(payload: unknown): void {
    console.log('[WebSocketClient] Prompt cancel - stub', payload);
    // TODO: Remove prompt from UI
  }

  /**
   * Handle workflow update message.
   */
  private handleWorkflowUpdate(payload: unknown): void {
    console.log('[WebSocketClient] Workflow update - stub', payload);
    // TODO: Update workflow state
  }

  /**
   * Handle token move preview message.
   */
  private handleTokenMovePreview(payload: unknown): void {
    console.log('[WebSocketClient] Token move preview - stub', payload);
    // TODO: Update renderer with ghost position
  }

  /**
   * Handle token move preview end message.
   */
  private handleTokenMovePreviewEnd(payload: unknown): void {
    console.log('[WebSocketClient] Token move preview end - stub', payload);
    // TODO: Clear ghost position from renderer
  }

  /**
   * Handle server error message.
   */
  private handleServerError(payload: { code: string; message: string }): void {
    console.error('[WebSocketClient] Server error:', payload);
    // TODO: Display error notification
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
