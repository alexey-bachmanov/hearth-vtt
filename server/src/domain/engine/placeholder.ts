/**
 * PlaceholderEngine — minimal GameEngine implementation for Phase 2.5.
 *
 * Implements the three baseline action types (`token.move`, `chat.send`,
 * `dice.roll`) that are sufficient to verify the engine boundary and
 * event-stream protocol without committing to the full ruleset interior.
 *
 * Architecture constraints:
 * - `CampaignState` and all helper types are module-local and never exported.
 *   Consumers interact exclusively through the `GameEngine` interface.
 * - Sequence numbers are in-memory only for this sprint; durable event tables
 *   (with a `seq` column) land in Phase 3.
 * - `appendEvent` is called before broadcasting so the append-before-broadcast
 *   invariant is established now, even though the event table isn't final.
 * - The `subscribe` listener contract is synchronous: the engine never awaits
 *   listeners. Transport owns buffering.
 *
 * @see docs/decisions/011-engine-facade-and-dsl-reversal.md
 * @see docs/todo.md — Engine Boundary Refactor, step 6
 */

import { createHash } from 'node:crypto';
import type { Storage, Seat } from '../../storage/index.js';
import type { GameEngine } from './index.js';
import type {
  SeatId,
  SeatView,
  EngineInput,
  DispatchResult,
  WireEvent,
  GameEvent,
  TokenView,
  ActorView,
  SceneView,
  Capabilities,
} from './index.js';
import type { Token, Actor, Scene, Position } from '@hearth-vtt/shared';

// ============================================================================
// Constants
// ============================================================================

/** Maximum number of recent GameEvents retained in memory for SeatView. */
const RECENT_EVENTS_LIMIT = 50;

// ============================================================================
// Module-local campaign state — never exported
// ============================================================================

/**
 * Engine-internal campaign state.
 *
 * This shape is private to this module. The engine facade never exposes it.
 * All access to campaign state goes through the `GameEngine` interface.
 */
interface CampaignState {
  campaignId: string;
  /**
   * Per-campaign monotonic sequence counter.
   *
   * Incremented once per emitted event (both full and redacted) so the
   * per-campaign sequence stays gapless from every seat's perspective.
   * In-memory only for Phase 2.5; durable persistence lands in Phase 3.
   */
  seq: number;
  /** ID of the currently active scene, or null if no scene is set. */
  activeSceneId: string | null;
  /**
   * Scene entities keyed by entity/domain ID.
   *
   * Invariant: entity ID equals the domain object `id` field. The engine is
   * the sole writer of scene entities.
   */
  scenes: Map<string, Scene>;
  /** Token entities keyed by entity/domain ID. */
  tokens: Map<string, Token>;
  /** Actor entities keyed by entity/domain ID. */
  actors: Map<string, Actor>;
  /**
   * Seat rows cached from storage.
   *
   * Used for audience resolution and for building `SeatView`. Loaded on
   * `open()`; does not auto-refresh. Phase 3 will introduce a refresh path.
   */
  seats: Map<string, Seat>;
  /**
   * Rolling window of recent `GameEvent`s (up to `RECENT_EVENTS_LIMIT`).
   *
   * Used to populate `SeatView.recentEvents` on connect / resync. Oldest
   * entries are evicted when the window fills.
   */
  recentEvents: GameEvent[];
}

// ============================================================================
// Internal event data shapes
// ============================================================================

/** Fields present on the `data` blob of every engine-emitted event. */
interface BaseEventData {
  /** Seat that triggered the action producing this event. */
  originSeatId: string;
}

interface TokenMovedData extends BaseEventData {
  tokenId: string;
  from: Position;
  to: Position;
}

interface ChatMessageData extends BaseEventData {
  text: string;
  displayName: string;
}

interface DiceRolledData extends BaseEventData {
  count: number;
  sides: number;
  modifier: number;
  rolls: number[];
  total: number;
}

// ============================================================================
// Audience helpers
// ============================================================================

/**
 * Returns true if `seatId` should receive the full event given its audience
 * policy.
 *
 * - `public`  → all seats
 * - `gm`      → GM-role seats + the originating seat
 * - `blind`   → GM-role seats only (originator excluded by design)
 * - `private` → GM-role seats + originating seat (multi-target private is a
 *               Phase 3 concern)
 */
function isInAudience(
  seatId: string,
  event: GameEvent<BaseEventData>,
  seats: Map<string, Seat>,
): boolean {
  const seat = seats.get(seatId);
  if (!seat) return false;
  const isGm = seat.role === 'gm';
  const isOrigin = seatId === event.data.originSeatId;
  switch (event.audience) {
    case 'public':
      return true;
    case 'gm':
      return isGm || isOrigin;
    case 'blind':
      return isGm;
    case 'private':
      return isGm || isOrigin;
    default:
      return false;
  }
}

// ============================================================================
// Deterministic action ID + RNG
// ============================================================================

/**
 * Derives a stable action ID from the action's unique position in the log.
 *
 * The hash covers `campaignId`, `seq`, `actionType`, and the canonical
 * payload JSON so the ID is reproducible from the stored event log.
 */
function deriveActionId(
  campaignId: string,
  seq: number,
  actionType: string,
  payload: unknown,
): string {
  return createHash('sha256')
    .update(JSON.stringify({ campaignId, seq, actionType, payload }))
    .digest('hex');
}

/**
 * Returns a deterministic integer in [1, sides] derived from the action ID
 * and a per-action roll index.
 *
 * Each (actionId, rollIndex) pair is independently seeded via sha256, so
 * individual dice within a roll are uncorrelated.
 */
function deterministicRoll(
  actionId: string,
  rollIndex: number,
  sides: number,
): number {
  const buf = createHash('sha256').update(`${actionId}:${rollIndex}`).digest();
  // Use first 4 bytes as a big-endian uint32, then reduce to [0, sides).
  const n = buf.readUInt32BE(0);
  return (n % sides) + 1;
}

// ============================================================================
// PlaceholderEngine
// ============================================================================

/**
 * Minimal `GameEngine` implementation for Phase 2.5.
 *
 * Use `PlaceholderEngine.open(campaignId, storage)` to obtain an instance.
 * The constructor is private; this ensures state is always loaded from
 * storage rather than starting from an uninitialised blank.
 */
export class PlaceholderEngine implements GameEngine {
  private readonly storage: Storage;
  private state: CampaignState;

  /**
   * Per-seat subscriber sets.
   *
   * Listeners are synchronous by contract. The engine calls them inline and
   * never awaits them. Transport owns buffering and backpressure.
   */
  private readonly subscribers = new Map<
    string,
    Set<(event: WireEvent) => void>
  >();

  private constructor(state: CampaignState, storage: Storage) {
    this.state = state;
    this.storage = storage;
  }

  /**
   * Opens a `PlaceholderEngine` for the given campaign.
   *
   * Loads the current entity state (scenes, tokens, actors) and recent events
   * from storage. The returned engine is ready to dispatch actions immediately.
   *
   * @param campaignId - The campaign to open.
   * @param storage    - Storage instance to read from and append events to.
   */
  static async open(
    campaignId: string,
    storage: Storage,
  ): Promise<PlaceholderEngine> {
    const [
      sceneEntities,
      tokenEntities,
      actorEntities,
      seatRows,
      storedEvents,
    ] = await Promise.all([
      storage.listEntities(campaignId, 'scene'),
      storage.listEntities(campaignId, 'token'),
      storage.listEntities(campaignId, 'actor'),
      storage.listSeats(campaignId),
      storage.getEvents(campaignId, { limit: RECENT_EVENTS_LIMIT }),
    ]);

    const scenes = new Map<string, Scene>(
      sceneEntities.map((e) => [e.id, e.data as unknown as Scene]),
    );
    const tokens = new Map<string, Token>(
      tokenEntities.map((e) => [e.id, e.data as unknown as Token]),
    );
    const actors = new Map<string, Actor>(
      actorEntities.map((e) => [e.id, e.data as unknown as Actor]),
    );
    const seats = new Map<string, Seat>(seatRows.map((s) => [s.id, s]));

    // Re-hydrate stored events as GameEvents. Seq is 0 for all historical
    // events because the seq column does not exist yet in Phase 2.5; this is
    // addressed when the event table is redesigned in Phase 3.
    const recentEvents: GameEvent[] = storedEvents.map((e) => ({
      id: e.id,
      campaignId: e.campaignId,
      type: e.type,
      time: new Date(e.timestamp).toISOString(),
      seq: 0,
      audience: 'public' as const,
      data: e.data,
    }));

    const state: CampaignState = {
      campaignId,
      seq: 0, // Reset on engine open; durable seq lands in Phase 3.
      activeSceneId: scenes.size > 0 ? [...scenes.keys()][0] : null,
      scenes,
      tokens,
      actors,
      seats,
      recentEvents,
    };

    return new PlaceholderEngine(state, storage);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // GameEngine interface
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Attempts to apply a player action to campaign state.
   *
   * Routes `input.actionType` to the appropriate handler. Returns immediately
   * with `{ accepted: false }` for unknown action types or invalid payloads;
   * returns `{ accepted: true, seq, actionId }` on success.
   */
  async dispatch(input: EngineInput): Promise<DispatchResult> {
    if (input.campaignId !== this.state.campaignId) {
      return {
        accepted: false,
        reason: 'Wrong campaign for this engine instance',
      };
    }

    switch (input.actionType) {
      case 'token.move':
        return this.handleTokenMove(input.seatId, input.payload);
      case 'chat.send':
        return this.handleChatSend(input.seatId, input.payload);
      case 'dice.roll':
        return this.handleDiceRoll(input.seatId, input.payload);
      default:
        return {
          accepted: false,
          reason: `Unknown action type: ${input.actionType}`,
        };
    }
  }

  /**
   * Returns the latest audience-filtered state projection for a seat.
   *
   * GMs see all tokens and actors. Players see only non-hidden tokens in the
   * active scene and actors they have at least `read` permission on.
   */
  getView(seatId: SeatId): SeatView {
    const seat = this.state.seats.get(seatId);
    const seatRole = seat?.role ?? 'spectator';
    const isGm = seatRole === 'gm';

    const activeScene: SceneView | null = this.state.activeSceneId
      ? (this.state.scenes.get(this.state.activeSceneId) ?? null)
      : null;

    // Tokens visible to this seat: GMs see all; players see non-hidden tokens.
    const visibleTokens: TokenView[] = [...this.state.tokens.values()].filter(
      (t) => t.sceneId === this.state.activeSceneId && (isGm || !t.hidden),
    );

    // Actors: GMs see all; players see actors they have any permission on.
    const visibleActors: ActorView[] = [...this.state.actors.values()].filter(
      (a) => isGm || seatId in a.seatPermissions,
    );

    // Recent events filtered to events visible to this seat.
    const visibleEvents = this.state.recentEvents.filter((e) =>
      isInAudience(seatId, e as GameEvent<BaseEventData>, this.state.seats),
    );

    // Capabilities are empty at baseline (no ruleset loaded).
    const capabilities: Capabilities = {
      globalActions: [],
      entityActions: {},
    };

    return {
      campaignId: this.state.campaignId,
      seatId,
      seatRole,
      scene: activeScene,
      tokens: visibleTokens,
      actors: visibleActors,
      recentEvents: visibleEvents,
      activePrompts: [],
      capabilities,
      rulesetPanels: [],
      lastSeq: this.state.seq,
    };
  }

  /**
   * Subscribes to the seat-scoped event stream.
   *
   * Returns an unsubscribe function. Multiple subscriptions on the same seat
   * are supported (e.g. multiple browser tabs); each receives all events
   * independently.
   *
   * @param seatId   - Seat to subscribe for.
   * @param listener - Synchronous callback; called inline on each event.
   * @returns Unsubscribe function.
   */
  subscribe(seatId: SeatId, listener: (event: WireEvent) => void): () => void {
    if (!this.subscribers.has(seatId)) {
      this.subscribers.set(seatId, new Set());
    }
    this.subscribers.get(seatId)!.add(listener);

    return () => {
      this.subscribers.get(seatId)?.delete(listener);
    };
  }

  /**
   * Closes the engine and releases all subscriber references.
   *
   * Callers should stop dispatching actions and drop their reference to this
   * engine after calling `close`.
   */
  async close(): Promise<void> {
    this.subscribers.clear();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Action handlers
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Handles `token.move`.
   *
   * Payload: `{ tokenId: string, position: { x: number, y: number } }`
   *
   * Authorization: seat must be GM or have `control` permission on the
   * token's actor.
   *
   * Emits: `token.moved` (audience: `public`)
   */
  private async handleTokenMove(
    seatId: string,
    payload: unknown,
  ): Promise<DispatchResult> {
    if (
      !payload ||
      typeof payload !== 'object' ||
      !('tokenId' in payload) ||
      !('position' in payload)
    ) {
      return {
        accepted: false,
        reason: 'token.move requires { tokenId: string, position: { x, y } }',
      };
    }
    const { tokenId, position } = payload as {
      tokenId: unknown;
      position: unknown;
    };
    if (typeof tokenId !== 'string') {
      return { accepted: false, reason: 'tokenId must be a string' };
    }
    if (
      !position ||
      typeof position !== 'object' ||
      typeof (position as { x?: unknown }).x !== 'number' ||
      typeof (position as { y?: unknown }).y !== 'number'
    ) {
      return {
        accepted: false,
        reason: 'position must be { x: number, y: number }',
      };
    }
    const newPos: Position = {
      x: (position as { x: number }).x,
      y: (position as { y: number }).y,
    };

    const token = this.state.tokens.get(tokenId);
    if (!token) {
      return { accepted: false, reason: `Token not found: ${tokenId}` };
    }

    // Authorization.
    const seat = this.state.seats.get(seatId);
    const isGm = seat?.role === 'gm';
    if (!isGm) {
      const actor = this.state.actors.get(token.actorId);
      if (actor?.seatPermissions[seatId] !== 'control') {
        return { accepted: false, reason: 'Not authorized to move this token' };
      }
    }

    const seq = this.nextSeq();
    const actionId = deriveActionId(
      this.state.campaignId,
      seq,
      'token.move',
      payload,
    );
    const from = { ...token.position };
    const eventData: Record<string, unknown> = {
      originSeatId: seatId,
      tokenId,
      from,
      to: newPos,
    };

    // Append to storage before broadcasting (append-before-broadcast invariant).
    const stored = await this.storage.appendEvent(this.state.campaignId, {
      campaignId: this.state.campaignId,
      entityId: tokenId,
      type: 'token.moved',
      data: eventData,
    });

    // Update in-memory state.
    this.state.tokens.set(tokenId, { ...token, position: newPos });

    const event: GameEvent<TokenMovedData> = {
      id: stored.id,
      campaignId: this.state.campaignId,
      type: 'token.moved',
      time: new Date(stored.timestamp).toISOString(),
      seq,
      audience: 'public',
      data: {
        originSeatId: seatId,
        tokenId,
        from,
        to: newPos,
      },
    };

    this.addToRecentEvents(event);
    this.broadcastEvent(event);

    return { accepted: true, seq, actionId };
  }

  /**
   * Handles `chat.send`.
   *
   * Payload: `{ text: string }`
   *
   * Any active seat may send chat. Text is trimmed and capped at 2000 chars.
   *
   * Emits: `chat.message` (audience: `public`)
   */
  private async handleChatSend(
    seatId: string,
    payload: unknown,
  ): Promise<DispatchResult> {
    if (
      !payload ||
      typeof payload !== 'object' ||
      !('text' in payload) ||
      typeof (payload as { text?: unknown }).text !== 'string'
    ) {
      return { accepted: false, reason: 'chat.send requires { text: string }' };
    }
    const text = (payload as { text: string }).text.trim();
    if (text.length === 0) {
      return { accepted: false, reason: 'Chat text must not be empty' };
    }
    if (text.length > 2000) {
      return {
        accepted: false,
        reason: 'Chat text must be at most 2000 characters',
      };
    }

    const seat = this.state.seats.get(seatId);
    const displayName = seat?.displayName ?? seatId;
    const seq = this.nextSeq();
    const actionId = deriveActionId(
      this.state.campaignId,
      seq,
      'chat.send',
      payload,
    );
    const eventData: Record<string, unknown> = {
      originSeatId: seatId,
      text,
      displayName,
    };

    const stored = await this.storage.appendEvent(this.state.campaignId, {
      campaignId: this.state.campaignId,
      entityId: null,
      type: 'chat.message',
      data: eventData,
    });

    const event: GameEvent<ChatMessageData> = {
      id: stored.id,
      campaignId: this.state.campaignId,
      type: 'chat.message',
      time: new Date(stored.timestamp).toISOString(),
      seq,
      audience: 'public',
      data: { originSeatId: seatId, text, displayName },
    };

    this.addToRecentEvents(event);
    this.broadcastEvent(event);

    return { accepted: true, seq, actionId };
  }

  /**
   * Handles `dice.roll`.
   *
   * Payload: `{ count: number, sides: number, modifier?: number }`
   *
   * Any active seat may roll dice. Results are deterministic and seeded from
   * the action ID derived from (campaignId, seq, actionType, payload).
   *
   * Emits: `dice.rolled` (audience: `public`)
   */
  private async handleDiceRoll(
    seatId: string,
    payload: unknown,
  ): Promise<DispatchResult> {
    if (!payload || typeof payload !== 'object') {
      return {
        accepted: false,
        reason:
          'dice.roll requires { count: number, sides: number, modifier?: number }',
      };
    }
    const p = payload as Record<string, unknown>;
    const count = p['count'];
    const sides = p['sides'];
    const modifier = p['modifier'] ?? 0;

    if (
      typeof count !== 'number' ||
      !Number.isInteger(count) ||
      count < 1 ||
      count > 100
    ) {
      return {
        accepted: false,
        reason: 'count must be an integer between 1 and 100',
      };
    }
    if (typeof sides !== 'number' || !Number.isInteger(sides) || sides < 2) {
      return { accepted: false, reason: 'sides must be an integer ≥ 2' };
    }
    if (typeof modifier !== 'number' || !Number.isInteger(modifier)) {
      return { accepted: false, reason: 'modifier must be an integer' };
    }

    const seq = this.nextSeq();
    const actionId = deriveActionId(
      this.state.campaignId,
      seq,
      'dice.roll',
      payload,
    );

    const rolls: number[] = Array.from({ length: count }, (_, i) =>
      deterministicRoll(actionId, i, sides),
    );
    const total = rolls.reduce((sum, r) => sum + r, 0) + modifier;
    const eventData: Record<string, unknown> = {
      originSeatId: seatId,
      count,
      sides,
      modifier,
      rolls,
      total,
    };

    const stored = await this.storage.appendEvent(this.state.campaignId, {
      campaignId: this.state.campaignId,
      entityId: null,
      type: 'dice.rolled',
      data: eventData,
    });

    const event: GameEvent<DiceRolledData> = {
      id: stored.id,
      campaignId: this.state.campaignId,
      type: 'dice.rolled',
      time: new Date(stored.timestamp).toISOString(),
      seq,
      audience: 'public',
      data: { originSeatId: seatId, count, sides, modifier, rolls, total },
    };

    this.addToRecentEvents(event);
    this.broadcastEvent(event);

    return { accepted: true, seq, actionId };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Increments and returns the next sequence number.
   *
   * Called once per emitted event. Must be called before any async yield so
   * seq assignment is deterministic within a single dispatch call.
   */
  private nextSeq(): number {
    this.state.seq += 1;
    return this.state.seq;
  }

  /**
   * Adds an event to the rolling recent-events window.
   *
   * Evicts the oldest entry when the window exceeds `RECENT_EVENTS_LIMIT`.
   */
  private addToRecentEvents(event: GameEvent): void {
    this.state.recentEvents.push(event);
    if (this.state.recentEvents.length > RECENT_EVENTS_LIMIT) {
      this.state.recentEvents.shift();
    }
  }

  /**
   * Broadcasts an event to all subscribed seats.
   *
   * Seats in audience receive `{ kind: 'full', event }`. Seats outside
   * audience receive `{ kind: 'redacted', seq }` so the per-campaign
   * sequence remains gapless from every seat's perspective.
   *
   * Listeners are invoked synchronously and the engine never awaits them.
   */
  private broadcastEvent(event: GameEvent<BaseEventData>): void {
    for (const [subSeatId, listeners] of this.subscribers) {
      const inAudience = isInAudience(subSeatId, event, this.state.seats);
      const wireEvent: WireEvent = inAudience
        ? { kind: 'full', event: event as GameEvent }
        : { kind: 'redacted', seq: event.seq };
      for (const listener of listeners) {
        listener(wireEvent);
      }
    }
  }
}
