/**
 * Campaign state management using Svelte 5 runes.
 *
 * This module holds the current campaign state as a mirror of the server.
 * Contains all data shared across all seats: actors, tokens, scenes, effects, events.
 * Updated by server deltas via the WebSocket connection.
 */

import { SvelteMap } from 'svelte/reactivity';
import type {
  Actor,
  Token,
  Scene,
  Position,
  SeatView,
  GameEvent as SharedGameEvent,
} from '@hearth-vtt/shared';
import { viewportState } from './viewport.svelte';
import { notificationState } from './notifications.svelte';

// ============================================================================
// Types
// ============================================================================

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
export class CampaignState {
  campaignId = $state<string | null>(null);
  campaignName = $state<string>('');
  activeSceneId = $state<string | null>(null);

  actors = new SvelteMap<string, Actor>();
  tokens = new SvelteMap<string, Token>();
  scenes = new SvelteMap<string, Scene>();
  effects = new SvelteMap<string, Effect>();
  events = $state<GameEvent[]>([]); // Recent events for chat log

  maxEvents = $state<number>(200); // Configurable

  /**
   * Token IDs that have been moved optimistically and their original positions.
   * Used to snap back if the server rejects the move action.
   */
  pendingMoveOriginals = new Map<string, Position>();

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
   * Get actors visible to a specific seat (any permission level: control or read).
   */
  getActorsForSeat(seatId: string): Actor[] {
    return Array.from(this.actors.values()).filter(
      (a) => seatId in a.seatPermissions,
    );
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
  // Token Mutation Methods
  // ============================================================================

  /**
   * Move a token optimistically on the client before the server confirms.
   *
   * Saves the original position so that `revertOptimisticMoves()` can
   * snap back if the server rejects the action.
   */
  moveTokenOptimistic(tokenId: string, position: Position) {
    const token = this.tokens.get(tokenId);
    if (!token) return;
    // Only record the original position on the first pending move for a token.
    if (!this.pendingMoveOriginals.has(tokenId)) {
      this.pendingMoveOriginals.set(tokenId, token.position);
    }
    this.tokens.set(tokenId, { ...token, position });
  }

  /**
   * Revert all pending optimistic token moves.
   *
   * Called when the server returns an ACTION_REJECTED or DISPATCH_ERROR.
   */
  revertOptimisticMoves() {
    for (const [tokenId, originalPosition] of this.pendingMoveOriginals) {
      const token = this.tokens.get(tokenId);
      if (token) {
        this.tokens.set(tokenId, { ...token, position: originalPosition });
      }
    }
    this.pendingMoveOriginals.clear();
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
   * Apply a full SeatView snapshot received from the server.
   *
   * Called on initial connect, reconnect after a seq gap, or explicit
   * `view.request`. Replaces all local state from the audience-filtered view.
   */
  applyView(view: SeatView) {
    this.campaignId = view.campaignId;
    this.pendingMoveOriginals.clear();

    // Scene
    this.scenes.clear();
    if (view.scene) {
      this.scenes.set(view.scene.id, view.scene);
      this.activeSceneId = view.scene.id;
    } else {
      this.activeSceneId = null;
    }

    // Tokens visible to this seat
    this.tokens.clear();
    view.tokens.forEach((t) => this.tokens.set(t.id, t));

    // Actors this seat can access
    this.actors.clear();
    view.actors.forEach((a) => this.actors.set(a.id, a));

    // Rebuild event log from recent events in the view
    this.events = view.recentEvents
      .slice(-this.maxEvents)
      .map((e) => this.#toUIEvent(e));

    console.log(
      '[CampaignState] View applied',
      view.campaignId,
      'seq',
      view.lastSeq,
    );
  }

  /**
   * Apply an authoritative full GameEvent received from the server.
   *
   * Redacted events are handled by the WS client (seq advance only); this
   * method receives only full events.
   */
  applyEvent(event: SharedGameEvent) {
    switch (event.type) {
      case 'token.moved': {
        const d = event.data as { tokenId: string; to: Position };
        const token = this.tokens.get(d.tokenId);
        if (token) {
          this.tokens.set(d.tokenId, { ...token, position: d.to });
        }
        // Clear pending optimistic move for this token; server position is now authoritative.
        this.pendingMoveOriginals.delete(d.tokenId);
        break;
      }

      case 'chat.sent': {
        this.appendEvent(this.#toUIEvent(event));
        break;
      }

      case 'dice.rolled': {
        this.appendEvent(this.#toUIEvent(event));
        break;
      }

      case 'fog.revealed': {
        // Only authoritative fog events update the exploration mask.
        const d = event.data as { polygon: unknown };
        viewportState.visibilityMask = d.polygon;
        break;
      }

      default:
        // Unknown event types are logged but do not cause errors.
        console.log(
          '[CampaignState] Unhandled event type:',
          event.type,
          event.id,
        );
    }
  }

  /**
   * Set the entire campaign state (e.g., on initial sync).
   *
   * @deprecated Use `applyView` instead. Kept for backward compatibility
   *   with mock-data population. Will be removed in the cleanup step.
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
   * @deprecated Superseded by `applyEvent`. Kept until old protocol types are
   *   removed in the cleanup step.
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
    this.pendingMoveOriginals.clear();
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Transform a shared `GameEvent` from the server protocol into the
   * client-side UI event format used by the chat log and notification area.
   */
  #toUIEvent(e: SharedGameEvent): GameEvent {
    const base = { id: e.id, timestamp: Date.parse(e.time) };

    switch (e.type) {
      case 'chat.sent': {
        const d = e.data as { text: string; displayName: string };
        return {
          ...base,
          type: 'chat.message',
          message: d.text,
          actorName: d.displayName,
        };
      }
      case 'dice.rolled': {
        const d = e.data as {
          count: number;
          sides: number;
          rolls: number[];
          total: number;
          formula: string;
          displayName: string;
        };
        return {
          ...base,
          type: 'roll.result',
          actorName: d.displayName,
          formula: d.formula,
          total: d.total,
          dice: d.rolls.map((r) => ({ sides: d.sides, result: r })),
        };
      }
      default:
        return { ...base, type: 'system', message: `[${e.type}]` };
    }
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
      background: { kind: 'image', url: '/maps/tavern.jpg' },
      gridType: 'square',
      gridSize: 50,
      gridScale: '5ft',
      width: 2000,
      height: 1500,
    };

    const dungeonScene: Scene = {
      id: 'scene-dungeon',
      name: 'Crypt of the Forgotten King',
      background: { kind: 'image', url: '/maps/dungeon.jpg' },
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
    // Demonstrates all granular seat permission scenarios:
    //   kael:    1 seat → 1 actor (simple 1:1 control)
    //   lyra:    1 seat → 2 actors (lyra + pip her familiar)
    //   thadric: seat-player-3 controls; seat-player-1 has read-only access
    //   zara:    1 seat → 1 actor (simple 1:1 control)
    const kael: Actor = {
      id: 'actor-kael',
      name: 'Kael Sunblade',
      type: 'pc',
      seatPermissions: { 'seat-player-1': 'control' },
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
      seatPermissions: { 'seat-player-2': 'control' },
      hp: { current: 38, max: 42 },
      ac: 15,
      level: 7,
      class: 'Wizard',
      isConcentrating: true,
      conditions: ['Concentrating: Haste'],
    };

    // Pip is Lyra's pseudodragon familiar — demonstrates 1 seat controlling 2 actors.
    const pip: Actor = {
      id: 'actor-pip',
      name: 'Pip (Familiar)',
      type: 'pc',
      seatPermissions: { 'seat-player-2': 'control' },
      hp: { current: 10, max: 10 },
      ac: 13,
    };

    const thadric: Actor = {
      id: 'actor-thadric',
      name: 'Thadric Ironfoot',
      type: 'pc',
      // seat-player-1 has read access (can see Thadric's pills but cannot move him).
      seatPermissions: { 'seat-player-3': 'control', 'seat-player-1': 'read' },
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
      seatPermissions: { 'seat-player-4': 'control' },
      hp: { current: 41, max: 48 },
      ac: 17,
      level: 7,
      class: 'Rogue',
      isConcentrating: false,
      conditions: ['Hidden'],
    };

    this.actors.set(kael.id, kael);
    this.actors.set(lyra.id, lyra);
    this.actors.set(pip.id, pip);
    this.actors.set(thadric.id, thadric);
    this.actors.set(zara.id, zara);

    // Create GM-controlled actors (empty seatPermissions — accessible only via GM seatRole).
    const goblin1: Actor = {
      id: 'actor-goblin-1',
      name: 'Goblin Scout',
      type: 'monster',
      seatPermissions: {},
      hp: { current: 7, max: 7 },
      ac: 13,
    };

    const goblin2: Actor = {
      id: 'actor-goblin-2',
      name: 'Goblin Warrior',
      type: 'monster',
      seatPermissions: {},
      hp: { current: 0, max: 7 },
      ac: 13,
      conditions: ['Dead'],
    };

    const necromancer: Actor = {
      id: 'actor-necromancer',
      name: 'Malakar the Dark',
      type: 'npc',
      seatPermissions: {},
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

    this.tokens.set('token-pip', {
      id: 'token-pip',
      actorId: pip.id,
      sceneId: tavernScene.id,
      position: { x: 370, y: 380 },
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

    // Sync viewport with active scene
    const activeScene = this.getScene(this.activeSceneId!);
    if (activeScene) {
      viewportState.setMapName(activeScene.name);
      viewportState.setGrid(
        activeScene.gridType,
        activeScene.gridSize,
        activeScene.gridScale,
      );
    }
  }
}

/**
 * Singleton campaign state instance.
 */
export const campaignState = new CampaignState();

// Load mock data on module initialization (development only).
// Phase 3: Replace with server-driven initial state (sync.initial WS message).
campaignState.loadMockData();
notificationState.loadMockNotifications();
import('./connection.svelte').then(({ connectionState }) => {
  connectionState.handleWelcome({
    version: '1.0.0',
    seatId: 'seat-player-2',
    seatRole: 'gm',
    campaignId: campaignState.campaignId!,
  });
});
