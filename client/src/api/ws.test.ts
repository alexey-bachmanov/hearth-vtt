/**
 * WebSocketClient error handling tests.
 *
 * Focuses on the ACTION_REJECTED error path: server sends an error message
 * and the client should push an ephemeral error toast via notificationState.
 *
 * Patterns:
 * - Mock global WebSocket to capture event listeners
 * - Spy on notificationState.error
 * - Simulate incoming server messages by firing MessageEvent on the mock WS
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { notificationState } from '../state/notifications.svelte';

// ---------------------------------------------------------------------------
// WebSocket mock
// ---------------------------------------------------------------------------

type WsEventListeners = {
  open?: () => void;
  message?: (e: { data: string }) => void;
  close?: (e: { code: number; reason: string }) => void;
  error?: (e: Event) => void;
};

function makeMockWs(): { ws: WsEventListeners & { readyState: number; close: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn> }; emit: (type: keyof WsEventListeners, data?: unknown) => void } {
  const listeners: WsEventListeners = {};
  const ws = {
    readyState: 1, // OPEN
    close: vi.fn(),
    send: vi.fn(),
    addEventListener(event: string, handler: (e: unknown) => void) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (listeners as any)[event] = handler;
    },
  };
  function emit(type: keyof WsEventListeners, data?: unknown) {
    const handler = listeners[type] as ((d: unknown) => void) | undefined;
    if (handler) handler(data);
  }
  return { ws: ws as ReturnType<typeof makeMockWs>['ws'], emit };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildErrorMessage(code: string, message: string): string {
  return JSON.stringify({ type: 'error', payload: { code, message } });
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let errorSpy: ReturnType<typeof vi.spyOn>;
let mockWsFactory: ReturnType<typeof makeMockWs>;

beforeEach(() => {
  errorSpy = vi.spyOn(notificationState, 'error');

  // Build a fresh mock WS before each test
  mockWsFactory = makeMockWs();
  // Must be a regular function (not arrow) for `new WebSocket()` to work
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function MockWS(this: unknown): any { return mockWsFactory.ws; }
  MockWS.OPEN = 1;
  MockWS.CONNECTING = 0;
  MockWS.CLOSING = 2;
  MockWS.CLOSED = 3;
  vi.stubGlobal('WebSocket', MockWS);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WebSocketClient ACTION_REJECTED error handling', () => {
  it('shows an ephemeral error toast when ACTION_REJECTED is received', async () => {
    // Import wsClient AFTER mocking WebSocket so the constructor gets the mock
    const { wsClient } = await import('./ws');

    wsClient.connect('mock-campaign-id', 'player');
    // Simulate the server sending an ACTION_REJECTED error
    mockWsFactory.emit('message', {
      data: buildErrorMessage('ACTION_REJECTED', 'dice.roll rejected: invalid formula'),
    });

    expect(errorSpy).toHaveBeenCalledWith(
      'dice.roll rejected: invalid formula',
      'ephemeral',
    );
    wsClient.disconnect();
  });

  it('shows an ephemeral error toast when DISPATCH_ERROR is received', async () => {
    const { wsClient } = await import('./ws');

    wsClient.connect('mock-campaign-id', 'player');
    mockWsFactory.emit('message', {
      data: buildErrorMessage('DISPATCH_ERROR', 'Server error during dispatch'),
    });

    expect(errorSpy).toHaveBeenCalledWith(
      'Server error during dispatch',
      'ephemeral',
    );
    wsClient.disconnect();
  });
});
