/**
 * Connection state management using Svelte 5 runes.
 * 
 * This module tracks the WebSocket connection status, protocol info,
 * and synchronization state with the server.
 */

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

/**
 * Connection state store.
 * 
 * Tracks WebSocket connection lifecycle and server protocol information.
 * Updated by the WebSocket client in the api/ layer.
 */
class ConnectionState {
  status = $state<ConnectionStatus>('disconnected');
  lastEventSeq = $state<number>(0);
  serverVersion = $state<string | null>(null);
  protocolVersion = $state<string | null>(null);
  seatId = $state<string | null>(null);
  reconnectAttempts = $state<number>(0);

  /**
   * Update connection status.
   */
  setStatus(status: ConnectionStatus) {
    this.status = status;
    if (status === 'connected') {
      this.reconnectAttempts = 0;
    }
  }

  /**
   * Handle welcome message from server.
   */
  handleWelcome(data: { version?: string; seatId?: string; campaignId?: string }) {
    this.serverVersion = data.version || null;
    this.seatId = data.seatId || null;
    this.status = 'connected';
    console.log('[ConnectionState] Welcome received', data);
  }

  /**
   * Update last received event sequence number.
   */
  updateLastEventSeq(seq: number) {
    this.lastEventSeq = seq;
  }

  /**
   * Increment reconnect attempts.
   */
  incrementReconnectAttempts() {
    this.reconnectAttempts += 1;
  }

  /**
   * Reset connection state (e.g., on logout).
   */
  reset() {
    this.status = 'disconnected';
    this.lastEventSeq = 0;
    this.serverVersion = null;
    this.protocolVersion = null;
    this.seatId = null;
    this.reconnectAttempts = 0;
  }
}

/**
 * Singleton connection state instance.
 */
export const connectionState = new ConnectionState();
