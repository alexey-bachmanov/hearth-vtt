import { describe, it, expect, beforeEach } from 'vitest';
import { campaignState } from './campaign.svelte.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal fixture used by accessor tests. */
function loadFixture() {
  campaignState.setInitialState({
    campaignId: 'c-1',
    campaignName: 'Test Campaign',
    activeSceneId: 's-1',
    actors: [
      {
        id: 'a-1',
        name: 'Hero',
        seatPermissions: { 'seat-1': 'control' },
        data: {},
      },
      {
        id: 'a-2',
        name: 'Villain',
        seatPermissions: {},
        data: {},
      },
    ],
    tokens: [
      {
        id: 't-1',
        actorId: 'a-1',
        sceneId: 's-1',
        name: 'Hero',
        imageUrl: '',
        position: { x: 0, y: 0 },
        size: 1,
        data: {},
      },
    ],
    scenes: [
      {
        id: 's-1',
        name: 'Forest',
        gridType: 'square',
        gridSize: 50,
        gridScale: '5ft',
        width: 1000,
        height: 1000,
        data: {},
      },
    ],
    effects: [],
  });
}

beforeEach(() => {
  campaignState.clear();
});

// ---------------------------------------------------------------------------
// Accessor methods
// ---------------------------------------------------------------------------

describe('getActor()', () => {
  it('returns the actor with the matching ID', () => {
    loadFixture();
    const actor = campaignState.getActor('a-1');
    expect(actor).toBeDefined();
    expect(actor?.name).toBe('Hero');
  });

  it('returns undefined for a non-existent ID', () => {
    loadFixture();
    expect(campaignState.getActor('nonexistent')).toBeUndefined();
  });
});

describe('getToken()', () => {
  it('returns the token with the matching ID', () => {
    loadFixture();
    const token = campaignState.getToken('t-1');
    expect(token).toBeDefined();
    expect(token?.id).toBe('t-1');
  });
});

describe('getScene()', () => {
  it('returns the scene with the matching ID', () => {
    loadFixture();
    const scene = campaignState.getScene('s-1');
    expect(scene).toBeDefined();
    expect(scene?.name).toBe('Forest');
  });
});

describe('getActiveScene()', () => {
  it('returns the scene whose ID matches activeSceneId', () => {
    loadFixture();
    const scene = campaignState.getActiveScene();
    expect(scene).toBeDefined();
    expect(scene?.id).toBe('s-1');
  });

  it('returns undefined when activeSceneId is null', () => {
    // clear() leaves activeSceneId as null
    expect(campaignState.getActiveScene()).toBeUndefined();
  });
});

describe('getPartyActors()', () => {
  it('returns actors with seat permissions (proxy for party actors)', () => {
    loadFixture();
    const party = campaignState.getPartyActors();
    // a-1 has seatPermissions, a-2 has empty seatPermissions
    expect(party).toHaveLength(1);
    expect(party[0].id).toBe('a-1');
  });
});

describe('getActorsForSeat()', () => {
  it('returns actors with any permission for the given seat', () => {
    loadFixture();
    const actors = campaignState.getActorsForSeat('seat-1');
    expect(actors).toHaveLength(1);
    expect(actors[0].id).toBe('a-1');
  });

  it('returns an empty array for a seat with no actors', () => {
    loadFixture();
    expect(campaignState.getActorsForSeat('seat-unknown')).toHaveLength(0);
  });
});

describe('getActiveSceneTokens()', () => {
  it('returns tokens in the active scene', () => {
    loadFixture();
    const tokens = campaignState.getActiveSceneTokens();
    expect(tokens).toHaveLength(1);
    expect(tokens[0].sceneId).toBe('s-1');
  });

  it('returns an empty array when activeSceneId is null', () => {
    expect(campaignState.getActiveSceneTokens()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Event log
// ---------------------------------------------------------------------------

function makeEvent(id: string) {
  return {
    id,
    timestamp: Date.now(),
    type: 'chat.message' as const,
    message: `event ${id}`,
  };
}

describe('appendEvent()', () => {
  it('grows the events array by 1', () => {
    campaignState.appendEvent(makeEvent('e-1'));
    expect(campaignState.events).toHaveLength(1);
  });

  it('trims to maxEvents (200) when 201 events are appended one-by-one', () => {
    for (let i = 0; i < 201; i++) {
      campaignState.appendEvent(makeEvent(`e-${i}`));
    }
    expect(campaignState.events).toHaveLength(200);
    // The oldest event (id 'e-0') should have been dropped
    expect(campaignState.events[0].id).toBe('e-1');
  });
});

describe('appendEvents()', () => {
  it('grows the events array by the number of events provided', () => {
    campaignState.appendEvents([makeEvent('e-1'), makeEvent('e-2')]);
    expect(campaignState.events).toHaveLength(2);
  });

  it('trims to maxEvents (200) when a bulk append exceeds the limit', () => {
    const batch = Array.from({ length: 201 }, (_, i) => makeEvent(`e-${i}`));
    campaignState.appendEvents(batch);
    expect(campaignState.events).toHaveLength(200);
    // The oldest event (id 'e-0') should have been dropped
    expect(campaignState.events[0].id).toBe('e-1');
  });
});

// ---------------------------------------------------------------------------
// clear()
// ---------------------------------------------------------------------------

describe('clear()', () => {
  it('sets campaignId to null', () => {
    loadFixture();
    campaignState.clear();
    expect(campaignState.campaignId).toBeNull();
  });

  it('empties the actors map', () => {
    loadFixture();
    campaignState.clear();
    expect(campaignState.actors.size).toBe(0);
  });

  it('empties the tokens map', () => {
    loadFixture();
    campaignState.clear();
    expect(campaignState.tokens.size).toBe(0);
  });

  it('empties the events array', () => {
    campaignState.appendEvent(makeEvent('e-1'));
    campaignState.clear();
    expect(campaignState.events).toHaveLength(0);
  });
});
