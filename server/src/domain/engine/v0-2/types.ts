/**
 * Engine v0.1 resolver contract types.
 *
 * This module defines the throwaway internal contract between EngineV01,
 * baseline resolvers, and ruleset manifests. None of these types are part of
 * the public GameEngine facade or shared wire protocol.
 */

import type {
  ActionId,
  Actor,
  ActorId,
  Position,
  Scene,
  SceneId,
  SeatId,
  Token,
  TokenId,
  WorkflowId,
  PanelDef,
} from '@hearth-vtt/shared';

/**
 * Discriminated union of semantic intents that resolvers return.
 *
 * Each intent kind maps 1:1 to (state mutation + stored event + wire event)
 * via the intent processor. This replaces the old Patch + GameEvent split,
 * eliminating desync risk and boundary leakage.
 */
export type ResolverIntent =
  // ── Existing (Phase 6) ──────────────────────────────────────────────────
  | { kind: 'token.move'; tokenId: string; from: Position; to: Position }
  | { kind: 'chat.send'; text: string; displayName: string }
  | {
      kind: 'dice.result';
      formula: string;
      rolls: number[];
      total: number;
      displayName: string;
    }
  | {
      kind: 'workflow.open';
      id: WorkflowId;
      continuationActionType: string;
      data: unknown;
    }
  // ── Token/Actor CRUD (Phase 1) ──────────────────────────────────────────
  | {
      kind: 'token.create';
      tokenId: string;
      actorId: string;
      sceneId: string;
      position: Position;
      name?: string;
      imageUrl?: string;
      hidden?: boolean;
      data: Record<string, unknown>;
    }
  | { kind: 'token.delete'; tokenId: string }
  | {
      kind: 'actor.create';
      actorId: string;
      name: string;
      data: Record<string, unknown>;
      seatPermissions?: Record<string, 'control' | 'read'>;
    }
  | { kind: 'actor.delete'; actorId: string }
  | { kind: 'token.linkToActor'; tokenId: string; actorId: string }
  | {
      kind: 'actor.linkSeat';
      actorId: string;
      seatId: SeatId;
      permission: 'control' | 'read';
    }
  // ── Scene CRUD (Phase 6D) ──────────────────────────────────────────────
  | {
      kind: 'scene.create';
      sceneId: string;
      name: string;
      data: Record<string, unknown>;
    }
  | { kind: 'scene.delete'; sceneId: string }
  | { kind: 'scene.setActive'; sceneId: string }
  // ── Replace data intents (v0.2) ─────────────────────────────────────────
  | {
      kind: 'actor.replaceData';
      actorId: string;
      data: Record<string, unknown>;
    }
  | {
      kind: 'token.replaceData';
      tokenId: string;
      data: Record<string, unknown>;
    }
  | {
      kind: 'scene.replaceData';
      sceneId: string;
      data: Record<string, unknown>;
    };

/** Minimal persisted workflow shape for v0.1. */
export interface Workflow {
  id: WorkflowId;
  continuationActionType: string;
  data: unknown;
}

/** Return value from a single resolver invocation. */
export interface ResolverResult {
  intents: ResolverIntent[];
}

/** Dice helper result used by baseline and ruleset resolvers. */
export type RollDiceResult =
  | { ok: true; rolls: number[]; total: number }
  | { ok: false; reason: string };

/**
 * Read-only helpers exposed to resolvers.
 *
 * v0.1 only implements the subset needed by baseline actions and the D&D
 * `token.move` placeholder ruleset. Spatial helpers may throw until wired.
 */
export interface ResolverApi {
  getActor(actorId: ActorId): Actor | undefined;
  getToken(tokenId: TokenId): Token | undefined;
  getScene(sceneId: SceneId): Scene | undefined;
  tokensInRadius(
    sceneId: SceneId,
    x: number,
    y: number,
    radius: number,
  ): Token[];
  rollDice(formula: string, actionId: ActionId): RollDiceResult;
  getCustomData(key: string): unknown;
  /** Set a key in campaign-level data. Engine diffs before/after and emits campaignData.updated. */
  setCampaignData(key: string, value: unknown): void;
}

/** Resolver for one action type. */
export type Resolver = (args: unknown, helpers: ResolverApi) => ResolverResult;

/** Combines multiple resolver intent arrays for the same action dispatch. */
export type Merger = (results: ResolverIntent[][]) => ResolverIntent[];

/** Action registration contributed by the baseline engine or a ruleset. */
export interface ActionBinding {
  argsSchema?: unknown;
  resolver: Resolver;
}

/** Manifest export loaded by EngineV01 at open time. */
export interface RulesetManifest {
  id: string;
  version: string;
  actions: Record<string, ActionBinding>;
  mergers?: Record<string, Merger>;
  /** Declarative panel definitions contributed by this ruleset. */
  panels?: PanelDef[];
  /**
   * Optional hook: recompute derived fields for actors whose data was modified.
   * Called after all resolver intents are processed, before events are broadcast.
   * Engine shallow-merges returned patches into actor.data.
   *
   * Convention: store derived values under `actor.data.derived.*` for namespacing
   * and future JSON Patch compatibility.
   *
   * @param touchedActorIds - IDs of actors whose data was modified by the dispatch
   * @param api - Read-only ResolverApi for data access
   * @returns A map of actorId → { key: value } patches to shallow-merge into actor.data
   */
  recomputeActorData?: (
    touchedActorIds: string[],
    api: ResolverApi,
  ) => Record<string, Record<string, unknown>>;
}
