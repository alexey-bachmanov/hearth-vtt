import { describe, it, expect, beforeEach } from 'vitest';
import { seatPermissions } from './seatPermissions.svelte.js';
import { campaignState } from './campaign.svelte.js';
import { connectionState } from './connection.svelte.js';

// ---------------------------------------------------------------------------
// Shared fixture helpers
// ---------------------------------------------------------------------------

/**
 * Minimal campaign state with:
 *   - a-control  PC  seat-a: 'control'
 *   - a-read     PC  seat-a: 'read', seat-b: 'control'
 *   - a-gm-only  NPC {}  (GM only)
 *
 * Tokens:
 *   - t-control  → a-control
 *   - t-read     → a-read
 *   - t-gm-only  → a-gm-only
 */
function loadFixture() {
  campaignState.setInitialState({
    campaignId: 'test-campaign',
    campaignName: 'Test',
    activeSceneId: 'scene-1',
    actors: [
      {
        id: 'a-control',
        name: 'Kael',
        type: 'pc',
        seatPermissions: { 'seat-a': 'control' },
        hp: { current: 30, max: 30 },
        ac: 16,
      },
      {
        id: 'a-read',
        name: 'Thadric',
        type: 'pc',
        // seat-a can view but not control; seat-b fully controls
        seatPermissions: { 'seat-a': 'read', 'seat-b': 'control' },
        hp: { current: 20, max: 20 },
        ac: 14,
      },
      {
        id: 'a-gm-only',
        name: 'Goblin',
        type: 'npc',
        seatPermissions: {},
        hp: { current: 5, max: 5 },
        ac: 10,
      },
    ],
    tokens: [
      {
        id: 't-control',
        actorId: 'a-control',
        sceneId: 'scene-1',
        position: { x: 0, y: 0 },
        size: 1,
      },
      {
        id: 't-read',
        actorId: 'a-read',
        sceneId: 'scene-1',
        position: { x: 50, y: 0 },
        size: 1,
      },
      {
        id: 't-gm-only',
        actorId: 'a-gm-only',
        sceneId: 'scene-1',
        position: { x: 100, y: 0 },
        size: 1,
      },
    ],
    scenes: [
      {
        id: 'scene-1',
        name: 'Test Scene',
        mapImageUrl: '',
        gridType: 'square',
        gridSize: 50,
        gridScale: '5ft',
        width: 1000,
        height: 1000,
      },
    ],
    effects: [],
  });
}

beforeEach(() => {
  campaignState.clear();
  connectionState.reset();
});

// ---------------------------------------------------------------------------
// canSeeGMTools
// ---------------------------------------------------------------------------

describe('canSeeGMTools', () => {
  it('returns true when seatRole is "gm"', () => {
    connectionState.handleWelcome({ seatRole: 'gm' });
    expect(seatPermissions.canSeeGMTools).toBe(true);
  });

  it('returns false when seatRole is "player"', () => {
    connectionState.handleWelcome({ seatRole: 'player' });
    expect(seatPermissions.canSeeGMTools).toBe(false);
  });

  it('returns false when seatRole is "spectator"', () => {
    connectionState.handleWelcome({ seatRole: 'spectator' });
    expect(seatPermissions.canSeeGMTools).toBe(false);
  });

  it('returns false when seatRole is null (unauthenticated)', () => {
    expect(seatPermissions.canSeeGMTools).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// canDragToken
// ---------------------------------------------------------------------------

describe('canDragToken', () => {
  it('returns true for GM regardless of the token', () => {
    loadFixture();
    connectionState.handleWelcome({ seatRole: 'gm', seatId: 'seat-gm' });
    expect(seatPermissions.canDragToken('t-gm-only')).toBe(true);
    expect(seatPermissions.canDragToken('t-control')).toBe(true);
  });

  it('returns true for a player seat that has "control" over the token\'s actor', () => {
    loadFixture();
    connectionState.handleWelcome({ seatRole: 'player', seatId: 'seat-a' });
    expect(seatPermissions.canDragToken('t-control')).toBe(true);
  });

  it('returns false for a player seat that has only "read" on the token\'s actor', () => {
    loadFixture();
    connectionState.handleWelcome({ seatRole: 'player', seatId: 'seat-a' });
    expect(seatPermissions.canDragToken('t-read')).toBe(false);
  });

  it("returns false for a player seat with no permission on the token's actor", () => {
    loadFixture();
    connectionState.handleWelcome({ seatRole: 'player', seatId: 'seat-a' });
    expect(seatPermissions.canDragToken('t-gm-only')).toBe(false);
  });

  it('returns false when the token does not exist', () => {
    loadFixture();
    connectionState.handleWelcome({ seatRole: 'player', seatId: 'seat-a' });
    expect(seatPermissions.canDragToken('t-nonexistent')).toBe(false);
  });

  it('returns false when there is no seatId (spectator / unauthenticated)', () => {
    loadFixture();
    connectionState.handleWelcome({ seatRole: 'spectator' });
    expect(seatPermissions.canDragToken('t-control')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// canOpenRadialMenu
// ---------------------------------------------------------------------------

describe('canOpenRadialMenu', () => {
  it('returns true for GM regardless of the actor', () => {
    loadFixture();
    connectionState.handleWelcome({ seatRole: 'gm', seatId: 'seat-gm' });
    expect(seatPermissions.canOpenRadialMenu('a-gm-only')).toBe(true);
    expect(seatPermissions.canOpenRadialMenu('a-control')).toBe(true);
  });

  it('returns true for a player seat that has "control" over the actor', () => {
    loadFixture();
    connectionState.handleWelcome({ seatRole: 'player', seatId: 'seat-a' });
    expect(seatPermissions.canOpenRadialMenu('a-control')).toBe(true);
  });

  it('returns false for a player seat that has only "read" on the actor', () => {
    loadFixture();
    connectionState.handleWelcome({ seatRole: 'player', seatId: 'seat-a' });
    expect(seatPermissions.canOpenRadialMenu('a-read')).toBe(false);
  });

  it('returns false for a player seat with no permission on the actor', () => {
    loadFixture();
    connectionState.handleWelcome({ seatRole: 'player', seatId: 'seat-a' });
    expect(seatPermissions.canOpenRadialMenu('a-gm-only')).toBe(false);
  });

  it('returns false when the actor does not exist', () => {
    loadFixture();
    connectionState.handleWelcome({ seatRole: 'player', seatId: 'seat-a' });
    expect(seatPermissions.canOpenRadialMenu('a-nonexistent')).toBe(false);
  });

  it('returns false when there is no seatId (spectator / unauthenticated)', () => {
    loadFixture();
    connectionState.handleWelcome({ seatRole: 'spectator' });
    expect(seatPermissions.canOpenRadialMenu('a-control')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// visibleActorPills
// ---------------------------------------------------------------------------

describe('visibleActorPills', () => {
  it('returns all PC actors for a GM seat', () => {
    loadFixture();
    connectionState.handleWelcome({ seatRole: 'gm', seatId: 'seat-gm' });
    const pills = seatPermissions.visibleActorPills;
    const ids = pills.map((a) => a.id);
    expect(ids).toContain('a-control');
    expect(ids).toContain('a-read');
    expect(ids).not.toContain('a-gm-only'); // NPC excluded by getPartyActors()
  });

  it('returns only actors with any permission for a player seat', () => {
    loadFixture();
    connectionState.handleWelcome({ seatRole: 'player', seatId: 'seat-a' });
    const pills = seatPermissions.visibleActorPills;
    const ids = pills.map((a) => a.id);
    expect(ids).toContain('a-control'); // 'control' → visible
    expect(ids).toContain('a-read'); // 'read' → visible
    expect(ids).not.toContain('a-gm-only'); // no permission → hidden
  });

  it('excludes actors the player has no entry for', () => {
    loadFixture();
    connectionState.handleWelcome({ seatRole: 'player', seatId: 'seat-b' });
    const pills = seatPermissions.visibleActorPills;
    const ids = pills.map((a) => a.id);
    expect(ids).toContain('a-read'); // seat-b has 'control' on a-read
    expect(ids).not.toContain('a-control'); // seat-b has no entry
    expect(ids).not.toContain('a-gm-only');
  });

  it('returns an empty array for a spectator', () => {
    loadFixture();
    connectionState.handleWelcome({ seatRole: 'spectator' });
    expect(seatPermissions.visibleActorPills).toHaveLength(0);
  });

  it('returns an empty array when unauthenticated (null role, no seatId)', () => {
    loadFixture();
    expect(seatPermissions.visibleActorPills).toHaveLength(0);
  });
});
