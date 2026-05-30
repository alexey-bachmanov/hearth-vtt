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
import type {
  Storage,
  Seat,
  Event as StorageEvent,
} from '../../storage/index.js';
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
import type { SnapshotBlobV1 } from './snapshot-blob.js';
import { evaluate } from './dice/index.js';

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
   * Tracks the `seq` of the last event applied via `applyEvent()`. Set from
   * `storage.getMaxEventSeq()` after replay in `open()`, and updated on each
   * `applyEvent()` call from `stored.seq`.
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
  /**
   * Set to `true` by `close()` and by the close-on-apply-throw guard.
   *
   * Once closed, `dispatch()` returns `{accepted: false}` immediately and
   * `subscribe()` is a no-op. `CampaignManager.acquire()` will rebuild the
   * engine from snapshot + replay on the next connection.
   */
  closed: boolean;
}

// ============================================================================
// Validation result
// ============================================================================

/**
 * Return type from `validate*` methods.
 *
 * `ok: true` — carries the storable event ready for `storage.appendEvent`.
 * `ok: false` — carries the human-readable rejection reason.
 */
type ValidationResult =
  | { ok: true; storable: Omit<StorageEvent, 'id' | 'seq' | 'timestamp'> }
  | { ok: false; reason: string };

// ============================================================================
// Internal event data shapes
// ============================================================================

/** Fields present on the `data` blob of every engine-emitted event. */
interface BaseEventData {
  /** Seat that triggered the action producing this event. */
  originSeatId: string;
}

interface _TokenMovedData extends BaseEventData {
  tokenId: string;
  from: Position;
  to: Position;
}

interface _ChatMessageData extends BaseEventData {
  text: string;
  displayName: string;
}

interface _DiceRolledData extends BaseEventData {
  formula: string;
  rolls: number[];
  total: number;
  displayName: string;
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

/**
 * Returns the broadcast audience for an event type.
 *
 * All current engine-emitted event types use `public` audience. Future types
 * that need restricted audience (e.g. GM-only rolls) should add a case here.
 */
function audienceForType(_type: string): GameEvent['audience'] {
  return 'public';
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
// NOTE: deterministicRoll removed in Phase A4. Rolls now delegated to
// evaluate() in ./dice/index.ts, which uses pure-rand + rpg-dice-roller.

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

  /**
   * AsyncQueue for dispatch serialisation.
   *
   * Each `dispatch()` call chains its work onto this promise so concurrent
   * callers are processed strictly FIFO. Errors inside each slot are caught
   * before they reach the chain so the queue never poisons on rejection.
   */
  private dispatchQueue: Promise<void> = Promise.resolve();

  private constructor(state: CampaignState, storage: Storage) {
    this.state = state;
    this.storage = storage;
  }

  /**
   * Opens a `PlaceholderEngine` for the given campaign.
   *
   * Loads the latest snapshot (if any) to seed state, then replays all
   * events stored after the snapshot seq. Seats are always loaded fresh from
   * storage so seat changes take effect without a new snapshot.
   *
   * @param campaignId - The campaign to open.
   * @param storage    - Storage instance to read from and append events to.
   */
  static async open(
    campaignId: string,
    storage: Storage,
  ): Promise<PlaceholderEngine> {
    // 1. Load latest snapshot (or start from empty state).
    const snapshot = await storage.getLatestSnapshot(campaignId);

    let activeSceneId: string | null = null;
    let scenes = new Map<string, Scene>();
    let tokens = new Map<string, Token>();
    let actors = new Map<string, Actor>();

    if (snapshot) {
      const blob = snapshot.blob as SnapshotBlobV1;
      activeSceneId = blob.activeSceneId;
      scenes = new Map(Object.entries(blob.scenes));
      tokens = new Map(Object.entries(blob.tokens));
      actors = new Map(Object.entries(blob.actors));
    }

    // 2. Seats always come from storage (not in snapshot) so seat-role
    //    changes take effect on the next engine open without a new snapshot.
    const seatRows = await storage.listSeats(campaignId);
    const seats = new Map<string, Seat>(seatRows.map((s) => [s.id, s]));

    const state: CampaignState = {
      campaignId,
      seq: snapshot?.seq ?? 0,
      activeSceneId,
      scenes,
      tokens,
      actors,
      seats,
      recentEvents: [],
      closed: false,
    };

    const engine = new PlaceholderEngine(state, storage);

    // 3. Replay events appended after the snapshot.
    const storedEvents = await storage.getEvents(campaignId, {
      afterSeq: snapshot?.seq ?? 0,
    });
    for (const event of storedEvents) {
      engine.applyEvent(event);
    }

    // 4. Sync seq from storage as a safety net (handles edge cases where
    //    state.seq and storage diverge, e.g. events written outside this engine).
    state.seq = await storage.getMaxEventSeq(campaignId);

    return engine;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // GameEngine interface
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Attempts to apply a player action to campaign state.
   *
   * Chains the work on the internal `dispatchQueue` so concurrent calls are
   * serialised FIFO. Returns `{ accepted: false }` if the engine is closed,
   * the campaign ID is wrong, validation fails, or an unrecoverable error
   * occurs during apply.
   */
  async dispatch(input: EngineInput): Promise<DispatchResult> {
    return new Promise<DispatchResult>((resolve) => {
      this.dispatchQueue = this.dispatchQueue.then(async () => {
        try {
          resolve(await this.dispatchInternal(input));
        } catch (err) {
          resolve({ accepted: false, reason: String(err) });
        }
      });
    });
  }

  private async dispatchInternal(input: EngineInput): Promise<DispatchResult> {
    if (this.state.closed) {
      return { accepted: false, reason: 'engine closed' };
    }

    if (input.campaignId !== this.state.campaignId) {
      return {
        accepted: false,
        reason: 'Wrong campaign for this engine instance',
      };
    }

    let validation: ValidationResult;
    switch (input.actionType) {
      case 'token.move':
        validation = this.validateTokenMove(input.seatId, input.payload);
        break;
      case 'chat.send':
        validation = this.validateChatSend(input.seatId, input.payload);
        break;
      case 'dice.roll':
        validation = this.validateDiceRoll(input.seatId, input.payload);
        break;
      default:
        return {
          accepted: false,
          reason: `Unknown action type: ${input.actionType}`,
        };
    }

    if (!validation.ok) {
      return { accepted: false, reason: validation.reason };
    }

    const stored = await this.storage.appendEvent(
      this.state.campaignId,
      validation.storable,
    );

    // B5: close-on-apply-throw — if applying the event throws, the engine is
    // in an unknown state. Mark closed and let CampaignManager rebuild.
    let gameEvent: GameEvent;
    try {
      gameEvent = this.applyEvent(stored);
    } catch (err) {
      console.error(
        `[PlaceholderEngine] applyEvent threw for campaign ${this.state.campaignId}:`,
        err,
      );
      this.state.closed = true;
      void this.close();
      return { accepted: false, reason: 'engine closed' };
    }

    this.broadcastEvent(gameEvent as GameEvent<BaseEventData>);

    const actionId = deriveActionId(
      this.state.campaignId,
      stored.seq,
      input.actionType,
      input.payload,
    );

    return { accepted: true, seq: stored.seq, actionId };
  }

  /**
   * Applies a stored event to in-memory campaign state.
   *
   * Updates `state.seq`, mutates entity maps where applicable, appends to
   * `recentEvents`, and returns the reconstructed `GameEvent`.
   *
   * Called on both the live-dispatch path and during replay inside `open()`.
   * On replay, the caller discards the return value and skips broadcasting.
   *
   * @throws If event data is structurally invalid. The dispatch path treats
   *         any throw here as fatal and closes the engine.
   */
  private applyEvent(stored: StorageEvent): GameEvent {
    this.state.seq = stored.seq;

    switch (stored.type) {
      case 'token.moved': {
        const data = stored.data as { tokenId: string; to: Position };
        const token = this.state.tokens.get(data.tokenId);
        if (token) {
          this.state.tokens.set(data.tokenId, {
            ...token,
            position: data.to,
          });
        }
        break;
      }
      // chat.message and dice.rolled carry no entity state mutations.
      default:
        break;
    }

    const gameEvent: GameEvent = {
      id: stored.id,
      campaignId: stored.campaignId,
      type: stored.type,
      time: new Date(stored.timestamp).toISOString(),
      seq: stored.seq,
      audience: audienceForType(stored.type),
      data: stored.data,
    };

    this.addToRecentEvents(gameEvent);
    return gameEvent;
  }

  /**
   * Returns the latest audience-filtered state projection for a seat.
   *
   * GMs see all tokens and actors. Players see only non-hidden tokens in the
   * active scene and actors they have at least `read` permission on.
   */
  getView(seatId: SeatId): SeatView {
    // Return an empty view for a closed engine; the client will reconnect.
    if (this.state.closed) {
      return {
        campaignId: this.state.campaignId,
        seatId,
        seatRole: 'spectator',
        scene: null,
        tokens: [],
        actors: [],
        recentEvents: [],
        activePrompts: [],
        capabilities: { globalActions: [], entityActions: {} },
        rulesetPanels: [],
        lastSeq: this.state.seq,
      };
    }

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
    // After close, return a no-op unsubscriber.
    if (this.state.closed) return () => {};

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
    this.state.closed = true;
    this.subscribers.clear();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // ──────────────────────────────────────────────────────────────────────────
  // Validation methods (pure, synchronous)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Validates a `token.move` action.
   *
   * Checks payload shape, token existence, and seat authorization.
   * Returns the storable event on success, or a rejection reason on failure.
   */
  private validateTokenMove(
    seatId: string,
    payload: unknown,
  ): ValidationResult {
    if (
      !payload ||
      typeof payload !== 'object' ||
      !('tokenId' in payload) ||
      !('position' in payload)
    ) {
      return {
        ok: false,
        reason: 'token.move requires { tokenId: string, position: { x, y } }',
      };
    }
    const { tokenId, position } = payload as {
      tokenId: unknown;
      position: unknown;
    };
    if (typeof tokenId !== 'string') {
      return { ok: false, reason: 'tokenId must be a string' };
    }
    if (
      !position ||
      typeof position !== 'object' ||
      typeof (position as { x?: unknown }).x !== 'number' ||
      typeof (position as { y?: unknown }).y !== 'number'
    ) {
      return {
        ok: false,
        reason: 'position must be { x: number, y: number }',
      };
    }
    const newPos: Position = {
      x: (position as { x: number }).x,
      y: (position as { y: number }).y,
    };

    const token = this.state.tokens.get(tokenId);
    if (!token) {
      return { ok: false, reason: `Token not found: ${tokenId}` };
    }

    const seat = this.state.seats.get(seatId);
    const isGm = seat?.role === 'gm';
    if (!isGm) {
      const actor = this.state.actors.get(token.actorId);
      if (actor?.seatPermissions[seatId] !== 'control') {
        return { ok: false, reason: 'Not authorized to move this token' };
      }
    }

    const from = { ...token.position };
    return {
      ok: true,
      storable: {
        campaignId: this.state.campaignId,
        entityId: tokenId,
        type: 'token.moved',
        data: { originSeatId: seatId, tokenId, from, to: newPos },
      },
    };
  }

  /**
   * Validates a `chat.send` action.
   *
   * Checks payload shape and text constraints.
   * Returns the storable event on success, or a rejection reason on failure.
   */
  private validateChatSend(seatId: string, payload: unknown): ValidationResult {
    if (
      !payload ||
      typeof payload !== 'object' ||
      !('text' in payload) ||
      typeof (payload as { text?: unknown }).text !== 'string'
    ) {
      return { ok: false, reason: 'chat.send requires { text: string }' };
    }
    const text = (payload as { text: string }).text.trim();
    if (text.length === 0) {
      return { ok: false, reason: 'Chat text must not be empty' };
    }
    if (text.length > 2000) {
      return {
        ok: false,
        reason: 'Chat text must be at most 2000 characters',
      };
    }

    const seat = this.state.seats.get(seatId);
    const displayName = seat?.displayName ?? seatId;
    return {
      ok: true,
      storable: {
        campaignId: this.state.campaignId,
        entityId: null,
        type: 'chat.message',
        data: { originSeatId: seatId, text, displayName },
      },
    };
  }

  /**
   * Validates a `dice.roll` action.
   *
   * Checks payload shape and numeric constraints, then pre-computes rolls
   * so they are stored in the event for deterministic replay.
   *
   * Rolls are seeded from a per-call UUID (not from `seq`) because `seq` is
   * assigned by storage after this method returns. The stored roll values are
   * the source of truth on replay — no recomputation is needed.
   */
  private validateDiceRoll(seatId: string, payload: unknown): ValidationResult {
    if (!payload || typeof payload !== 'object' || !('formula' in payload)) {
      return { ok: false, reason: 'dice.roll requires { formula: string }' };
    }
    const formula = (payload as { formula: unknown }).formula;
    if (typeof formula !== 'string') {
      return { ok: false, reason: 'formula must be a string' };
    }

    // Pre-compute the anticipated actionId using seq + 1. Safe because
    // dispatchQueue serialises all dispatches: no other dispatch can advance
    // seq between here and appendEvent(storable) below.
    const anticipatedSeed = deriveActionId(
      this.state.campaignId,
      this.state.seq + 1,
      'dice.roll',
      { formula },
    );

    const result = evaluate(formula, anticipatedSeed);
    if (!result.ok) {
      return { ok: false, reason: result.reason };
    }

    const seat = this.state.seats.get(seatId);
    const displayName = seat?.displayName ?? seatId;
    return {
      ok: true,
      storable: {
        campaignId: this.state.campaignId,
        entityId: null,
        type: 'dice.rolled',
        data: {
          originSeatId: seatId,
          formula,
          rolls: result.rolls,
          total: result.total,
          displayName,
        },
      },
    };
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
