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
 *   • B6: restart persistence, replay correctness, dispatch serialisation,
 *         close-on-throw, seq monotonicity across reopen
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Storage, InMemoryBackend } from '../../storage/index.js';
import { PlaceholderEngine } from './placeholder.js';
import type { WireEvent, GameEvent, SeatView } from '@hearth-vtt/shared';

// ---------------------------------------------------------------------------
// Stable IDs used across all test worlds
// ---------------------------------------------------------------------------

const SCENE_ID = 'scene-test-001';
const HERO_ACTOR_ID = 'actor-hero-001';
const MONSTER_ACTOR_ID = 'actor-monster-001';
const HERO_TOKEN_ID = 'token-hero-001';
const MONSTER_TOKEN_ID = 'token-monster-001';

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
 * Builds a minimal, isolated campaign via snapshot seeding and opens an engine.
 *
 * Seats are created in storage (always loaded fresh by open()).
 * Scenes/tokens/actors are seeded via putSnapshot so open() can load them
 * without touching the entities table.
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

  // Seed initial state via a genesis snapshot (seq=0).
  // Engine no longer reads from the entities table on open().
  await storage.putSnapshot(campaignId, 0, {
    schemaVersion: 1,
    activeSceneId: SCENE_ID,
    scenes: {
      [SCENE_ID]: {
        id: SCENE_ID,
        name: 'Test Dungeon',
        gridType: 'square',
        gridSize: 50,
        gridScale: '5ft',
        width: 2000,
        height: 2000,
      },
    },
    tokens: {
      [HERO_TOKEN_ID]: {
        id: HERO_TOKEN_ID,
        actorId: HERO_ACTOR_ID,
        sceneId: SCENE_ID,
        position: { x: 100, y: 100 },
        size: 1,
      },
      [MONSTER_TOKEN_ID]: {
        id: MONSTER_TOKEN_ID,
        actorId: MONSTER_ACTOR_ID,
        sceneId: SCENE_ID,
        position: { x: 300, y: 300 },
        size: 1,
      },
    },
    actors: {
      [HERO_ACTOR_ID]: {
        id: HERO_ACTOR_ID,
        name: 'Hero',
        type: 'pc',
        seatPermissions: { [playerSeat.id]: 'control' },
        hp: { current: 10, max: 10 },
        ac: 14,
        conditions: [],
      },
      [MONSTER_ACTOR_ID]: {
        id: MONSTER_ACTOR_ID,
        name: 'Goblin',
        type: 'monster',
        seatPermissions: {},
        hp: { current: 4, max: 4 },
        ac: 12,
        conditions: [],
      },
    },
  });

  const engine = await PlaceholderEngine.open(campaignId, storage);

  return {
    storage,
    campaignId,
    gmSeatId: gmSeat.id,
    playerSeatId: playerSeat.id,
    spectatorSeatId: spectatorSeat.id,
    sceneEntityId: SCENE_ID,
    heroActorId: HERO_ACTOR_ID,
    monsterActorId: MONSTER_ACTOR_ID,
    heroTokenId: HERO_TOKEN_ID,
    monsterTokenId: MONSTER_TOKEN_ID,
    engine,
  };
}

/** Collect WireEvents emitted to a seat until the expected count is reached. */
function collectEvents(
  engine: PlaceholderEngine,
  seatId: string,
  _count: number,
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
        payload: { formula: '2d6' },
      });

      expect(events).toHaveLength(1);
      const full = events[0] as { kind: 'full'; event: GameEvent };
      expect(full.event.type).toBe('dice.rolled');
      const data = full.event.data as { formula: string; rolls: number[]; total: number };
      expect(data.formula).toBe('2d6');
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
    it('accepted with valid formula and results are in dice range', async () => {
      const { engine, campaignId, gmSeatId } = world;
      const { events, unsubscribe } = collectEvents(engine, gmSeatId, 1);

      const result = await engine.dispatch({
        seatId: gmSeatId,
        campaignId,
        actionType: 'dice.roll',
        payload: { formula: '4d8+3' },
      });

      expect(result.accepted).toBe(true);
      const full = events[0] as { kind: 'full'; event: GameEvent };
      const data = full.event.data as {
        formula: string;
        rolls: number[];
        total: number;
      };
      expect(data.formula).toBe('4d8+3');
      expect(data.rolls).toHaveLength(4);
      for (const roll of data.rolls) {
        expect(roll).toBeGreaterThanOrEqual(1);
        expect(roll).toBeLessThanOrEqual(8);
      }
      expect(data.total).toBe(data.rolls.reduce((a, b) => a + b, 0) + 3);

      unsubscribe();
    });

    it('rejected when formula is missing', async () => {
      const { engine, campaignId, gmSeatId } = world;
      const result = await engine.dispatch({
        seatId: gmSeatId,
        campaignId,
        actionType: 'dice.roll',
        payload: {},
      });
      expect(result.accepted).toBe(false);
    });

    it('rejected when formula is not a string', async () => {
      const { engine, campaignId, gmSeatId } = world;
      const result = await engine.dispatch({
        seatId: gmSeatId,
        campaignId,
        actionType: 'dice.roll',
        payload: { formula: 42 },
      });
      expect(result.accepted).toBe(false);
    });

    it('rejected for invalid/malformed formula', async () => {
      const { engine, campaignId, gmSeatId } = world;
      const result = await engine.dispatch({
        seatId: gmSeatId,
        campaignId,
        actionType: 'dice.roll',
        payload: { formula: 'not a dice formula!@#' },
      });
      expect(result.accepted).toBe(false);
    });

    it('rejected for oversize formula (> 200 chars)', async () => {
      const { engine, campaignId, gmSeatId } = world;
      const result = await engine.dispatch({
        seatId: gmSeatId,
        campaignId,
        actionType: 'dice.roll',
        payload: { formula: 'd20+'.repeat(60) },
      });
      expect(result.accepted).toBe(false);
    });
  });

  // ── deterministic dice ────────────────────────────────────────────────────

  describe('deterministic dice', () => {
    it('rolls broadcast to subscriber match the rolls stored in the event', async () => {
      // Determinism guarantee: rolls are pre-computed with a seed derived from
      // the anticipated actionId and stored in the event. Replay reads the stored
      // rolls directly — no re-evaluation of the formula.
      const { storage, campaignId, gmSeatId } = world;

      let broadcastRolls: number[] | undefined;
      world.engine.subscribe(gmSeatId, (ev) => {
        if (ev.kind === 'full' && ev.event.type === 'dice.rolled') {
          broadcastRolls = (ev.event.data as { rolls: number[] }).rolls;
        }
      });

      await world.engine.dispatch({
        seatId: gmSeatId,
        campaignId,
        actionType: 'dice.roll',
        payload: { formula: '5d20' },
      });

      expect(broadcastRolls).toBeDefined();

      // The stored event must carry the same rolls so replay produces the same view.
      const events = await storage.getEvents(campaignId);
      const stored = events.find((e) => e.type === 'dice.rolled');
      expect(stored).toBeDefined();
      expect((stored!.data as { rolls: number[] }).rolls).toEqual(
        broadcastRolls,
      );
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

      const payload = { formula: '5d20' };
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
      const {
        engine,
        gmSeatId,
        heroTokenId: _heroTokenId,
        monsterTokenId: _monsterTokenId,
      } = world;
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
      const { engine, playerSeatId, heroActorId: _heroActorId } = world;
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

// ---------------------------------------------------------------------------
// B6 — durability + queue + close-on-throw
// ---------------------------------------------------------------------------

describe('PlaceholderEngine — B6 durability + queue', () => {
  // ── Restart persistence ───────────────────────────────────────────────────

  it('token position is recovered after close + reopen', async () => {
    const storage = new Storage(new InMemoryBackend());
    await storage.init();
    const { id: campaignId } = await storage.createCampaign('Persist');
    const seat = await storage.createSeat({
      campaignId,
      displayName: 'GM',
      role: 'gm',
    });

    await storage.putSnapshot(campaignId, 0, {
      schemaVersion: 1,
      activeSceneId: SCENE_ID,
      scenes: {
        [SCENE_ID]: {
          id: SCENE_ID,
          name: 'Map',
          gridType: 'square',
          gridSize: 50,
          gridScale: '5ft',
          width: 1000,
          height: 1000,
        },
      },
      tokens: {
        [HERO_TOKEN_ID]: {
          id: HERO_TOKEN_ID,
          actorId: HERO_ACTOR_ID,
          sceneId: SCENE_ID,
          position: { x: 0, y: 0 },
          size: 1,
        },
      },
      actors: {
        [HERO_ACTOR_ID]: {
          id: HERO_ACTOR_ID,
          name: 'Hero',
          type: 'pc',
          seatPermissions: {},
          hp: { current: 10, max: 10 },
          ac: 14,
        },
      },
    });

    const engine1 = await PlaceholderEngine.open(campaignId, storage);
    await engine1.dispatch({
      seatId: seat.id,
      campaignId,
      actionType: 'token.move',
      payload: { tokenId: HERO_TOKEN_ID, position: { x: 200, y: 300 } },
    });
    await engine1.close();

    // Open a fresh engine — it must replay the token.moved event.
    const engine2 = await PlaceholderEngine.open(campaignId, storage);
    const view = engine2.getView(seat.id);
    const token = view.tokens.find((t) => t.id === HERO_TOKEN_ID);
    expect(token?.position).toEqual({ x: 200, y: 300 });

    await engine2.close();
  });

  // ── Replay correctness ────────────────────────────────────────────────────

  it('replays hand-written snapshot + events into correct state', async () => {
    const storage = new Storage(new InMemoryBackend());
    await storage.init();
    const { id: campaignId } = await storage.createCampaign('Replay');
    const seat = await storage.createSeat({
      campaignId,
      displayName: 'GM',
      role: 'gm',
    });

    // Genesis snapshot: token at (0,0), seq=0.
    await storage.putSnapshot(campaignId, 0, {
      schemaVersion: 1,
      activeSceneId: SCENE_ID,
      scenes: {
        [SCENE_ID]: {
          id: SCENE_ID,
          name: 'Replay Map',
          gridType: 'square',
          gridSize: 50,
          gridScale: '5ft',
          width: 1000,
          height: 1000,
        },
      },
      tokens: {
        [HERO_TOKEN_ID]: {
          id: HERO_TOKEN_ID,
          actorId: HERO_ACTOR_ID,
          sceneId: SCENE_ID,
          position: { x: 0, y: 0 },
          size: 1,
        },
      },
      actors: {
        [HERO_ACTOR_ID]: {
          id: HERO_ACTOR_ID,
          name: 'Hero',
          type: 'pc',
          seatPermissions: {},
          hp: { current: 10, max: 10 },
          ac: 14,
        },
      },
    });

    // Hand-write three token.moved events directly into storage (bypassing engine).
    await storage.appendEvent(campaignId, {
      campaignId,
      entityId: HERO_TOKEN_ID,
      type: 'token.moved',
      data: {
        originSeatId: seat.id,
        tokenId: HERO_TOKEN_ID,
        from: { x: 0, y: 0 },
        to: { x: 50, y: 0 },
      },
    });
    await storage.appendEvent(campaignId, {
      campaignId,
      entityId: HERO_TOKEN_ID,
      type: 'token.moved',
      data: {
        originSeatId: seat.id,
        tokenId: HERO_TOKEN_ID,
        from: { x: 50, y: 0 },
        to: { x: 100, y: 0 },
      },
    });
    await storage.appendEvent(campaignId, {
      campaignId,
      entityId: HERO_TOKEN_ID,
      type: 'token.moved',
      data: {
        originSeatId: seat.id,
        tokenId: HERO_TOKEN_ID,
        from: { x: 100, y: 0 },
        to: { x: 150, y: 0 },
      },
    });

    const engine = await PlaceholderEngine.open(campaignId, storage);
    const view = engine.getView(seat.id);
    const token = view.tokens.find((t) => t.id === HERO_TOKEN_ID);
    expect(token?.position).toEqual({ x: 150, y: 0 });
    expect(view.lastSeq).toBe(3);

    await engine.close();
  });

  // ── Dispatch serialisation ────────────────────────────────────────────────

  it('3 concurrent dispatches produce seq=1,2,3 with no duplicates', async () => {
    const storage = new Storage(new InMemoryBackend());
    await storage.init();
    const { id: campaignId } = await storage.createCampaign('Queue');
    const seat = await storage.createSeat({
      campaignId,
      displayName: 'GM',
      role: 'gm',
    });

    await storage.putSnapshot(campaignId, 0, {
      schemaVersion: 1,
      activeSceneId: null,
      scenes: {},
      tokens: {},
      actors: {},
    });

    const engine = await PlaceholderEngine.open(campaignId, storage);

    // Fire three dispatches concurrently without awaiting between them.
    const [r1, r2, r3] = await Promise.all([
      engine.dispatch({
        seatId: seat.id,
        campaignId,
        actionType: 'chat.send',
        payload: { text: 'one' },
      }),
      engine.dispatch({
        seatId: seat.id,
        campaignId,
        actionType: 'chat.send',
        payload: { text: 'two' },
      }),
      engine.dispatch({
        seatId: seat.id,
        campaignId,
        actionType: 'chat.send',
        payload: { text: 'three' },
      }),
    ]);

    expect(r1.accepted).toBe(true);
    expect(r2.accepted).toBe(true);
    expect(r3.accepted).toBe(true);

    // Cast to get seq values.
    const seqs = [r1, r2, r3]
      .filter((r) => r.accepted)
      .map((r) => (r as { accepted: true; seq: number }).seq)
      .sort((a, b) => a - b);

    expect(seqs).toEqual([1, 2, 3]);

    // Verify storage has 3 events with distinct seqs.
    const events = await storage.getEvents(campaignId);
    const storedSeqs = events.map((e) => e.seq).sort((a, b) => a - b);
    expect(storedSeqs).toEqual([1, 2, 3]);

    await engine.close();
  });

  // ── Close-on-apply-throw ──────────────────────────────────────────────────

  it('engine closes itself if applyEvent throws, subsequent dispatches return {accepted:false}', async () => {
    const storage = new Storage(new InMemoryBackend());
    await storage.init();
    const { id: campaignId } = await storage.createCampaign('Throw');
    const seat = await storage.createSeat({
      campaignId,
      displayName: 'GM',
      role: 'gm',
    });

    await storage.putSnapshot(campaignId, 0, {
      schemaVersion: 1,
      activeSceneId: null,
      scenes: {},
      tokens: {},
      actors: {},
    });

    const engine = await PlaceholderEngine.open(campaignId, storage);

    // Monkey-patch appendEvent to inject a malformed event that will cause
    // applyEvent to throw by corrupting the stored event's type to force
    // unexpected data (simplest: we override the private applyEvent via
    // prototype patching to throw on the next call).
    const proto = Object.getPrototypeOf(engine) as {
      applyEvent: (e: unknown) => unknown;
    };
    const realApply = proto.applyEvent.bind(engine);
    let callCount = 0;
    vi.spyOn(proto, 'applyEvent').mockImplementation(function (
      this: unknown,
      ...args: unknown[]
    ) {
      callCount++;
      if (callCount === 1) throw new Error('injected failure');
      return realApply(...(args as [unknown]));
    });

    const r1 = await engine.dispatch({
      seatId: seat.id,
      campaignId,
      actionType: 'chat.send',
      payload: { text: 'boom' },
    });
    expect(r1.accepted).toBe(false);

    // Give the close() scheduled via void to run.
    await new Promise((r) => setImmediate(r));

    const r2 = await engine.dispatch({
      seatId: seat.id,
      campaignId,
      actionType: 'chat.send',
      payload: { text: 'after close' },
    });
    expect(r2.accepted).toBe(false);
    if (!r2.accepted) expect(r2.reason).toContain('closed');

    vi.restoreAllMocks();
  });

  // ── Seq monotonicity across reopen ───────────────────────────────────────

  it('seq continues from max stored seq after reopen (does not reset to 1)', async () => {
    const storage = new Storage(new InMemoryBackend());
    await storage.init();
    const { id: campaignId } = await storage.createCampaign('SeqContinue');
    const seat = await storage.createSeat({
      campaignId,
      displayName: 'GM',
      role: 'gm',
    });

    await storage.putSnapshot(campaignId, 0, {
      schemaVersion: 1,
      activeSceneId: null,
      scenes: {},
      tokens: {},
      actors: {},
    });

    const engine1 = await PlaceholderEngine.open(campaignId, storage);

    await engine1.dispatch({
      seatId: seat.id,
      campaignId,
      actionType: 'chat.send',
      payload: { text: 'first' },
    });
    await engine1.dispatch({
      seatId: seat.id,
      campaignId,
      actionType: 'chat.send',
      payload: { text: 'second' },
    });
    await engine1.close();

    const engine2 = await PlaceholderEngine.open(campaignId, storage);
    const r3 = await engine2.dispatch({
      seatId: seat.id,
      campaignId,
      actionType: 'chat.send',
      payload: { text: 'third' },
    });

    expect(r3.accepted).toBe(true);
    expect((r3 as { accepted: true; seq: number }).seq).toBe(3);

    await engine2.close();
  });
});
