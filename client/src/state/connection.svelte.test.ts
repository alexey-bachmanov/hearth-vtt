import { describe, it, expect, beforeEach } from 'vitest';
import { connectionState } from './connection.svelte.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

beforeEach(() => {
  connectionState.reset();
});

// ---------------------------------------------------------------------------
// Initial state (after reset())
// ---------------------------------------------------------------------------

describe('reset()', () => {
  it('restores status to "disconnected"', () => {
    connectionState.setStatus('connected');
    connectionState.reset();
    expect(connectionState.status).toBe('disconnected');
  });

  it('restores lastEventSeq to 0', () => {
    connectionState.updateLastEventSeq(99);
    connectionState.reset();
    expect(connectionState.lastEventSeq).toBe(0);
  });

  it('restores serverVersion to null', () => {
    connectionState.handleWelcome({ version: '1.0.0' });
    connectionState.reset();
    expect(connectionState.serverVersion).toBeNull();
  });

  it('restores seatId to null', () => {
    connectionState.handleWelcome({ seatId: 'seat-abc' });
    connectionState.reset();
    expect(connectionState.seatId).toBeNull();
  });

  it('restores reconnectAttempts to 0', () => {
    connectionState.incrementReconnectAttempts();
    connectionState.incrementReconnectAttempts();
    connectionState.reset();
    expect(connectionState.reconnectAttempts).toBe(0);
  });
});

describe('initial state', () => {
  it('status is "disconnected"', () => {
    expect(connectionState.status).toBe('disconnected');
  });

  it('lastEventSeq is 0', () => {
    expect(connectionState.lastEventSeq).toBe(0);
  });

  it('serverVersion is null', () => {
    expect(connectionState.serverVersion).toBeNull();
  });

  it('seatId is null', () => {
    expect(connectionState.seatId).toBeNull();
  });

  it('reconnectAttempts is 0', () => {
    expect(connectionState.reconnectAttempts).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// setStatus()
// ---------------------------------------------------------------------------

describe('setStatus()', () => {
  it('setStatus("connecting") sets status to "connecting"', () => {
    connectionState.setStatus('connecting');
    expect(connectionState.status).toBe('connecting');
  });

  it('setStatus("connected") sets status to "connected"', () => {
    connectionState.setStatus('connected');
    expect(connectionState.status).toBe('connected');
  });

  it('setStatus("connected") resets reconnectAttempts to 0', () => {
    connectionState.setStatus('connected');
    expect(connectionState.reconnectAttempts).toBe(0);
  });

  it('setting reconnectAttempts to 3 then setStatus("connected") resets reconnectAttempts to 0', () => {
    connectionState.incrementReconnectAttempts();
    connectionState.incrementReconnectAttempts();
    connectionState.incrementReconnectAttempts();
    expect(connectionState.reconnectAttempts).toBe(3);
    connectionState.setStatus('connected');
    expect(connectionState.reconnectAttempts).toBe(0);
  });

  it('setStatus("reconnecting") does NOT reset reconnectAttempts', () => {
    connectionState.incrementReconnectAttempts();
    connectionState.incrementReconnectAttempts();
    connectionState.setStatus('reconnecting');
    expect(connectionState.reconnectAttempts).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// handleWelcome()
// ---------------------------------------------------------------------------

describe('handleWelcome()', () => {
  it('sets serverVersion and seatId and status to "connected"', () => {
    connectionState.handleWelcome({ version: '1.0.0', seatId: 'seat-abc' });
    expect(connectionState.serverVersion).toBe('1.0.0');
    expect(connectionState.seatId).toBe('seat-abc');
    expect(connectionState.status).toBe('connected');
  });

  it('sets serverVersion to null and seatId to null when fields are absent', () => {
    connectionState.handleWelcome({});
    expect(connectionState.serverVersion).toBeNull();
    expect(connectionState.seatId).toBeNull();
    expect(connectionState.status).toBe('connected');
  });

  it('does not throw when campaignId is present', () => {
    expect(() =>
      connectionState.handleWelcome({ version: '2.0.0', seatId: 'seat-1', campaignId: 'camp-1' }),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// incrementReconnectAttempts()
// ---------------------------------------------------------------------------

describe('incrementReconnectAttempts()', () => {
  it('increments reconnectAttempts by 1 each call', () => {
    connectionState.incrementReconnectAttempts();
    connectionState.incrementReconnectAttempts();
    connectionState.incrementReconnectAttempts();
    expect(connectionState.reconnectAttempts).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// updateLastEventSeq()
// ---------------------------------------------------------------------------

describe('updateLastEventSeq()', () => {
  it('sets lastEventSeq to the provided value', () => {
    connectionState.updateLastEventSeq(42);
    expect(connectionState.lastEventSeq).toBe(42);
  });
});
