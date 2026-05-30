/**
 * WebSocket route integration tests.
 *
 * These tests exercise the WS endpoint using a real HTTP server, real WebSocket
 * connections, and InMemoryBackend — no mocks.
 *
 * Topics covered:
 *   • Connection authentication via real AuthSession records
 *   • Welcome message shape after successful connect
 *   • clientRequestId idempotency (duplicate dispatch suppressed)
 *   • Dispatch → event broadcast round-trip over WS
 *   • Connection rejected when no valid session and NODE_ENV=production
 *
 * Design notes:
 *   - We set NODE_ENV=development so findClientDist() returns null without error.
 *   - Auth sessions are created in InMemoryBackend directly; the dev-bypass is
 *     NOT used because valid auth is provided on every connection.
 *   - Each test suite starts its own server on a random port and tears it down
 *     with afterAll.
 */

// Must appear before any import that reads process.env.NODE_ENV.
process.env.NODE_ENV = 'development';
process.env.COOKIE_SECRET =
  'test-cookie-secret-value-must-be-at-least-32-chars';
process.env.ADMIN_ALLOW_REMOTE = 'true';

import { createHash } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import WebSocket from 'ws';
import type { FastifyInstance } from 'fastify';
import { Storage, InMemoryBackend } from '../storage/index.js';
import { buildServer } from '../server.js';
import type { ServerMessage } from '@hearth-vtt/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Hash a plain refresh token the same way the WS route does. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Build and start a test server; returns { server, storage, port }. */
async function startTestServer(): Promise<{
  server: FastifyInstance;
  storage: Storage;
  port: number;
}> {
  const storage = new Storage(new InMemoryBackend());
  await storage.init();
  const server = await buildServer({
    dataDir: '/tmp',
    storage,
    logger: false,
  });
  await server.listen({ port: 0, host: '127.0.0.1' });
  const port = (server.server.address() as AddressInfo).port;
  return { server, storage, port };
}

interface TestCredentials {
  campaignId: string;
  seatId: string;
  refreshToken: string;
}

/** Create a campaign, seat, player account, and live auth session in storage. */
async function seedSession(
  storage: Storage,
  role: 'gm' | 'player' | 'spectator' = 'gm',
): Promise<TestCredentials> {
  const campaign = await storage.createCampaign('WS Test Campaign');
  const seat = await storage.createSeat({
    campaignId: campaign.id,
    displayName: role === 'gm' ? 'Game Master' : 'Player One',
    role,
  });

  const account = await storage.createPlayerAccount({
    username: `player-${seat.id}`,
    passwordHash: 'test-hash',
  });

  // Bind the seat to the account so the WS resolver can find it.
  await storage.updateSeat(campaign.id, seat.id, { accountId: account.id });

  const refreshToken = `test-refresh-${role}-${seat.id}`;
  await storage.createAuthSession({
    accountId: account.id,
    refreshTokenHash: hashToken(refreshToken),
    accessTokenHash: hashToken(`access-${refreshToken}`),
    expiresAt: Date.now() + 60 * 60 * 1000, // 1 hour
    csrfToken: 'test-csrf-token',
  });

  return { campaignId: campaign.id, seatId: seat.id, refreshToken };
}

/**
 * Open a WebSocket connection to the test server with the given credentials.
 * Returns the socket and a promise that resolves once the 'welcome' message arrives.
 */
function openWsConnection(
  port: number,
  creds: TestCredentials,
): {
  ws: WebSocket;
  welcomed: Promise<ServerMessage & { type: 'welcome' }>;
  messages: ServerMessage[];
} {
  const messages: ServerMessage[] = [];
  let resolveWelcome!: (msg: ServerMessage & { type: 'welcome' }) => void;
  const welcomed = new Promise<ServerMessage & { type: 'welcome' }>(
    (res) => (resolveWelcome = res),
  );

  const ws = new WebSocket(
    `ws://127.0.0.1:${port}/ws?campaign=${creds.campaignId}`,
    { headers: { Cookie: `hearth_refresh=${creds.refreshToken}` } },
  );

  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString()) as ServerMessage;
    messages.push(msg);
    if (msg.type === 'welcome') {
      resolveWelcome(msg as ServerMessage & { type: 'welcome' });
    }
  });

  return { ws, welcomed, messages };
}

/** Wait for the next message of a specific type on the socket. */
function waitForMessage(
  ws: WebSocket,
  type: string,
  timeoutMs = 2000,
): Promise<ServerMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timeout waiting for message type="${type}"`)),
      timeoutMs,
    );
    const handler = (raw: Buffer | string) => {
      const msg = JSON.parse(raw.toString()) as ServerMessage;
      if (msg.type === type) {
        clearTimeout(timer);
        ws.off('message', handler);
        resolve(msg);
      }
    };
    ws.on('message', handler);
  });
}

/** Close a WebSocket and wait for the close event. */
function closeWs(ws: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    if (ws.readyState === WebSocket.CLOSED) {
      resolve();
      return;
    }
    ws.on('close', () => resolve());
    ws.close();
  });
}

// ---------------------------------------------------------------------------
// Connection and welcome
// ---------------------------------------------------------------------------

describe('WS route — connection and welcome', () => {
  let server: FastifyInstance;
  let storage: Storage;
  let port: number;

  beforeAll(async () => {
    ({ server, storage, port } = await startTestServer());
  });

  afterAll(async () => {
    await server.close();
    storage.close();
  });

  it('sends a welcome message containing seatId, seatRole, and campaignId', async () => {
    const creds = await seedSession(storage, 'gm');
    const { ws, welcomed } = openWsConnection(port, creds);

    const welcome = await welcomed;

    expect(welcome.type).toBe('welcome');
    expect(welcome.seatId).toBe(creds.seatId);
    expect(welcome.campaignId).toBe(creds.campaignId);
    expect(welcome.seatRole).toBe('gm');
    expect(welcome.protocolVersion).toBeDefined();

    await closeWs(ws);
  });

  it('closes with code 4001 when no valid session exists (production auth)', async () => {
    // Temporarily switch to production to test the hard auth rejection.
    const original = process.env.NODE_ENV;
    const originalBaseUrl = process.env.PUBLIC_BASE_URL;
    process.env.NODE_ENV = 'production';
    process.env.PUBLIC_BASE_URL = `http://127.0.0.1:${port}`;

    try {
      const campaign = await storage.createCampaign('Unauthenticated');
      const closeCode = await new Promise<number>((resolve) => {
        const ws = new WebSocket(
          `ws://127.0.0.1:${port}/ws?campaign=${campaign.id}`,
          // No cookie provided.
          { headers: { Origin: `http://127.0.0.1:${port}` } },
        );
        ws.on('close', (code) => resolve(code));
        ws.on('error', () => resolve(-1));
      });
      expect(closeCode).toBe(4001);
    } finally {
      process.env.NODE_ENV = original;
      process.env.PUBLIC_BASE_URL = originalBaseUrl;
    }
  });
});

// ---------------------------------------------------------------------------
// clientRequestId idempotency
// ---------------------------------------------------------------------------

describe('WS route — clientRequestId idempotency', () => {
  let server: FastifyInstance;
  let storage: Storage;
  let port: number;

  beforeAll(async () => {
    ({ server, storage, port } = await startTestServer());
  });

  afterAll(async () => {
    await server.close();
    storage.close();
  });

  it('duplicate clientRequestId on the same connection is silently ignored', async () => {
    const creds = await seedSession(storage, 'gm');

    // Create a scene so the engine can open the campaign.
    await storage.createEntity(creds.campaignId, 'scene', {
      name: 'Test Scene',
      background: { kind: 'color', color: '#000' },
      gridType: 'square',
      gridSize: 50,
      gridScale: '5ft',
      width: 1000,
      height: 1000,
    });

    const { ws, welcomed, messages } = openWsConnection(port, creds);
    await welcomed;

    const requestId = 'idempotency-test-request-001';

    // Send the same clientRequestId twice.
    const dispatchMsg = JSON.stringify({
      type: 'dispatch',
      input: {
        seatId: creds.seatId,
        campaignId: creds.campaignId,
        actionType: 'chat.send',
        payload: { text: 'Hello (idempotency test)' },
        clientRequestId: requestId,
      },
    });

    ws.send(dispatchMsg);
    ws.send(dispatchMsg);

    // Wait briefly for any events to arrive.
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Filter to event messages only (exclude welcome and view messages).
    const eventMsgs = messages.filter((m) => m.type === 'event');

    // Only one event should be dispatched; the duplicate should be silently dropped.
    expect(eventMsgs).toHaveLength(1);

    await closeWs(ws);
  });

  it('same clientRequestId on a NEW connection is NOT deduplicated (dedup is per-connection)', async () => {
    const creds = await seedSession(storage, 'gm');

    await storage.createEntity(creds.campaignId, 'scene', {
      name: 'Scene 2',
      background: { kind: 'color', color: '#111' },
      gridType: 'square',
      gridSize: 50,
      gridScale: '5ft',
      width: 1000,
      height: 1000,
    });

    const requestId = 'cross-connection-request-002';

    // First connection: dispatch with requestId.
    const { ws: ws1, welcomed: w1 } = openWsConnection(port, creds);
    await w1;
    ws1.send(
      JSON.stringify({
        type: 'dispatch',
        input: {
          seatId: creds.seatId,
          campaignId: creds.campaignId,
          actionType: 'chat.send',
          payload: { text: 'First connection' },
          clientRequestId: requestId,
        },
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    await closeWs(ws1);

    // Second connection: same requestId — should NOT be deduplicated since it's a fresh connection.
    const {
      ws: ws2,
      welcomed: w2,
      messages: msgs2,
    } = openWsConnection(port, creds);
    await w2;
    ws2.send(
      JSON.stringify({
        type: 'dispatch',
        input: {
          seatId: creds.seatId,
          campaignId: creds.campaignId,
          actionType: 'chat.send',
          payload: { text: 'Second connection' },
          clientRequestId: requestId,
        },
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 100));

    const eventMsgs = msgs2.filter((m) => m.type === 'event');
    expect(eventMsgs).toHaveLength(1); // accepted on the new connection

    await closeWs(ws2);
  });
});

// ---------------------------------------------------------------------------
// Dispatch → event broadcast over WS
// ---------------------------------------------------------------------------

describe('WS route — dispatch and event broadcast', () => {
  let server: FastifyInstance;
  let storage: Storage;
  let port: number;

  beforeAll(async () => {
    ({ server, storage, port } = await startTestServer());
  });

  afterAll(async () => {
    await server.close();
    storage.close();
  });

  it('chat.send dispatch delivers an event message to the sender', async () => {
    const creds = await seedSession(storage, 'gm');

    await storage.createEntity(creds.campaignId, 'scene', {
      name: 'Broadcast Scene',
      background: { kind: 'color', color: '#222' },
      gridType: 'square',
      gridSize: 50,
      gridScale: '5ft',
      width: 1000,
      height: 1000,
    });

    const { ws, welcomed } = openWsConnection(port, creds);
    await welcomed;

    ws.send(
      JSON.stringify({
        type: 'dispatch',
        input: {
          seatId: creds.seatId,
          campaignId: creds.campaignId,
          actionType: 'chat.send',
          payload: { text: 'WS broadcast test' },
        },
      }),
    );

    const eventMsg = await waitForMessage(ws, 'event');
    expect(eventMsg.type).toBe('event');
    const em = eventMsg as {
      type: 'event';
      event: { kind: string; event?: { type: string; data: { text: string } } };
    };
    expect(em.event.kind).toBe('full');
    expect(em.event.event!.type).toBe('chat.message');
    expect(em.event.event!.data.text).toBe('WS broadcast test');

    await closeWs(ws);
  });

  it('rejected dispatch sends an ACTION_REJECTED error message', async () => {
    const creds = await seedSession(storage, 'player');

    await storage.createEntity(creds.campaignId, 'scene', {
      name: 'Reject Scene',
      background: { kind: 'color', color: '#333' },
      gridType: 'square',
      gridSize: 50,
      gridScale: '5ft',
      width: 1000,
      height: 1000,
    });

    const { ws, welcomed } = openWsConnection(port, creds);
    await welcomed;

    // player tries to move a token they don't control.
    ws.send(
      JSON.stringify({
        type: 'dispatch',
        input: {
          seatId: creds.seatId,
          campaignId: creds.campaignId,
          actionType: 'token.move',
          payload: { tokenId: 'nonexistent-token', position: { x: 0, y: 0 } },
        },
      }),
    );

    const errMsg = await waitForMessage(ws, 'error');
    const em = errMsg as { type: 'error'; payload: { code: string } };
    expect(em.payload.code).toBe('ACTION_REJECTED');

    await closeWs(ws);
  });

  it('view.request returns a view message', async () => {
    const creds = await seedSession(storage, 'gm');

    await storage.createEntity(creds.campaignId, 'scene', {
      name: 'View Scene',
      background: { kind: 'color', color: '#444' },
      gridType: 'square',
      gridSize: 50,
      gridScale: '5ft',
      width: 1000,
      height: 1000,
    });

    const { ws, welcomed } = openWsConnection(port, creds);
    await welcomed;

    ws.send(JSON.stringify({ type: 'view.request' }));

    const viewMsg = await waitForMessage(ws, 'view');
    const vm = viewMsg as {
      type: 'view';
      view: { seatId: string; campaignId: string };
    };
    expect(vm.view.seatId).toBe(creds.seatId);
    expect(vm.view.campaignId).toBe(creds.campaignId);

    await closeWs(ws);
  });
});

// ---------------------------------------------------------------------------
// C4 — dev-only ?seat= override
// ---------------------------------------------------------------------------

describe('WS route — ?seat= dev override', () => {
  let server: FastifyInstance;
  let storage: Storage;
  let port: number;

  beforeAll(async () => {
    ({ server, storage, port } = await startTestServer());
  });

  afterAll(async () => {
    await server.close();
    storage.close();
  });

  /**
   * Open a WS connection in dev mode (no auth cookie) with an optional ?seat= param.
   * Returns the welcomed promise; resolves as soon as the welcome message arrives.
   */
  function openDevConnection(
    campaignId: string,
    seatId?: string,
  ): { ws: WebSocket; welcomed: Promise<ServerMessage & { type: 'welcome' }> } {
    let resolveWelcome!: (msg: ServerMessage & { type: 'welcome' }) => void;
    const welcomed = new Promise<ServerMessage & { type: 'welcome' }>(
      (res) => (resolveWelcome = res),
    );
    const url = seatId
      ? `ws://127.0.0.1:${port}/ws?campaign=${campaignId}&seat=${seatId}`
      : `ws://127.0.0.1:${port}/ws?campaign=${campaignId}`;
    const ws = new WebSocket(url); // no auth cookie
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString()) as ServerMessage;
      if (msg.type === 'welcome')
        resolveWelcome(msg as ServerMessage & { type: 'welcome' });
    });
    return { ws, welcomed };
  }

  it('?seat= is used when the seat exists in the campaign (dev mode)', async () => {
    const campaign = await storage.createCampaign('Seat Override Test');
    const seat = await storage.createSeat({
      campaignId: campaign.id,
      displayName: 'Player Two',
      role: 'player',
    });

    const { ws, welcomed } = openDevConnection(campaign.id, seat.id);
    const welcome = await welcomed;

    expect(welcome.seatId).toBe(seat.id);
    expect(welcome.seatRole).toBe('player');

    await closeWs(ws);
  });

  it('?seat= with an unknown seat ID falls back to DEV_SEAT_ID', async () => {
    const campaign = await storage.createCampaign('Unknown Seat Fallback');

    const { ws, welcomed } = openDevConnection(
      campaign.id,
      'seat-does-not-exist',
    );
    const welcome = await welcomed;

    // Falls back to the hardcoded dev seat id.
    expect(welcome.seatId).toBe('seat-mock-001');

    await closeWs(ws);
  });

  it('?seat= is ignored in production — connection rejected without valid auth', async () => {
    const original = process.env.NODE_ENV;
    const originalBaseUrl = process.env.PUBLIC_BASE_URL;
    process.env.NODE_ENV = 'production';
    process.env.PUBLIC_BASE_URL = `http://127.0.0.1:${port}`;

    try {
      const campaign = await storage.createCampaign('Prod No Bypass');
      const seat = await storage.createSeat({
        campaignId: campaign.id,
        displayName: 'Player',
        role: 'player',
      });

      // In production, no valid cookie → 4001 regardless of ?seat=
      const closeCode = await new Promise<number>((resolve) => {
        const ws = new WebSocket(
          `ws://127.0.0.1:${port}/ws?campaign=${campaign.id}&seat=${seat.id}`,
          // No cookie.
          { headers: { Origin: `http://127.0.0.1:${port}` } },
        );
        ws.on('close', (code) => resolve(code));
        ws.on('error', () => resolve(-1));
      });
      expect(closeCode).toBe(4001);
    } finally {
      process.env.NODE_ENV = original;
      process.env.PUBLIC_BASE_URL = originalBaseUrl;
    }
  });
});
