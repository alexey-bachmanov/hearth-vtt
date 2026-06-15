/**
 * Engine-internal type definitions shared across engine implementations.
 *
 * `CampaignState` is the single source of truth for engine state shape. Both
 * PlaceholderEngine and EngineV01 import from here instead of duplicating
 * inline definitions.
 *
 * IMPORTANT: This module must NOT be re-exported from `engine/index.ts`.
 * Consumers outside the engine directory interact with campaign state only
 * through the `GameEngine` interface.
 */

import type {
  Token,
  Actor,
  Scene,
  GameEvent,
  WorkflowId,
} from '@hearth-vtt/shared';
import type { Seat } from '../../storage/index.js';
import type { Workflow } from './v0-1/types.js';

/**
 * Engine-internal campaign state — canonical shape.
 *
 * 11 fields covering all state that the engine manages. Both PlaceholderEngine
 * and EngineV01 use this type directly.
 */
export interface CampaignState {
  campaignId: string;
  /** Per-campaign monotonic sequence counter. */
  seq: number;
  /** ID of the currently active scene, or null if no scene is set. */
  activeSceneId: string | null;
  /** Scene entities keyed by entity/domain ID. */
  scenes: Map<string, Scene>;
  /** Token entities keyed by entity/domain ID. */
  tokens: Map<string, Token>;
  /** Actor entities keyed by entity/domain ID. */
  actors: Map<string, Actor>;
  /** Open workflow instances keyed by WorkflowId. */
  workflows: Map<WorkflowId, Workflow>;
  /** Ruleset-scoped custom data key-value store. */
  customData: Map<string, unknown>;
  /** Campaign-level opaque data blob (initiative order, party resources, etc.). */
  campaignData: Record<string, unknown>;
  /** Seat rows cached from storage. */
  seats: Map<string, Seat>;
  /** Rolling window of recent GameEvents (up to RECENT_EVENTS_LIMIT). */
  recentEvents: GameEvent[];
  /** Set to true by close() and by the close-on-apply-throw guard. */
  closed: boolean;
}

/**
 * Fields present on the `data` blob of every engine-emitted event.
 */
export interface BaseEventData {
  /** Seat that triggered the action producing this event. */
  originSeatId?: string;
}
