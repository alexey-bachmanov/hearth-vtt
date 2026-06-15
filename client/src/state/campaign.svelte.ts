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
  Prompt,
  GameEvent as SharedGameEvent,
  PanelDef,
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

export type GameEvent =
  | {
      id: string;
      timestamp: number;
      type: 'chat.message';
      displayName: string;
      text: string;
    }
  | {
      id: string;
      timestamp: number;
      type: 'dice.rolled';
      displayName: string;
      formula: string;
      rolls: number[];
      total: number;
    }
  | {
      id: string;
      timestamp: number;
      type: 'system';
      message: string;
    };

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

  /**
   * Raw incoming SharedGameEvent buffer for ruleset panel bindings.
   * Stores ALL events the client receives (not just chat-like ones).
   * Scanned by eventState() for initiative.setTo, campaignData.updated, etc.
   */
  sharedGameEvents = $state<SharedGameEvent[]>([]);

  /**
   * Active prompts targeting this seat.
   *
   * Populated from SeatView.activePrompts on connect/resync and updated
   * incrementally via prompt.* events. Each prompt is keyed by promptId.
   * The notification store tracks promptIds as lightweight references;
   * UI components read the full Prompt data from this map.
   */
  activePrompts = new SvelteMap<string, Prompt>();

  maxEvents = $state<number>(200); // Configurable

  /**
   * Token IDs that have been moved optimistically and their original positions.
   * Used to snap back if the server rejects the move action.
   */
  pendingMoveOriginals = new SvelteMap<string, Position>();

  // ============================================================================
  // HearthML Ruleset UI State
  // ============================================================================

  /**
   * Campaign-level opaque data blob managed by the ruleset.
   * Contains computed state like initiative order, party resources, etc.
   * Updated via campaignData.updated events.
   */
  campaignData = $state<Record<string, unknown>>({});

  /**
   * Ruleset panel definitions, cached from the panel.defs WS message.
   * Populated once on connect, cleared only on ruleset.changed (V3).
   */
  rulesetPanels = $state<PanelDef[]>([]);

  /**
   * Optimistic overlay for pending mutations.
   * Keyed by composite key "{entityType}:{entityId}:{key}"
   * E.g., "actor:kael-1:hp" → 37
   * Checked by getCampaignData() before authoritative campaignData.
   */
  optimisticOverlay = new SvelteMap<string, unknown>();

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
   * Get all party-controlled actors.
   *
   * NOTE: The old `type === 'pc'` filter was removed in Engine v0.2 Schema
   * De-D&D-ification. Actor types are now opaque (stored in `data`). This
   * returns actors with any seat permission entries — a rough proxy until
   * ruleset-defined actor classification is designed.
   */
  getPartyActors(): Actor[] {
    return Array.from(this.actors.values()).filter(
      (a) => Object.keys(a.seatPermissions).length > 0,
    );
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
  // Campaign Data Methods
  // ============================================================================

  /**
   * Read campaign data, checking the optimistic overlay first.
   * If the overlay has a pending value, it shadows the authoritative value
   * until confirmOptimistic or revertOptimistic is called.
   */
  getCampaignData(key: string): unknown {
    if (this.optimisticOverlay.has(key)) {
      return this.optimisticOverlay.get(key);
    }
    return this.campaignData[key];
  }

  /**
   * Optimistically set key-value pairs before dispatch confirmation.
   * Cleared by confirmOptimistic on accept or revertOptimistic on reject.
   */
  applyOptimistic(entries: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(entries)) {
      this.optimisticOverlay.set(key, value);
    }
  }

  /**
   * Server confirmed — clear specific overlay entries, revealing authoritative values.
   */
  confirmOptimistic(keys: string[]): void {
    for (const key of keys) this.optimisticOverlay.delete(key);
  }

  /**
   * Server rejected — clear overlay entries, snapping back to authoritative.
   * If no keys provided, clears all (for full dispatch rejection).
   */
  revertOptimistic(keys?: string[]): void {
    if (keys) {
      for (const key of keys) this.optimisticOverlay.delete(key);
    } else {
      this.optimisticOverlay.clear();
    }
  }

  // ============================================================================
  // Event State Methods
  // ============================================================================

  /**
   * Return the most recent SharedGameEvent of the given type, or undefined.
   * Reverse scans the sharedGameEvents array — O(n) but n is capped at 200.
   * Svelte 5 $state tracks reads automatically for reactivity.
   */
  eventState(eventType: string): SharedGameEvent | undefined {
    for (let i = this.sharedGameEvents.length - 1; i >= 0; i--) {
      if (this.sharedGameEvents[i].type === eventType) {
        return this.sharedGameEvents[i];
      }
    }
    return undefined;
  }

  // ============================================================================
  // Panel Defs Methods
  // ============================================================================

  /**
   * Populate rulesetPanels from a panel.defs WS message.
   * Called once on connect (before the view message) or on explicit re-request.
   */
  handlePanelDefs(panels: PanelDef[]): void {
    this.rulesetPanels = panels;
    console.debug('[CampaignState] Panel defs loaded', panels.length, 'panels');
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

    // Campaign data
    this.campaignData = view.campaignData ?? {};
    this.revertOptimistic();

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
    // Only chat-displayable events (chat.message, dice.rolled) are included;
    // CRUD and system events update state via applyEvent() instead.
    this.events = view.recentEvents
      .slice(-this.maxEvents)
      .map((e) => this.#toUIEvent(e))
      .filter((e): e is GameEvent => e !== null);

    // Sync active prompts from the server view.
    // Prompts are server-owned state; the notification store tracks them
    // as lightweight promptId references.
    this.activePrompts.clear();
    view.activePrompts.forEach((p) => {
      this.activePrompts.set(p.id, p);
      notificationState.trackPrompt(p.id, p.title);
    });

    console.debug(
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

      case 'chat.message': {
        this.appendEvent(this.#toUIEvent(event)!);
        const dChat = event.data as { text: string; displayName: string };
        notificationState.feedEntry(
          'info',
          `${dChat.displayName}: ${dChat.text}`,
        );
        break;
      }

      case 'dice.rolled': {
        this.appendEvent(this.#toUIEvent(event)!);
        const dDice = event.data as {
          displayName: string;
          formula: string;
          total: number;
        };
        notificationState.feedEntry(
          'success',
          `${dDice.displayName} rolled ${dDice.total} (${dDice.formula})`,
        );
        break;
      }

      case 'fog.revealed': {
        // Only authoritative fog events update the exploration mask.
        const d = event.data as { polygon: unknown };
        viewportState.visibilityMask = d.polygon;
        break;
      }

      // ── Token CRUD ────────────────────────────────────────────────────────

      case 'token.created': {
        const d = event.data as {
          tokenId: string;
          actorId: string;
          sceneId: string;
          position: { x: number; y: number };
        };
        this.tokens.set(d.tokenId, {
          id: d.tokenId,
          actorId: d.actorId,
          sceneId: d.sceneId,
          name: '',
          imageUrl: '',
          position: d.position,
          size: 1,
          hidden: false,
          data: {},
        });
        break;
      }

      case 'token.deleted': {
        const d = event.data as { tokenId: string };
        this.tokens.delete(d.tokenId);
        this.pendingMoveOriginals.delete(d.tokenId);
        break;
      }

      case 'token.linked': {
        const d = event.data as { tokenId: string; actorId: string };
        const token = this.tokens.get(d.tokenId);
        if (token) {
          this.tokens.set(d.tokenId, { ...token, actorId: d.actorId });
        }
        break;
      }

      // ── Actor CRUD ───────────────────────────────────────────────────────

      case 'actor.created': {
        const d = event.data as { actorId: string; name: string };
        this.actors.set(d.actorId, {
          id: d.actorId,
          name: d.name,
          seatPermissions: {},
          data: {},
        });
        break;
      }

      case 'actor.deleted': {
        const d = event.data as { actorId: string };
        this.actors.delete(d.actorId);
        break;
      }

      case 'actor.seatLinked': {
        const d = event.data as {
          actorId: string;
          seatId: string;
          permission: 'control' | 'read';
        };
        const actor = this.actors.get(d.actorId);
        if (actor) {
          this.actors.set(d.actorId, {
            ...actor,
            seatPermissions: {
              ...actor.seatPermissions,
              [d.seatId]: d.permission,
            },
          });
        }
        break;
      }

      // ── Scene CRUD ───────────────────────────────────────────────────────

      case 'scene.created': {
        const d = event.data as {
          sceneId: string;
          name: string;
          gridType: 'square' | 'hex' | 'none';
          gridSize: number;
          gridScale: string;
          width: number;
          height: number;
        };
        this.scenes.set(d.sceneId, {
          id: d.sceneId,
          name: d.name,
          gridType: d.gridType,
          gridSize: d.gridSize,
          gridScale: d.gridScale,
          width: d.width,
          height: d.height,
          data: {},
        });
        break;
      }

      case 'scene.deleted': {
        const d = event.data as { sceneId: string };
        this.scenes.delete(d.sceneId);
        if (this.activeSceneId === d.sceneId) {
          this.activeSceneId = null;
        }
        break;
      }

      case 'scene.activated': {
        const d = event.data as { sceneId: string };
        this.activeSceneId = d.sceneId;
        break;
      }

      // ── Prompt lifecycle ─────────────────────────────────────────────────

      case 'prompt.created': {
        const dPrompt = event.data as { prompt: Prompt };
        this.activePrompts.set(dPrompt.prompt.id, dPrompt.prompt);
        notificationState.trackPrompt(dPrompt.prompt.id, dPrompt.prompt.title);
        break;
      }

      case 'prompt.resolved':
      case 'prompt.cancelled': {
        const dPromptResolve = event.data as { promptId: string };
        this.activePrompts.delete(dPromptResolve.promptId);
        notificationState.untrackPrompt(dPromptResolve.promptId);
        break;
      }

      case 'campaignData.updated': {
        const d = event.data as { changes: Record<string, unknown> };
        if (d.changes) {
          this.campaignData = { ...this.campaignData, ...d.changes };
          // Clear matching optimistic entries for confirmed changes
          for (const key of Object.keys(d.changes)) {
            this.optimisticOverlay.delete(key);
          }
        }
        break;
      }

      default:
        // Unknown event types are logged but do not cause errors.
        console.warn(
          '[CampaignState] Unhandled event type:',
          event.type,
          event.id,
        );
    }

    // Append every incoming event to the shared event buffer for eventState()
    this.sharedGameEvents = [...this.sharedGameEvents, event];
    if (this.sharedGameEvents.length > this.maxEvents) {
      this.sharedGameEvents = this.sharedGameEvents.slice(-this.maxEvents);
    }
  }

  /**
   * Set the entire campaign state from a plain fixture object.
   *
   * Convenience helper used by tests to pre-populate state without needing a
   * full {@link SeatView}. Not called by production code.
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

    console.debug('[CampaignState] Initial state set:', data.campaignId);
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
    this.activePrompts.clear();
    this.events = [];
    this.sharedGameEvents = [];
    this.campaignData = {};
    this.rulesetPanels = [];
    this.optimisticOverlay.clear();
    this.pendingMoveOriginals.clear();
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Transform a shared `GameEvent` from the server protocol into the
   * client-side UI event format used by the chat log and notification area.
   */
  #toUIEvent(e: SharedGameEvent): GameEvent | null {
    const base = { id: e.id, timestamp: Date.parse(e.time) };

    switch (e.type) {
      case 'chat.message': {
        const d = e.data as { text: string; displayName: string };
        return {
          ...base,
          type: 'chat.message',
          displayName: d.displayName,
          text: d.text,
        };
      }
      case 'dice.rolled': {
        const d = e.data as {
          displayName: string;
          formula: string;
          rolls: number[];
          total: number;
        };
        return {
          ...base,
          type: 'dice.rolled',
          displayName: d.displayName,
          formula: d.formula,
          rolls: d.rolls,
          total: d.total,
        };
      }
      default:
        // Non-chat events (token.moved, CRUD, fog, etc.) are not displayed
        // in the chat log. They update state via applyEvent() instead.
        return null;
    }
  }
}

/**
 * Singleton campaign state instance.
 */
export const campaignState = new CampaignState();
// State starts empty; populated by `view` messages from the server once the
// WS connection completes the welcome handshake.
