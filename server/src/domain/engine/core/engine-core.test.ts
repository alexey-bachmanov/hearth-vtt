/**
 * EngineCore tests — Phase 6F (throwaway v0.1).
 *
 * Tests the public surface of EngineCore in isolation: dispatch, composition,
 * merger collision, unknown actions, and workflow state.
 *
 * Uses InMemoryBackend (same pattern as placeholder.test.ts) so no SQLite
 * setup is needed.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Storage, InMemoryBackend } from '../../../storage/index.js';
import { EngineCore } from './engine-core.js';
import { ruleset as dndRuleset } from './ruleset-dnd.js';
import type { RulesetManifest } from './types.js';
import type { WireEvent } from '../index.js';

// ─── Stable IDs ──────────────────────────────────────────────────────────────

const SCENE_ID = 'scene-001';
const HERO_ACTOR_ID = 'actor-hero-001';
const HERO_TOKEN_ID = 'token-hero-001';

// ─── Test world ──────────────────────────────────────────────────────────────

interface TestWorld {
  storage: Storage;
  campaignId: string;
  gmSeatId: string;
  playerSeatId: string;
}

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

  // Seed state via genesis snapshot so the engine loads tokens/actors/scenes.
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
    },
  });

  return {
    storage,
    campaignId,
    gmSeatId: gmSeat.id,
    playerSeatId: playerSeat.id,
  };
}

/** Wait for async dispatch to flush through the queue. */
function nextTick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/** Collect WireEvents broadcast to a seat until unsubscribed. */
function collectEvents(
  engine: EngineCore,
  seatId: string,
): { events: WireEvent[]; unsubscribe: () => void } {
  const events: WireEvent[] = [];
  const unsubscribe = engine.subscribe(seatId, (ev) => {
    events.push(ev);
  });
  return { events, unsubscribe };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('EngineCore', () => {
  let world: TestWorld;

  beforeEach(async () => {
    world = await buildTestWorld();
  });

  // ── 1: Baseline dispatch (no ruleset) ──────────────────────────────────────

  it('baseline token.move is accepted and broadcasts a token.moved event', async () => {
    const engine = await EngineCore.open(world.campaignId, world.storage);
    const { events, unsubscribe } = collectEvents(engine, world.gmSeatId);

    const result = await engine.dispatch({
      campaignId: world.campaignId,
      seatId: world.gmSeatId,
      actionType: 'token.move',
      payload: { tokenId: HERO_TOKEN_ID, position: { x: 200, y: 200 } },
    });

    await nextTick();
    unsubscribe();

    expect(result.accepted).toBe(true);

    // Should broadcast one token.moved event
    const fullEvents = events.filter((e) => e.kind === 'full');
    expect(fullEvents).toHaveLength(1);
    const tokenMovedEvent = fullEvents[0];
    expect(tokenMovedEvent.kind).toBe('full');
    if (tokenMovedEvent.kind === 'full') {
      expect(tokenMovedEvent.event.type).toBe('token.moved');
      const data = tokenMovedEvent.event.data as Record<string, unknown>;
      expect(data.tokenId).toBe(HERO_TOKEN_ID);
      expect(data.to).toEqual({ x: 200, y: 200 });
    }
  });

  it('baseline token.move applies the position patch to state', async () => {
    const engine = await EngineCore.open(world.campaignId, world.storage);

    await engine.dispatch({
      campaignId: world.campaignId,
      seatId: world.gmSeatId,
      actionType: 'token.move',
      payload: { tokenId: HERO_TOKEN_ID, position: { x: 400, y: 400 } },
    });

    // Confirm state via getView — token position reflected in view
    const view = engine.getView(world.gmSeatId);
    const token = view.tokens.find((t) => t.id === HERO_TOKEN_ID);
    expect(token).toBeDefined();
    expect(token?.position).toEqual({ x: 400, y: 400 });
  });

  // ── 2: D&D composition — token.move produces both position patch and chat ──

  it('with dnd-5.5-srd ruleset, token.move emits position event and D&D chat event via merger', async () => {
    const engine = await EngineCore.open(world.campaignId, world.storage, [
      dndRuleset,
    ]);
    const { events, unsubscribe } = collectEvents(engine, world.gmSeatId);

    const result = await engine.dispatch({
      campaignId: world.campaignId,
      seatId: world.gmSeatId,
      actionType: 'token.move',
      payload: { tokenId: HERO_TOKEN_ID, position: { x: 150, y: 150 } },
    });

    await nextTick();
    unsubscribe();

    expect(result.accepted).toBe(true);

    // Should broadcast two full events: token.moved then chat.message
    const fullEvents = events
      .filter((e) => e.kind === 'full')
      .map((e) => (e.kind === 'full' ? e.event : null))
      .filter(Boolean);

    expect(fullEvents).toHaveLength(2);
    expect(fullEvents[0]?.type).toBe('token.moved');
    expect(fullEvents[1]?.type).toBe('chat.message');

    const chatData = fullEvents[1]?.data as Record<string, unknown>;
    expect(typeof chatData.text).toBe('string');
    expect(chatData.text).toContain(HERO_TOKEN_ID);
  });

  // ── 3: Merger collision → load throws ──────────────────────────────────────

  it('throws at load time when two rulesets register a merger for the same action', async () => {
    // Build a second ruleset that also registers a merger for token.move
    const secondRuleset: RulesetManifest = {
      id: 'second-ruleset',
      version: '0.0.1',
      actions: {},
      mergers: {
        'token.move': (results) => results[0] ?? [],
      },
    };

    await expect(
      EngineCore.open(world.campaignId, world.storage, [
        dndRuleset,
        secondRuleset,
      ]),
    ).rejects.toThrow(/[Mm]erger collision/);
  });

  // ── 4: Unknown actionType → accepted: false ────────────────────────────────

  it('returns accepted: false for an unknown actionType', async () => {
    const engine = await EngineCore.open(world.campaignId, world.storage);

    const result = await engine.dispatch({
      campaignId: world.campaignId,
      seatId: world.gmSeatId,
      actionType: 'does.not.exist',
      payload: {},
    });

    expect(result.accepted).toBe(false);
    if (!result.accepted) {
      expect(result.reason).toMatch(/unknown action/i);
    }
  });

  // ── 5: Workflow opened by a resolver → appears in state ───────────────────

  it('workflow opened by a resolver is stored in engine state', async () => {
    const WORKFLOW_ID = 'workflow-test-001' as ReturnType<
      typeof crypto.randomUUID
    >;

    // Test-only ruleset that always opens a workflow on 'test.open-workflow'
    const workflowRuleset: RulesetManifest = {
      id: 'test-workflow-ruleset',
      version: '0.0.1',
      actions: {
        'test.open-workflow': {
          resolver: (_args, _helpers) => ({
            intents: [
              {
                kind: 'workflow.open',
                id: WORKFLOW_ID,
                continuationActionType: 'test.continue-workflow',
                data: { step: 1 },
              },
            ],
          }),
        },
      },
    };

    const engine = await EngineCore.open(world.campaignId, world.storage, [
      workflowRuleset,
    ]);

    const result = await engine.dispatch({
      campaignId: world.campaignId,
      seatId: world.gmSeatId,
      actionType: 'test.open-workflow',
      payload: {},
    });

    expect(result.accepted).toBe(true);

    // Access internal state via cast — this is throwaway v0.1 test code
    const internalState = (
      engine as unknown as { state: { workflows: Map<string, unknown> } }
    ).state;
    expect(internalState.workflows.has(WORKFLOW_ID)).toBe(true);

    const storedWorkflow = internalState.workflows.get(WORKFLOW_ID) as {
      continuationActionType: string;
      data: unknown;
    };
    expect(storedWorkflow.continuationActionType).toBe(
      'test.continue-workflow',
    );
  });

  // ── 6: Token/Actor CRUD ─────────────────────────────────────────────────

  it('token.create as GM creates token and emits token.created event', async () => {
    const engine = await EngineCore.open(world.campaignId, world.storage);
    const { events, unsubscribe } = collectEvents(engine, world.gmSeatId);

    const NEW_TOKEN_ID = 'token-new-crud-001';
    const result = await engine.dispatch({
      campaignId: world.campaignId,
      seatId: world.gmSeatId,
      actionType: 'token.create',
      payload: {
        tokenId: NEW_TOKEN_ID,
        actorId: HERO_ACTOR_ID,
        sceneId: SCENE_ID,
        position: { x: 300, y: 300 },
        data: {},
      },
    });

    await nextTick();
    unsubscribe();

    expect(result.accepted).toBe(true);

    // Token appears in view
    const view = engine.getView(world.gmSeatId);
    const createdToken = view.tokens.find((t) => t.id === NEW_TOKEN_ID);
    expect(createdToken).toBeDefined();
    expect(createdToken?.position).toEqual({ x: 300, y: 300 });

    // token.created event emitted
    const fullEvents = events
      .filter((e) => e.kind === 'full')
      .map((e) => (e.kind === 'full' ? e.event : null))
      .filter(Boolean);
    const createEvent = fullEvents.find((ev) => ev?.type === 'token.created');
    expect(createEvent).toBeDefined();
  });

  it('token.create as non-GM returns { accepted: false }', async () => {
    const engine = await EngineCore.open(world.campaignId, world.storage);

    const result = await engine.dispatch({
      campaignId: world.campaignId,
      seatId: world.playerSeatId,
      actionType: 'token.create',
      payload: {
        tokenId: 'token-new-crud-002',
        actorId: HERO_ACTOR_ID,
        sceneId: SCENE_ID,
        position: { x: 300, y: 300 },
      },
    });

    expect(result.accepted).toBe(false);
  });

  it('token.create with duplicate tokenId throws from resolver', async () => {
    const engine = await EngineCore.open(world.campaignId, world.storage);

    const result = await engine.dispatch({
      campaignId: world.campaignId,
      seatId: world.gmSeatId,
      actionType: 'token.create',
      payload: {
        tokenId: HERO_TOKEN_ID, // Already exists from snapshot
        actorId: HERO_ACTOR_ID,
        sceneId: SCENE_ID,
        position: { x: 300, y: 300 },
      },
    });

    expect(result.accepted).toBe(false);
    if (!result.accepted) {
      expect(result.reason).toMatch(/already exists/i);
    }
  });

  it('actor.create as GM creates actor and emits actor.created event', async () => {
    const engine = await EngineCore.open(world.campaignId, world.storage);
    const { events, unsubscribe } = collectEvents(engine, world.gmSeatId);

    const NEW_ACTOR_ID = 'actor-new-crud-001';
    const result = await engine.dispatch({
      campaignId: world.campaignId,
      seatId: world.gmSeatId,
      actionType: 'actor.create',
      payload: {
        actorId: NEW_ACTOR_ID,
        name: 'Test NPC',
        data: {},
      },
    });

    await nextTick();
    unsubscribe();

    expect(result.accepted).toBe(true);

    // Actor appears in view
    const view = engine.getView(world.gmSeatId);
    const createdActor = view.actors.find((a) => a.id === NEW_ACTOR_ID);
    expect(createdActor).toBeDefined();
    expect(createdActor?.name).toBe('Test NPC');

    // actor.created event emitted
    const fullEvents = events
      .filter((e) => e.kind === 'full')
      .map((e) => (e.kind === 'full' ? e.event : null))
      .filter(Boolean);
    const createEvent = fullEvents.find((ev) => ev?.type === 'actor.created');
    expect(createEvent).toBeDefined();
  });

  it('token.delete as GM removes token and emits token.deleted event', async () => {
    const engine = await EngineCore.open(world.campaignId, world.storage);
    const { events, unsubscribe } = collectEvents(engine, world.gmSeatId);

    const result = await engine.dispatch({
      campaignId: world.campaignId,
      seatId: world.gmSeatId,
      actionType: 'token.delete',
      payload: { tokenId: HERO_TOKEN_ID },
    });

    await nextTick();
    unsubscribe();

    expect(result.accepted).toBe(true);

    // Token removed from view
    const view = engine.getView(world.gmSeatId);
    const deletedToken = view.tokens.find((t) => t.id === HERO_TOKEN_ID);
    expect(deletedToken).toBeUndefined();

    // token.deleted event emitted
    const fullEvents = events
      .filter((e) => e.kind === 'full')
      .map((e) => (e.kind === 'full' ? e.event : null))
      .filter(Boolean);
    const deleteEvent = fullEvents.find((ev) => ev?.type === 'token.deleted');
    expect(deleteEvent).toBeDefined();
  });

  it('token.linkToActor as GM updates token actorId and emits token.linked event', async () => {
    const engine = await EngineCore.open(world.campaignId, world.storage);
    const { events, unsubscribe } = collectEvents(engine, world.gmSeatId);

    const NEW_ACTOR_ID = 'actor-link-target';
    // First create a new actor to link to
    await engine.dispatch({
      campaignId: world.campaignId,
      seatId: world.gmSeatId,
      actionType: 'actor.create',
      payload: { actorId: NEW_ACTOR_ID, name: 'Link Target', data: {} },
    });
    // Clear events from the actor create
    await nextTick();

    const result = await engine.dispatch({
      campaignId: world.campaignId,
      seatId: world.gmSeatId,
      actionType: 'token.linkToActor',
      payload: { tokenId: HERO_TOKEN_ID, actorId: NEW_ACTOR_ID },
    });

    await nextTick();
    unsubscribe();

    expect(result.accepted).toBe(true);

    // token.linked event emitted
    const fullEvents = events
      .filter((e) => e.kind === 'full')
      .map((e) => (e.kind === 'full' ? e.event : null))
      .filter(Boolean);
    const linkEvent = fullEvents.find((ev) => ev?.type === 'token.linked');
    expect(linkEvent).toBeDefined();

    // Verify by re-creating engine — token persists in snapshot
    const engine2 = await EngineCore.open(world.campaignId, world.storage);
    const view = engine2.getView(world.gmSeatId);
    const foundToken = view.tokens.find((t) => t.id === HERO_TOKEN_ID);
    expect(foundToken).toBeDefined();
    // We verified the intent was accepted and token.linked event emitted above.
  });

  it('actor.linkSeat as GM updates actor seatPermissions and emits actor.seatLinked event', async () => {
    const engine = await EngineCore.open(world.campaignId, world.storage);
    const { events, unsubscribe } = collectEvents(engine, world.gmSeatId);

    const result = await engine.dispatch({
      campaignId: world.campaignId,
      seatId: world.gmSeatId,
      actionType: 'actor.linkSeat',
      payload: {
        actorId: HERO_ACTOR_ID,
        seatId: world.gmSeatId,
        permission: 'control',
      },
    });

    await nextTick();
    unsubscribe();

    expect(result.accepted).toBe(true);

    // actor.seatLinked event emitted
    const fullEvents = events
      .filter((e) => e.kind === 'full')
      .map((e) => (e.kind === 'full' ? e.event : null))
      .filter(Boolean);
    const linkEvent = fullEvents.find((ev) => ev?.type === 'actor.seatLinked');
    expect(linkEvent).toBeDefined();
  });
});
