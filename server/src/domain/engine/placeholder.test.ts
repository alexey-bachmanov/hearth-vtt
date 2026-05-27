/**
 * PlaceholderEngine boundary tests.
 *
 * Tests the public engine surface (dispatch, getView, subscribe) in isolation
 * — no WS transport, no HTTP routes.
 *
 * Topics:
 *   • dispatch → subscriber receives events (full event shape, seq)
 *   • getView shape per seat (GM vs player audience filtering)
 *   • seq gaplessness across accepted and rejected dispatches
 *   • deterministic dice via seeded RNG
 *   • optimistic-move accept / reject paths (token.move)
 *   • chat.send / dice.roll input validation
 *   • subscribe / unsubscribe lifecycle
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Storage, InMemoryBackend } from '../../storage/index.js';
import { PlaceholderEngine } from './placeholder.js';
import type { WireEvent, GameEvent, SeatView } from '@hearth-vtt/shared';

// ---------------------------------------------------------------------------
// Test world
// ---------------------------------------------------------------------------

interface TestWorld {
  storage: Storage;
  campaignId: string;
  gmSeatId: string;
  playerSeatId: string;
  spectatorSeatId: string;
  sceneEntityId: string;
  heroActorId: string;
  monsterActorId: string;
  heroTokenId: string;
  monsterTokenId: string;
  engine: PlaceholderEngine;
}

/**
 * Builds a minimal, isolated campaign in InMemory storage and opens an engine.
 *
 * Entity relationships:
 *   scene ← heroToken (sceneId), monsterToken (sceneId)
 *   heroActor (seatPermissions[playerSeat] = 'control') ← heroToken (actorId)
 *   monsterActor (no player permissions) ← monsterToken (actorId)
 */
async function buildTestWorld(): Promise<TestWorld> {
  const storage = new Storage(new InMemoryBackend());
  await storage.init();

  const campaign = await storage.createCampaign('Test Campaign');
  const campaignId = campaign.id;

  const gmSeat = await storage.createSeat({
    campaignId,
    displayName: 'GM',
    role: 'gm',
  });
  const playerSeat = await storage.createSeat({
    campaignId,
    displayName: 'Player',
    role: 'player',
  });
  const spectatorSeat = await storage.createSeat({
    campaignId,
    displayName: 'Watcher',
    role: 'spectator',
  });

  // Scene must be created before tokens (tokens reference sceneEntity.id).
  const sceneEntity = await storage.createEntity(campaignId, 'scene', {
    name: 'Test Dungeon',
    background: { kind: 'color', color: '#1a1a2e' },
    gridType: 'square',
    gridSize: 50,
    gridScale: '5ft',
    width: 2000,
    height: 2000,
  });

  // Actors must be created before tokens (tokens reference actorEntity.id).
  const heroActor = await storage.createEntity(campaignId, 'actor', {
    name: 'Hero',
    type: 'pc',
    seatPermissions: { [playerSeat.id]: 'control' },
    hp: { current: 10, max: 10 },
    ac: 14,
    conditions: [],
  });
  const monsterActor = await storage.createEntity(campaignId, 'actor', {
    name: 'Goblin',
    type: 'monster',
    seatPermissions: {},
    hp: { current: 4, max: 4 },
    ac: 12,
    conditions: [],
  });

  // Tokens in the active scene.
  const heroToken = await storage.createEntity(campaignId, 'token', {
    actorId: heroActor.id,
    sceneId: sceneEntity.id,
    position: { x: 100, y: 100 },
    size: 1,
  });
  const monsterToken = await storage.createEntity(campaignId, 'token', {
    actorId: monsterActor.id,
    sceneId: sceneEntity.id,
    position: { x: 300, y: 300 },
    size: 1,
  });

  const engine = await PlaceholderEngine.open(campaignId, storage);

  return {
    storage,
    campaignId,
    gmSeatId: gmSeat.id,
    playerSeatId: playerSeat.id,
    spectatorSeatId: spectatorSeat.id,
    sceneEntityId: sceneEntity.id,
    heroActorId: heroActor.id,
    monsterActorId: monsterActor.id,
    heroTokenId: heroToken.id,
    monsterTokenId: monsterToken.id,
    engine,
  };
}

/** Collect WireEvents emitted to a seat until the expected count is reached. */
function collectEvents(
  engine: PlaceholderEngine,
  seatId: string,
  count: number,
): { events: WireEvent[]; unsubscribe: () => void } {
  const events: WireEvent[] = [];
  const unsubscribe = engine.subscribe(seatId, (ev) => {
    events.push(ev);
  });
  return { events, unsubscribe };
}

/** Wait briefly for async dispatch events to settle. */
function nextTick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PlaceholderEngine', () => {
  let world: TestWorld;

  beforeEach(async () => {
    world = await buildTestWorld();
  });

  // ── dispatch → subscriber receives events ────────────────────────────────

  describe('dispatch → subscriber receives full events', () => {
    it('chat.send delivers a full WireEvent with kind="full"', async () => {
      const { engine, campaignId, gmSeatId } = world;
      const { events, unsubscribe } = collectEvents(engine, gmSeatId, 1);

      await engine.dispatch({
        seatId: gmSeatId,
        campaignId,
        actionType: 'chat.send',
        payload: { text: 'Hello world' },
      });

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ kind: 'full' });
      const full = events[0] as { kind: 'full'; event: GameEvent };
      expect(full.event.type).toBe('chat.message');
      expect(full.event.campaignId).toBe(campaignId);
      expect((full.event.data as { text: string }).text).toBe('Hello world');

      unsubscribe();
    });

    it('token.move delivers a full token.moved event', async () => {
      const { engine, campaignId, gmSeatId, heroTokenId } = world;
      const { events, unsubscribe } = collectEvents(engine, gmSeatId, 1);

      await engine.dispatch({
        seatId: gmSeatId,
        campaignId,
        actionType: 'token.move',
        payload: { tokenId: heroTokenId, position: { x: 150, y: 250 } },
      });

      expect(events).toHaveLength(1);
      const full = events[0] as { kind: 'full'; event: GameEvent };
      expect(full.event.type).toBe('token.moved');
      const data = full.event.data as {
        tokenId: string;
        from: { x: number; y: number };
        to: { x: number; y: number };
      };
      expect(data.tokenId).toBe(heroTokenId);
      expect(data.to).toEqual({ x: 150, y: 250 });

      unsubscribe();
    });

    it('dice.roll delivers a full dice.rolled event', async () => {
      const { engine, campaignId, gmSeatId } = world;
      const { events, unsubscribe } = collectEvents(engine, gmSeatId, 1);

      await engine.dispatch({
        seatId: gmSeatId,
        campaignId,
        actionType: 'dice.roll',
        payload: { count: 2, sides: 6 },
      });

      expect(events).toHaveLength(1);
      const full = events[0] as { kind: 'full'; event: GameEvent };
      expect(full.event.type).toBe('dice.rolled');
      const data = full.event.data as { rolls: number[]; total: number };
      expect(data.rolls).toHaveLength(2);
      for (const roll of data.rolls) {
        expect(roll).toBeGreaterThanOrEqual(1);
        expect(roll).toBeLessThanOrEqual(6);
      }

      unsubscribe();
    });

    it('all subscribed seats receive public events', async () => {
      const { engine, campaignId, gmSeatId, playerSeatId, spectatorSeatId } =
        world;
      const { events: gmEvents, unsubscribe: u1 } = collectEvents(
        engine,
        gmSeatId,
        1,
      );
      const { events: playerEvents, unsubscribe: u2 } = collectEvents(
        engine,
        playerSeatId,
        1,
      );
      const { events: spectatorEvents, unsubscribe: u3 } = collectEvents(
        engine,
        spectatorSeatId,
        1,
      );

      await engine.dispatch({
        seatId: gmSeatId,
        campaignId,
        actionType: 'chat.send',
        payload: { text: 'Broadcast!' },
      });

      expect(gmEvents).toHaveLength(1);
      expect(playerEvents).toHaveLength(1);
      expect(spectatorEvents).toHaveLength(1);
      expect(gmEvents[0]).toMatchObject({ kind: 'full' });
      expect(playerEvents[0]).toMatchObject({ kind: 'full' });
      expect(spectatorEvents[0]).toMatchObject({ kind: 'full' });

      u1();
      u2();
      u3();
    });

    it('multiple subscribers on the same seat both receive events', async () => {
      const { engine, campaignId, gmSeatId } = world;
      const received1: WireEvent[] = [];
      const received2: WireEvent[] = [];
      const u1 = engine.subscribe(gmSeatId, (e) => received1.push(e));
      const u2 = engine.subscribe(gmSeatId, (e) => received2.push(e));

      await engine.dispatch({
        seatId: gmSeatId,
        campaignId,
        actionType: 'chat.send',
        payload: { text: 'Doubled' },
      });

      expect(received1).toHaveLength(1);
      expect(received2).toHaveLength(1);
      u1();
      u2();
    });
  });

  // ── token.move accept / reject ────────────────────────────────────────────

  describe('token.move', () => {
    it('accepted when GM moves any token', async () => {
      const { engine, campaignId, gmSeatId, heroTokenId } = world;
      const result = await engine.dispatch({
        seatId: gmSeatId,
        campaignId,
        actionType: 'token.move',
        payload: { tokenId: heroTokenId, position: { x: 50, y: 75 } },
      });
      expect(result.accepted).toBe(true);
      if (result.accepted) {
        expect(result.seq).toBe(1);
        expect(result.actionId).toMatch(/^[0-9a-f]{64}$/);
      }
    });

    it('accepted when player with control moves their actor token', async () => {
      const { engine, campaignId, playerSeatId, heroTokenId } = world;
      const result = await engine.dispatch({
        seatId: playerSeatId,
        campaignId,
        actionType: 'token.move',
        payload: { tokenId: heroTokenId, position: { x: 200, y: 200 } },
      });
      expect(result.accepted).toBe(true);
    });

    it('rejected when player has no control over the token', async () => {
      const { engine, campaignId, playerSeatId, monsterTokenId } = world;
      const { events, unsubscribe } = collectEvents(engine, playerSeatId, 0);

      const result = await engine.dispatch({
        seatId: playerSeatId,
        campaignId,
        actionType: 'token.move',
        payload: { tokenId: monsterTokenId, position: { x: 400, y: 400 } },
      });

      await nextTick();
      expect(result.accepted).toBe(false);
      expect(events).toHaveLength(0); // no event emitted on reject

      unsubscribe();
    });

    it('rejected when token is not found', async () => {
      const { engine, campaignId, gmSeatId } = world;
      const result = await engine.dispatch({
        seatId: gmSeatId,
        campaignId,
        actionType: 'token.move',
        payload: { tokenId: 'nonexistent-token-id', position: { x: 0, y: 0 } },
      });
      expect(result.accepted).toBe(false);
      if (!result.accepted) {
        expect(result.reason).toMatch(/not found/i);
      }
    });

    it('rejected for malformed payload (missing tokenId)', async () => {
      const { engine, campaignId, gmSeatId } = world;
      const result = await engine.dispatch({
        seatId: gmSeatId,
        campaignId,
        actionType: 'token.move',
        payload: { position: { x: 0, y: 0 } }, // missing tokenId
      });
      expect(result.accepted).toBe(false);
    });

    it('updates token position in engine state after accept', async () => {
      const { engine, campaignId, gmSeatId, heroTokenId } = world;

      await engine.dispatch({
        seatId: gmSeatId,
        campaignId,
        actionType: 'token.move',
        payload: { tokenId: heroTokenId, position: { x: 42, y: 99 } },
      });

      // The view should reflect the updated position.
      const view = engine.getView(gmSeatId);
      const token = view.tokens.find((t) => {
        const td = t as unknown as { actorId?: string };
        return td.actorId !== undefined; // find any token
      });
      // Find the hero token by checking the engine view
      const heroToken = view.tokens.find((t) => {
        // tokens are indexed by entity id; check position
        const td = t as unknown as { position: { x: number; y: number } };
        return td.position.x === 42 && td.position.y === 99;
      });
      expect(heroToken).toBeDefined();
      expect(
        (heroToken as unknown as { position: { x: number; y: number } })
          .position,
      ).toEqual({ x: 42, y: 99 });
    });

    it('rejected dispatch does not emit an event to subscribers', async () => {
      const { engine, campaignId, playerSeatId, monsterTokenId } = world;
      const gmEvents: WireEvent[] = [];
      const u = engine.subscribe(world.gmSeatId, (e) => gmEvents.push(e));

      await engine.dispatch({
        seatId: playerSeatId,
        campaignId,
        actionType: 'token.move',
        payload: { tokenId: monsterTokenId, position: { x: 999, y: 999 } },
      });
      await nextTick();

      expect(gmEvents).toHaveLength(0);
      u();
    });
  });

  // ── chat.send ─────────────────────────────────────────────────────────────

  describe('chat.send', () => {
    it('accepted with a valid message', async () => {
      const { engine, campaignId, playerSeatId } = world;
      const result = await engine.dispatch({
        seatId: playerSeatId,
        campaignId,
        actionType: 'chat.send',
        payload: { text: 'Greetings!' },
      });
      expect(result.accepted).toBe(true);
    });

    it('event data contains the original text and the originating seatId', async () => {
      const { engine, campaignId, playerSeatId } = world;
      const { events, unsubscribe } = collectEvents(engine, playerSeatId, 1);

      await engine.dispatch({
        seatId: playerSeatId,
        campaignId,
        actionType: 'chat.send',
        payload: { text: 'Hello from player' },
      });

      const full = events[0] as { kind: 'full'; event: GameEvent };
      const data = full.event.data as { text: string; originSeatId: string };
      expect(data.text).toBe('Hello from player');
      expect(data.originSeatId).toBe(playerSeatId);

      unsubscribe();
    });

    it('rejected when text is missing from payload', async () => {
      const { engine, campaignId, gmSeatId } = world;
      const result = await engine.dispatch({
        seatId: gmSeatId,
        campaignId,
        actionType: 'chat.send',
        payload: {},
      });
      expect(result.accepted).toBe(false);
    });

    it('rejected when text exceeds 2000 characters', async () => {
      const { engine, campaignId, gmSeatId } = world;
      const result = await engine.dispatch({
        seatId: gmSeatId,
        campaignId,
        actionType: 'chat.send',
        payload: { text: 'x'.repeat(2001) },
      });
      expect(result.accepted).toBe(false);
    });

    it('accepted at exactly 2000 characters', async () => {
      const { engine, campaignId, gmSeatId } = world;
      const result = await engine.dispatch({
        seatId: gmSeatId,
        campaignId,
        actionType: 'chat.send',
        payload: { text: 'y'.repeat(2000) },
      });
      expect(result.accepted).toBe(true);
    });
  });

  // ── dice.roll ─────────────────────────────────────────────────────────────

  describe('dice.roll', () => {
    it('accepted with valid params and results are in [1, sides]', async () => {
      const { engine, campaignId, gmSeatId } = world;
      const { events, unsubscribe } = collectEvents(engine, gmSeatId, 1);

      const result = await engine.dispatch({
        seatId: gmSeatId,
        campaignId,
        actionType: 'dice.roll',
        payload: { count: 4, sides: 8, modifier: 3 },
      });

      expect(result.accepted).toBe(true);
      const full = events[0] as { kind: 'full'; event: GameEvent };
      const data = full.event.data as {
        rolls: number[];
        total: number;
        modifier: number;
        count: number;
        sides: number;
      };
      expect(data.rolls).toHaveLength(4);
      for (const roll of data.rolls) {
        expect(roll).toBeGreaterThanOrEqual(1);
        expect(roll).toBeLessThanOrEqual(8);
      }
      expect(data.total).toBe(data.rolls.reduce((a, b) => a + b, 0) + 3);
      expect(data.modifier).toBe(3);

      unsubscribe();
    });

    it('rejected when count < 1', async () => {
      const { engine, campaignId, gmSeatId } = world;
      const result = await engine.dispatch({
        seatId: gmSeatId,
        campaignId,
        actionType: 'dice.roll',
        payload: { count: 0, sides: 6 },
      });
      expect(result.accepted).toBe(false);
    });

    it('rejected when count > 100', async () => {
      const { engine, campaignId, gmSeatId } = world;
      const result = await engine.dispatch({
        seatId: gmSeatId,
        campaignId,
        actionType: 'dice.roll',
        payload: { count: 101, sides: 6 },
      });
      expect(result.accepted).toBe(false);
    });

    it('rejected when sides < 2', async () => {
      const { engine, campaignId, gmSeatId } = world;
      const result = await engine.dispatch({
        seatId: gmSeatId,
        campaignId,
        actionType: 'dice.roll',
        payload: { count: 1, sides: 1 },
      });
      expect(result.accepted).toBe(false);
    });

    it('rejected for missing payload', async () => {
      const { engine, campaignId, gmSeatId } = world;
      const result = await engine.dispatch({
        seatId: gmSeatId,
        campaignId,
        actionType: 'dice.roll',
        payload: { count: 2 }, // missing sides
      });
      expect(result.accepted).toBe(false);
    });
  });

  // ── deterministic dice ────────────────────────────────────────────────────

  describe('deterministic dice', () => {
    it('same (campaignId, seq, actionType, payload) yields identical rolls', async () => {
      const { storage, campaignId, gmSeatId } = world;

      // Open two independent engine instances against the same backing storage.
      // Both start with seq=0; first dispatch on each will be seq=1,
      // so (campaignId, seq=1, 'dice.roll', payload) will be identical.
      const engine1 = await PlaceholderEngine.open(campaignId, storage);
      const engine2 = await PlaceholderEngine.open(campaignId, storage);

      const payload = { count: 5, sides: 20 };

      let rolls1: number[] | undefined;
      let rolls2: number[] | undefined;

      engine1.subscribe(gmSeatId, (ev) => {
        if (ev.kind === 'full') {
          rolls1 = (ev.event.data as { rolls: number[] }).rolls;
        }
      });
      engine2.subscribe(gmSeatId, (ev) => {
        if (ev.kind === 'full') {
          rolls2 = (ev.event.data as { rolls: number[] }).rolls;
        }
      });

      await engine1.dispatch({
        seatId: gmSeatId,
        campaignId,
        actionType: 'dice.roll',
        payload,
      });
      await engine2.dispatch({
        seatId: gmSeatId,
        campaignId,
        actionType: 'dice.roll',
        payload,
      });

      expect(rolls1).toBeDefined();
      expect(rolls2).toBeDefined();
      expect(rolls1).toEqual(rolls2);

      engine1.close();
      engine2.close();
    });

    it('sequential rolls on the same engine differ between dispatches', async () => {
      // Two consecutive dice.roll dispatches each get a different seq number,
      // so their actionIds (and therefore roll results) should differ.
      // With 5d20 the probability of a false collision is < 1e-6.
      const { engine, campaignId, gmSeatId } = world;
      const allRolls: number[][] = [];

      engine.subscribe(gmSeatId, (ev) => {
        if (ev.kind === 'full' && ev.event.type === 'dice.rolled') {
          allRolls.push((ev.event.data as { rolls: number[] }).rolls);
        }
      });

      const payload = { count: 5, sides: 20 };
      await engine.dispatch({
        seatId: gmSeatId,
        campaignId,
        actionType: 'dice.roll',
        payload,
      });
      await engine.dispatch({
        seatId: gmSeatId,
        campaignId,
        actionType: 'dice.roll',
        payload,
      });

      expect(allRolls).toHaveLength(2);
      // Sequences are different → rolls should differ (with overwhelming probability)
      expect(allRolls[0]).not.toEqual(allRolls[1]);
    });
  });

  // ── getView — GM seat ─────────────────────────────────────────────────────

  describe('getView — GM seat', () => {
    it('has the expected shape', () => {
      const { engine, campaignId, gmSeatId } = world;
      const view: SeatView = engine.getView(gmSeatId);

      expect(view.campaignId).toBe(campaignId);
      expect(view.seatId).toBe(gmSeatId);
      expect(view.seatRole).toBe('gm');
      expect(view.scene).not.toBeNull();
      expect(view.tokens).toBeInstanceOf(Array);
      expect(view.actors).toBeInstanceOf(Array);
      expect(view.recentEvents).toBeInstanceOf(Array);
      expect(view.activePrompts).toEqual([]);
      expect(typeof view.lastSeq).toBe('number');
    });

    it('GM sees all tokens in the active scene', () => {
      const { engine, gmSeatId, heroTokenId, monsterTokenId } = world;
      const view = engine.getView(gmSeatId);

      // Engine uses entity DB id as map key → token data has actorId/sceneId/etc.
      // We can verify count (2 tokens) and check via the engine view.
      expect(view.tokens).toHaveLength(2);
    });

    it('GM sees all actors', () => {
      const { engine, gmSeatId } = world;
      const view = engine.getView(gmSeatId);
      expect(view.actors).toHaveLength(2);
    });

    it('lastSeq starts at 0 before any dispatch', () => {
      const { engine, gmSeatId } = world;
      expect(engine.getView(gmSeatId).lastSeq).toBe(0);
    });

    it('lastSeq increments by 1 per accepted dispatch', async () => {
      const { engine, campaignId, gmSeatId } = world;

      await engine.dispatch({
        seatId: gmSeatId,
        campaignId,
        actionType: 'chat.send',
        payload: { text: 'a' },
      });
      expect(engine.getView(gmSeatId).lastSeq).toBe(1);

      await engine.dispatch({
        seatId: gmSeatId,
        campaignId,
        actionType: 'chat.send',
        payload: { text: 'b' },
      });
      expect(engine.getView(gmSeatId).lastSeq).toBe(2);
    });

    it('recentEvents contains accepted events', async () => {
      const { engine, campaignId, gmSeatId } = world;
      await engine.dispatch({
        seatId: gmSeatId,
        campaignId,
        actionType: 'chat.send',
        payload: { text: 'hi' },
      });

      const view = engine.getView(gmSeatId);
      expect(view.recentEvents).toHaveLength(1);
      expect(view.recentEvents[0].type).toBe('chat.message');
    });

    it('scene is the active scene with correct metadata', () => {
      const { engine, gmSeatId } = world;
      const view = engine.getView(gmSeatId);
      expect(view.scene).not.toBeNull();
      const scene = view.scene as { name: string };
      expect(scene.name).toBe('Test Dungeon');
    });
  });

  // ── getView — player seat ─────────────────────────────────────────────────

  describe('getView — player seat', () => {
    it('has correct seatRole', () => {
      const { engine, playerSeatId } = world;
      const view = engine.getView(playerSeatId);
      expect(view.seatRole).toBe('player');
      expect(view.seatId).toBe(playerSeatId);
    });

    it('player sees all non-hidden tokens in the active scene', () => {
      // Both heroToken and monsterToken are non-hidden; player sees both.
      const { engine, playerSeatId } = world;
      const view = engine.getView(playerSeatId);
      expect(view.tokens).toHaveLength(2);
    });

    it('player sees only actors they have seatPermissions for', () => {
      // heroActor has seatPermissions[playerSeat] = 'control'; monsterActor has none.
      const { engine, playerSeatId, heroActorId } = world;
      const view = engine.getView(playerSeatId);
      expect(view.actors).toHaveLength(1);
      // The one actor should be the hero (accessed via its engine-map key = heroActorId).
      const actor = view.actors[0] as unknown as {
        seatPermissions: Record<string, string>;
      };
      expect(actor.seatPermissions[playerSeatId]).toBe('control');
    });

    it('spectator sees all tokens but no actors', () => {
      const { engine, spectatorSeatId } = world;
      const view = engine.getView(spectatorSeatId);
      // Spectators have no seatPermissions on any actor.
      expect(view.actors).toHaveLength(0);
      // All non-hidden tokens visible.
      expect(view.tokens).toHaveLength(2);
    });
  });

  // ── seq gaplessness ───────────────────────────────────────────────────────

  describe('seq gaplessness', () => {
    it('subscribers receive consecutive seq numbers starting at 1', async () => {
      const { engine, campaignId, gmSeatId } = world;
      const seqNumbers: number[] = [];

      engine.subscribe(gmSeatId, (ev) => {
        if (ev.kind === 'full') {
          seqNumbers.push(ev.event.seq);
        }
      });

      await engine.dispatch({
        seatId: gmSeatId,
        campaignId,
        actionType: 'chat.send',
        payload: { text: '1' },
      });
      await engine.dispatch({
        seatId: gmSeatId,
        campaignId,
        actionType: 'chat.send',
        payload: { text: '2' },
      });
      await engine.dispatch({
        seatId: gmSeatId,
        campaignId,
        actionType: 'chat.send',
        payload: { text: '3' },
      });

      expect(seqNumbers).toEqual([1, 2, 3]);
    });

    it('rejected dispatches do not advance seq', async () => {
      const { engine, campaignId, gmSeatId, playerSeatId, monsterTokenId } =
        world;
      const seqNumbers: number[] = [];

      engine.subscribe(gmSeatId, (ev) => {
        if (ev.kind === 'full') seqNumbers.push(ev.event.seq);
      });

      // Accepted → seq 1
      await engine.dispatch({
        seatId: gmSeatId,
        campaignId,
        actionType: 'chat.send',
        payload: { text: 'ok' },
      });
      // Rejected (player cannot move monster token) → no event, seq stays
      await engine.dispatch({
        seatId: playerSeatId,
        campaignId,
        actionType: 'token.move',
        payload: { tokenId: monsterTokenId, position: { x: 0, y: 0 } },
      });
      // Accepted → seq 2 (gap-free)
      await engine.dispatch({
        seatId: gmSeatId,
        campaignId,
        actionType: 'chat.send',
        payload: { text: 'still ok' },
      });

      expect(seqNumbers).toEqual([1, 2]);
    });

    it('all seats receive the same seq numbers for public events', async () => {
      const { engine, campaignId, gmSeatId, playerSeatId } = world;
      const gmSeqs: number[] = [];
      const playerSeqs: number[] = [];

      engine.subscribe(gmSeatId, (ev) => {
        if (ev.kind === 'full') gmSeqs.push(ev.event.seq);
      });
      engine.subscribe(playerSeatId, (ev) => {
        if (ev.kind === 'full') playerSeqs.push(ev.event.seq);
      });

      for (let i = 0; i < 3; i++) {
        await engine.dispatch({
          seatId: gmSeatId,
          campaignId,
          actionType: 'chat.send',
          payload: { text: String(i) },
        });
      }

      expect(gmSeqs).toEqual([1, 2, 3]);
      expect(playerSeqs).toEqual([1, 2, 3]);
    });
  });

  // ── subscribe / unsubscribe ───────────────────────────────────────────────

  describe('subscribe / unsubscribe', () => {
    it('subscribe returns a callable unsubscribe function', async () => {
      const { engine, campaignId, gmSeatId } = world;
      const received: WireEvent[] = [];

      const unsubscribe = engine.subscribe(gmSeatId, (ev) => received.push(ev));
      expect(typeof unsubscribe).toBe('function');

      await engine.dispatch({
        seatId: gmSeatId,
        campaignId,
        actionType: 'chat.send',
        payload: { text: 'before' },
      });
      expect(received).toHaveLength(1);

      unsubscribe();

      await engine.dispatch({
        seatId: gmSeatId,
        campaignId,
        actionType: 'chat.send',
        payload: { text: 'after' },
      });
      expect(received).toHaveLength(1); // still 1 after unsubscribe
    });

    it('unsubscribing one listener does not affect others on the same seat', async () => {
      const { engine, campaignId, gmSeatId } = world;
      const r1: WireEvent[] = [];
      const r2: WireEvent[] = [];

      const u1 = engine.subscribe(gmSeatId, (e) => r1.push(e));
      const u2 = engine.subscribe(gmSeatId, (e) => r2.push(e));

      await engine.dispatch({
        seatId: gmSeatId,
        campaignId,
        actionType: 'chat.send',
        payload: { text: 'hello' },
      });
      expect(r1).toHaveLength(1);
      expect(r2).toHaveLength(1);

      u1(); // only remove first listener

      await engine.dispatch({
        seatId: gmSeatId,
        campaignId,
        actionType: 'chat.send',
        payload: { text: 'world' },
      });
      expect(r1).toHaveLength(1); // no new events
      expect(r2).toHaveLength(2); // still receiving

      u2();
    });
  });

  // ── unknown action type ───────────────────────────────────────────────────

  describe('unknown action type', () => {
    it('rejected for an unrecognised action type', async () => {
      const { engine, campaignId, gmSeatId } = world;
      const result = await engine.dispatch({
        seatId: gmSeatId,
        campaignId,
        actionType: 'magic.missile', // not a placeholder action
        payload: {},
      });
      expect(result.accepted).toBe(false);
    });
  });
});
