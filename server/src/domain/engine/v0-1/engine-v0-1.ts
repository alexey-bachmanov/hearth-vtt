/**
 * EngineV01 — throwaway resolver-driven engine skeleton for Phase 6.
 *
 * This parallels PlaceholderEngine without changing wired routes or WS code.
 * It owns campaign state, event replay, resolver dispatch, and workflow state,
 * but leaves baseline action registration and ruleset loading to later phases.
 */

import { createHash } from 'node:crypto';
import type {
  ActionId,
  ActorId,
  SceneId,
  TokenId,
  Token,
  Actor,
  Scene,
} from '@hearth-vtt/shared';
import { evaluate } from '../dice/index.js';
import type { GameEngine } from '../index.js';
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
} from '../index.js';
import type { SnapshotBlobV1 } from '../snapshot-blob.js';
import type {
  Storage,
  Seat,
  Event as StorageEvent,
} from '../../../storage/index.js';
import type {
  Merger,
  Resolver,
  ResolverApi,
  ResolverIntent,
  RollDiceResult,
  RulesetManifest,
} from './types.js';
import { processIntent, mergeIntents } from './intent-processor.js';
import { baselineActions } from './baseline-resolvers.js';
import type { CampaignState, BaseEventData } from '../types-internal.js';

const RECENT_EVENTS_LIMIT = 50;

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

function audienceForType(_type: string): GameEvent['audience'] {
  return 'public';
}

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
 * EngineV01 is the throwaway engine/ruleset prototype for Phase 6.
 *
 * It preserves the placeholder engine's lifecycle, replay, and audience
 * behavior while moving action handling behind resolver contracts.
 */
export class EngineV01 implements GameEngine {
  private readonly storage: Storage;
  private state: CampaignState;

  private readonly subscribers = new Map<
    string,
    Set<(event: WireEvent) => void>
  >();

  private dispatchQueue: Promise<void> = Promise.resolve();

  private readonly resolvers = new Map<string, Resolver[]>();
  private readonly mergers = new Map<string, Merger>();
  private readonly resolverApi: ResolverApi;

  private constructor(state: CampaignState, storage: Storage) {
    this.state = state;
    this.storage = storage;
    this.resolverApi = Object.freeze({
      getActor: (actorId: ActorId) => this.state.actors.get(actorId),
      getToken: (tokenId: TokenId) => this.state.tokens.get(tokenId),
      getScene: (sceneId: SceneId) => this.state.scenes.get(sceneId),
      tokensInRadius: (
        sceneId: SceneId,
        _x: number,
        _y: number,
        _radius: number,
      ) => {
        return Array.from(this.state.tokens.values()).filter(
          (t) => t.sceneId === sceneId,
        );
      },
      rollDice: (formula: string, actionId: ActionId): RollDiceResult =>
        evaluate(formula, actionId),
      getCustomData: (key: string) => this.state.customData.get(key),
    });
  }

  static async open(
    campaignId: string,
    storage: Storage,
    rulesets: RulesetManifest[] = [],
  ): Promise<EngineV01> {
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

    const seatRows = await storage.listSeats(campaignId);
    const seats = new Map<string, Seat>(
      seatRows.map((seat) => [seat.id, seat]),
    );

    const state: CampaignState = {
      campaignId,
      seq: snapshot?.seq ?? 0,
      activeSceneId,
      scenes,
      tokens,
      actors,
      workflows: new Map(),
      customData: new Map(),
      seats,
      recentEvents: [],
      closed: false,
    };

    const engine = new EngineV01(state, storage);
    engine.registerRulesets(rulesets);
    const storedEvents = await storage.getEvents(campaignId, {
      afterSeq: snapshot?.seq ?? 0,
    });

    for (const event of storedEvents) {
      engine.applyEvent(event);
    }

    state.seq = await storage.getMaxEventSeq(campaignId);
    return engine;
  }

  /**
   * Registers baseline actions then appends ruleset resolvers and mergers.
   *
   * Order:
   * 1. Baseline actions are registered first, each as a single-element array.
   * 2. Rulesets are iterated in declaration order:
   *    - Resolvers are appended to the existing array (composition) or start a
   *      new one if no baseline action covers that type.
   *    - Mergers: a collision (two sources registering the same actionType)
   *      is a hard error at load time.
   * 3. After all registrations, any actionType with >1 resolver but no merger
   *    is warned about — the default LWW policy will be applied at dispatch.
   */
  private registerRulesets(rulesets: RulesetManifest[]): void {
    // 1. Baseline
    for (const [actionType, binding] of Object.entries(baselineActions)) {
      this.resolvers.set(actionType, [binding.resolver]);
    }

    // 2. Rulesets
    for (const ruleset of rulesets) {
      for (const [actionType, binding] of Object.entries(ruleset.actions)) {
        const existing = this.resolvers.get(actionType);
        if (existing) {
          existing.push(binding.resolver);
        } else {
          this.resolvers.set(actionType, [binding.resolver]);
        }
      }

      for (const [actionType, merger] of Object.entries(
        ruleset.mergers ?? {},
      )) {
        if (this.mergers.has(actionType)) {
          throw new Error(
            `Merger collision for action "${actionType}": ` +
              `two rulesets both register a merger for this action type. ` +
              `Remove one or provide a custom combined merger.`,
          );
        }
        this.mergers.set(actionType, merger);
      }
    }

    // 3. Warn on composed actions with no merger
    for (const [actionType, resolverList] of this.resolvers) {
      if (resolverList.length > 1 && !this.mergers.has(actionType)) {
        console.warn(
          `[EngineV01] Action "${actionType}" has ${resolverList.length} resolvers ` +
            `but no merger registered. Default LWW+concat policy will apply.`,
        );
      }
    }
  }

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

  getView(seatId: SeatId): SeatView {
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

    const visibleTokens: TokenView[] = [...this.state.tokens.values()].filter(
      (token) =>
        token.sceneId === this.state.activeSceneId && (isGm || !token.hidden),
    );

    const visibleActors: ActorView[] = [...this.state.actors.values()].filter(
      (actor) => isGm || seatId in actor.seatPermissions,
    );

    const visibleEvents = this.state.recentEvents.filter((event) =>
      isInAudience(seatId, event as GameEvent<BaseEventData>, this.state.seats),
    );

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

  subscribe(seatId: SeatId, listener: (event: WireEvent) => void): () => void {
    if (this.state.closed) {
      return () => {};
    }

    if (!this.subscribers.has(seatId)) {
      this.subscribers.set(seatId, new Set());
    }

    this.subscribers.get(seatId)?.add(listener);

    return () => {
      this.subscribers.get(seatId)?.delete(listener);
    };
  }

  async close(): Promise<void> {
    this.state.closed = true;
    this.subscribers.clear();
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

    const resolverList = this.resolvers.get(input.actionType);
    if (!resolverList || resolverList.length === 0) {
      return { accepted: false, reason: 'unknown action' };
    }

    // Inject seat context alongside the action payload so resolvers can
    // perform authorization checks without accessing storage directly.
    const seat = this.state.seats.get(input.seatId);
    const resolverArgs = {
      seatId: input.seatId,
      isGm: seat?.role === 'gm',
      seatDisplayName: seat?.displayName ?? input.seatId,
      ...(typeof input.payload === 'object' && input.payload !== null
        ? (input.payload as Record<string, unknown>)
        : {}),
    };

    // 1. Collect intent arrays from each resolver
    const intentArrays: ResolverIntent[][] = resolverList.map(
      (resolver) => resolver(resolverArgs, this.resolverApi).intents,
    );

    // 2. Merge: if merger registered → invoke; else if single → use it; else → default mergeIntents
    const mergedIntents = this.mergers.has(input.actionType)
      ? this.mergers.get(input.actionType)!(intentArrays)
      : intentArrays.length === 1
        ? intentArrays[0]
        : mergeIntents(intentArrays);

    // 3. Process each intent: state mutation + stored event + wire event
    let lastSeq = this.state.seq;

    for (const intent of mergedIntents) {
      const processed = processIntent(
        intent,
        this.state,
        this.state.campaignId,
      );

      // Execute state mutation
      processed.stateMutation();

      // Append to storage
      const stored = await this.storage.appendEvent(
        this.state.campaignId,
        processed.storedEvent,
      );
      lastSeq = stored.seq;

      // Apply and broadcast
      const gameEvent = this.applyEvent(stored);
      if (gameEvent) {
        this.broadcastEvent(gameEvent as GameEvent<BaseEventData>);
      }
    }

    const resultSeq = mergedIntents.length > 0 ? lastSeq : this.state.seq;
    const actionId = deriveActionId(
      this.state.campaignId,
      resultSeq,
      input.actionType,
      input.payload,
    );

    return {
      accepted: true,
      seq: resultSeq,
      actionId,
    };
  }

  private applyEvent(stored: StorageEvent): GameEvent | null {
    this.state.seq = stored.seq;

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

  private addToRecentEvents(event: GameEvent): void {
    this.state.recentEvents.push(event);
    if (this.state.recentEvents.length > RECENT_EVENTS_LIMIT) {
      this.state.recentEvents.shift();
    }
  }

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
