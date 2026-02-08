/**
 * Campaign state management using Svelte 5 runes.
 *
 * This module holds the current campaign state as a mirror of the server.
 * Contains all data shared across all seats: actors, tokens, scenes, effects, events.
 * Updated by server deltas via the WebSocket connection.
 */

import type { GridType, Position } from './types';

// ============================================================================
// Types
// ============================================================================

export interface Actor {
  id: string;
  name: string;
  type: 'pc' | 'npc' | 'monster';
  ownerId: string | null; // seatId for PCs, null for GM-controlled
  hp: { current: number; max: number };
  ac: number;
  level?: number;
  class?: string;
  isConcentrating?: boolean;
  conditions?: string[];
}

export interface Token {
  id: string;
  actorId: string;
  sceneId: string;
  position: Position;
  size: number; // grid squares (e.g., 1 for medium, 2 for large)
  rotation?: number; // degrees
  hidden?: boolean; // GM only
}

export interface Scene {
  id: string;
  name: string;
  mapImageUrl: string;
  gridType: GridType;
  gridSize: number; // pixels per grid square
  gridScale: string; // e.g., "5ft", "10m"
  width: number; // pixels
  height: number; // pixels
}

export interface Effect {
  id: string;
  name: string;
  targetActorId: string;
  duration: number; // rounds remaining
  isConcentration?: boolean;
}

export interface GameEvent {
  id: string;
  timestamp: number;
  type:
    | 'chat.message'
    | 'roll.result'
    | 'damage.applied'
    | 'effect.applied'
    | 'system';
  actorId?: string;
  actorName?: string;
  message?: string;
  // Roll-specific
  formula?: string;
  total?: number;
  dice?: { sides: number; result: number }[];
  // Damage-specific
  damage?: number;
  damageType?: string;
  target?: string;
  // Effect-specific
  effectName?: string;
}

// ============================================================================
// CampaignState Class
// ============================================================================

/**
 * CampaignState is the client-side mirror of server campaign state.
 *
 * Contains all game data shared across all seats. Populated with mock data
 * until server sync is implemented. Components read from this store using
 * typed accessor methods.
 */
class CampaignState {
  campaignId = $state<string | null>(null);
  campaignName = $state<string>('');
  activeSceneId = $state<string | null>(null);

  actors = $state<Map<string, Actor>>(new Map());
  tokens = $state<Map<string, Token>>(new Map());
  scenes = $state<Map<string, Scene>>(new Map());
  effects = $state<Map<string, Effect>>(new Map());
  events = $state<GameEvent[]>([]); // Recent events for chat log

  maxEvents = $state<number>(200); // Configurable

  // ============================================================================
  // Accessor Methods
  // ============================================================================

  /**
   * Get an actor by ID.
   */
  getActor(id: string): Actor | undefined {
    return this.actors.get(id);
  }

  /**
   * Get a token by ID.
   */
  getToken(id: string): Token | undefined {
    return this.tokens.get(id);
  }

  /**
   * Get a scene by ID.
   */
  getScene(id: string): Scene | undefined {
    return this.scenes.get(id);
  }

  /**
   * Get the currently active scene.
   */
  getActiveScene(): Scene | undefined {
    return this.activeSceneId ? this.scenes.get(this.activeSceneId) : undefined;
  }

  /**
   * Get all party-controlled actors (players).
   */
  getPartyActors(): Actor[] {
    return Array.from(this.actors.values()).filter((a) => a.type === 'pc');
  }

  /**
   * Get actors owned by a specific seat.
   */
  getActorsForSeat(seatId: string): Actor[] {
    return Array.from(this.actors.values()).filter((a) => a.ownerId === seatId);
  }

  /**
   * Get all tokens in the active scene.
   */
  getActiveSceneTokens(): Token[] {
    if (!this.activeSceneId) return [];
    return Array.from(this.tokens.values()).filter(
      (t) => t.sceneId === this.activeSceneId,
    );
  }

  /**
   * Get effects on a specific actor.
   */
  getActorEffects(actorId: string): Effect[] {
    return Array.from(this.effects.values()).filter(
      (e) => e.targetActorId === actorId,
    );
  }

  // ============================================================================
  // Event Log Methods
  // ============================================================================

  /**
   * Append a new event to the log.
   */
  appendEvent(event: GameEvent) {
    this.events.push(event);

    // Trim to max size
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }
  }

  /**
   * Append multiple events (e.g., on initial sync or reconnect).
   */
  appendEvents(events: GameEvent[]) {
    this.events.push(...events);

    // Trim to max size
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }
  }

  // ============================================================================
  // Server Sync Methods
  // ============================================================================

  /**
   * Set the entire campaign state (e.g., on initial sync).
   *
   * TODO: Wire to real server sync messages.
   */
  setInitialState(data: {
    campaignId: string;
    campaignName: string;
    activeSceneId: string;
    actors?: Actor[];
    tokens?: Token[];
    scenes?: Scene[];
    effects?: Effect[];
    events?: GameEvent[];
  }) {
    this.campaignId = data.campaignId;
    this.campaignName = data.campaignName;
    this.activeSceneId = data.activeSceneId;

    this.actors.clear();
    data.actors?.forEach((a) => this.actors.set(a.id, a));

    this.tokens.clear();
    data.tokens?.forEach((t) => this.tokens.set(t.id, t));

    this.scenes.clear();
    data.scenes?.forEach((s) => this.scenes.set(s.id, s));

    this.effects.clear();
    data.effects?.forEach((e) => this.effects.set(e.id, e));

    if (data.events) {
      this.events = data.events.slice(-this.maxEvents);
    }

    console.log('[CampaignState] Initial state set', data);
  }

  /**
   * Apply a delta patch from the server.
   *
   * TODO: Implement delta application logic (JSON Patch or similar).
   */
  applyDelta(delta: unknown) {
    console.log('[CampaignState] Delta applied (stub)', delta);
  }

  /**
   * Clear all campaign state (e.g., on logout or campaign switch).
   */
  clear() {
    this.campaignId = null;
    this.campaignName = '';
    this.activeSceneId = null;
    this.actors.clear();
    this.tokens.clear();
    this.scenes.clear();
    this.effects.clear();
    this.events = [];
  }

  // ============================================================================
  // Mock Data Population
  // ============================================================================

  /**
   * Populate with D&D-flavored mock data for development.
   *
   * Creates a rich fantasy campaign with party members, monsters, scenes,
   * and sample events. This will be replaced by real server sync.
   */
  loadMockData() {
    this.campaignId = 'campaign-mock-001';
    this.campaignName = 'The Sundered Crown';

    // Create scenes
    const tavernScene: Scene = {
      id: 'scene-tavern',
      name: 'The Prancing Pony',
      mapImageUrl: '/maps/tavern.jpg',
      gridType: 'square',
      gridSize: 50,
      gridScale: '5ft',
      width: 2000,
      height: 1500,
    };

    const dungeonScene: Scene = {
      id: 'scene-dungeon',
      name: 'Crypt of the Forgotten King',
      mapImageUrl: '/maps/dungeon.jpg',
      gridType: 'square',
      gridSize: 50,
      gridScale: '5ft',
      width: 3000,
      height: 2400,
    };

    this.scenes.set(tavernScene.id, tavernScene);
    this.scenes.set(dungeonScene.id, dungeonScene);
    this.activeSceneId = tavernScene.id;

    // Create party actors (PCs)
    const kael: Actor = {
      id: 'actor-kael',
      name: 'Kael Sunblade',
      type: 'pc',
      ownerId: 'seat-player-1',
      hp: { current: 45, max: 58 },
      ac: 18,
      level: 7,
      class: 'Paladin',
      isConcentrating: false,
      conditions: [],
    };

    const lyra: Actor = {
      id: 'actor-lyra',
      name: 'Lyra Whisperwind',
      type: 'pc',
      ownerId: 'seat-player-2',
      hp: { current: 38, max: 42 },
      ac: 15,
      level: 7,
      class: 'Wizard',
      isConcentrating: true,
      conditions: ['Concentrating: Haste'],
    };

    const thadric: Actor = {
      id: 'actor-thadric',
      name: 'Thadric Ironfoot',
      type: 'pc',
      ownerId: 'seat-player-3',
      hp: { current: 62, max: 72 },
      ac: 16,
      level: 7,
      class: 'Fighter',
      isConcentrating: false,
      conditions: [],
    };

    const zara: Actor = {
      id: 'actor-zara',
      name: 'Zara Swiftarrow',
      type: 'pc',
      ownerId: 'seat-player-4',
      hp: { current: 41, max: 48 },
      ac: 17,
      level: 7,
      class: 'Rogue',
      isConcentrating: false,
      conditions: ['Hidden'],
    };

    this.actors.set(kael.id, kael);
    this.actors.set(lyra.id, lyra);
    this.actors.set(thadric.id, thadric);
    this.actors.set(zara.id, zara);

    // Create GM-controlled actors
    const goblin1: Actor = {
      id: 'actor-goblin-1',
      name: 'Goblin Scout',
      type: 'monster',
      ownerId: null,
      hp: { current: 7, max: 7 },
      ac: 13,
    };

    const goblin2: Actor = {
      id: 'actor-goblin-2',
      name: 'Goblin Warrior',
      type: 'monster',
      ownerId: null,
      hp: { current: 0, max: 7 },
      ac: 13,
      conditions: ['Dead'],
    };

    const necromancer: Actor = {
      id: 'actor-necromancer',
      name: 'Malakar the Dark',
      type: 'npc',
      ownerId: null,
      hp: { current: 52, max: 68 },
      ac: 14,
      level: 9,
      class: 'Necromancer',
      isConcentrating: true,
      conditions: ['Concentrating: Animate Dead'],
    };

    this.actors.set(goblin1.id, goblin1);
    this.actors.set(goblin2.id, goblin2);
    this.actors.set(necromancer.id, necromancer);

    // Create tokens on active scene
    this.tokens.set('token-kael', {
      id: 'token-kael',
      actorId: kael.id,
      sceneId: tavernScene.id,
      position: { x: 300, y: 400 },
      size: 1,
    });

    this.tokens.set('token-lyra', {
      id: 'token-lyra',
      actorId: lyra.id,
      sceneId: tavernScene.id,
      position: { x: 350, y: 400 },
      size: 1,
    });

    this.tokens.set('token-thadric', {
      id: 'token-thadric',
      actorId: thadric.id,
      sceneId: tavernScene.id,
      position: { x: 300, y: 450 },
      size: 1,
    });

    this.tokens.set('token-zara', {
      id: 'token-zara',
      actorId: zara.id,
      sceneId: tavernScene.id,
      position: { x: 350, y: 450 },
      size: 1,
      hidden: true,
    });

    this.tokens.set('token-goblin-1', {
      id: 'token-goblin-1',
      actorId: goblin1.id,
      sceneId: tavernScene.id,
      position: { x: 600, y: 400 },
      size: 1,
    });

    this.tokens.set('token-necromancer', {
      id: 'token-necromancer',
      actorId: necromancer.id,
      sceneId: tavernScene.id,
      position: { x: 800, y: 500 },
      size: 1,
    });

    // Create effects
    this.effects.set('effect-haste', {
      id: 'effect-haste',
      name: 'Haste',
      targetActorId: thadric.id,
      duration: 6,
      isConcentration: true,
    });

    this.effects.set('effect-animate-dead', {
      id: 'effect-animate-dead',
      name: 'Animate Dead',
      targetActorId: necromancer.id,
      duration: 999,
      isConcentration: true,
    });

    // Create sample events
    this.events = [
      {
        id: 'event-1',
        timestamp: Date.now() - 300000,
        type: 'chat.message',
        actorId: kael.id,
        actorName: 'Kael Sunblade',
        message:
          'I stride into the tavern, hand on my sword hilt, scanning for trouble.',
      },
      {
        id: 'event-2',
        timestamp: Date.now() - 240000,
        type: 'roll.result',
        actorId: lyra.id,
        actorName: 'Lyra Whisperwind',
        formula: '1d20+5',
        total: 23,
        dice: [{ sides: 20, result: 18 }],
        message: 'Perception check',
      },
      {
        id: 'event-3',
        timestamp: Date.now() - 180000,
        type: 'chat.message',
        actorName: 'GM',
        message:
          'A cloaked figure in the corner watches you intently. Roll for initiative!',
      },
      {
        id: 'event-4',
        timestamp: Date.now() - 120000,
        type: 'roll.result',
        actorId: thadric.id,
        actorName: 'Thadric Ironfoot',
        formula: '1d20+2',
        total: 19,
        dice: [{ sides: 20, result: 17 }],
        message: 'Initiative',
      },
      {
        id: 'event-5',
        timestamp: Date.now() - 60000,
        type: 'damage.applied',
        actorId: kael.id,
        actorName: 'Kael Sunblade',
        target: 'Goblin Warrior',
        damage: 15,
        damageType: 'slashing',
      },
      {
        id: 'event-6',
        timestamp: Date.now() - 30000,
        type: 'effect.applied',
        actorId: lyra.id,
        actorName: 'Lyra Whisperwind',
        effectName: 'Haste',
        target: 'Thadric Ironfoot',
      },
      {
        id: 'event-7',
        timestamp: Date.now() - 10000,
        type: 'chat.message',
        actorId: zara.id,
        actorName: 'Zara Swiftarrow',
        message: "I'll slip into the shadows and flank the necromancer.",
      },
    ];

    console.log('[CampaignState] Mock data loaded');
  }
}

/**
 * Singleton campaign state instance.
 */
export const campaignState = new CampaignState();

// Load mock data on module initialization (development only)
// TODO: Remove this when server sync is implemented
campaignState.loadMockData();
