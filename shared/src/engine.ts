/**
 * Engine boundary types for the GameEngine facade.
 *
 * These types define the public surface of the engine as consumed by HTTP
 * routes, WebSocket transport, and the client. Nothing inside the engine
 * boundary (CampaignState, patches, replay, RNG, RulesetRuntime) is exported
 * from here.
 *
 * @see docs/decisions/011-engine-facade-and-dsl-reversal.md
 */

import { z } from 'zod';
import type { CampaignId, SeatId } from './ids';
import type { Scene, Token, Actor } from './entities';
import type { SeatRole } from './seat';
import type { GameEvent } from './event';
import type { Prompt } from './prompt';

// ============================================================================
// ActionType
// ============================================================================

/**
 * A branded action-type string token (e.g. 'token.move', 'chat.send').
 *
 * Plain string alias for now. Upgrade to a proper branded type
 * (`string & { readonly __brand: 'ActionType' }`) when compile-time
 * enforcement is needed — changing this definition propagates automatically.
 */
export type ActionType = string;

// ============================================================================
// Capabilities
// ============================================================================

/**
 * Wire format for seat capabilities.
 *
 * Populated by the ruleset when a ruleset is loaded; empty at baseline.
 *
 * **Important:** the wire format uses plain arrays and records. Consumers must
 * wrap `globalActions` in a `Set` and `entityActions` in a `Map` after
 * receipt — `Set` and `Map` do not survive `JSON.stringify`.
 */
export const capabilitiesSchema = z.object({
  /** Action types available without targeting a specific entity. */
  globalActions: z.array(z.string()),
  /**
   * Per-entity action types.
   * Keys are entity IDs; values are arrays of available ActionType strings.
   */
  entityActions: z.record(z.string(), z.array(z.string())),
});
export type Capabilities = z.infer<typeof capabilitiesSchema>;

// ============================================================================
// View projections
// ============================================================================

/**
 * Audience-filtered projection of a Scene for a specific seat.
 *
 * Currently type-aliases `Scene` directly. May diverge in Phase 3 when
 * wall data and fog-of-war exploration masks are audience-filtered.
 */
export type SceneView = Scene;

/**
 * Audience-filtered projection of a Token for a specific seat.
 *
 * Currently type-aliases `Token` directly. May diverge when hidden tokens
 * are conditionally omitted per seat.
 */
export type TokenView = Token;

/**
 * Audience-filtered projection of an Actor for a specific seat.
 *
 * Currently type-aliases `Actor` directly. May diverge when per-seat actor
 * data visibility (e.g. hidden HP, secret notes) is implemented.
 */
export type ActorView = Actor;

// ============================================================================
// SeatView
// ============================================================================

/**
 * The complete audience-filtered snapshot of campaign state for one seat.
 *
 * Sent by the server on WebSocket connect, on reconnect when a sequence gap
 * is detected, and on explicit `view.request`. During normal play the client
 * applies incremental `GameEvent` messages rather than re-fetching the full
 * view.
 */
export type SeatView = {
  /** The campaign this view belongs to. */
  campaignId: CampaignId;
  /** The seat this view is for. */
  seatId: SeatId;
  /** The seat's campaign role. */
  seatRole: SeatRole;
  /**
   * The currently active scene, or `null` if no scene has been set.
   * Contains only data visible to this seat (audience-filtered).
   */
  scene: SceneView | null;
  /** Tokens in the active scene that are visible to this seat. */
  tokens: TokenView[];
  /** Actors this seat has `read` or `control` access to. */
  actors: ActorView[];
  /** Recent events visible to this seat (chat feed, roll results, etc.). */
  recentEvents: GameEvent[];
  /** Prompts currently targeting this seat and awaiting a response. */
  activePrompts: Prompt[];
  /**
   * Action capabilities for this seat.
   *
   * Empty until a ruleset is loaded. Client wraps arrays in `Set`/`Map`
   * after receipt.
   */
  capabilities: Capabilities;
  /**
   * Ruleset-contributed panel definitions for the toolbar.
   *
   * Shape is deliberately opaque and deferred until the ruleset interior is
   * designed. Treat as `unknown[]` — do not attempt to render content yet.
   */
  rulesetPanels: unknown[];
  /**
   * Sequence number of the most recent event included in this view.
   *
   * The client tracks `lastSeq` to detect gaps in the event stream. A gap
   * between `lastSeq` in this view and the first received event after connect
   * triggers a `view.request` resync.
   */
  lastSeq: number;
};

// ============================================================================
// EngineInput
// ============================================================================

/**
 * An action dispatched to the engine by a seat.
 *
 * Auth fields are intentionally absent — the WS transport resolves
 * `(authPrincipal, campaignId) → seatId` before calling `engine.dispatch()`.
 * The engine never touches auth concepts.
 */
export const engineInputSchema = z.object({
  /** The seat dispatching the action. Resolved by the transport layer. */
  seatId: z.string(),
  /** The campaign the action targets. */
  campaignId: z.string(),
  /**
   * Ruleset-defined action type token (e.g. `'token.move'`, `'chat.send'`).
   * Determines which handler the engine delegates to.
   */
  actionType: z.string(),
  /**
   * Action-specific payload.
   *
   * Validated by the engine for baseline built-in actions. Opaque for
   * ruleset-defined actions (validated by the ruleset runtime).
   */
  payload: z.unknown(),
  /**
   * Optional idempotency key.
   *
   * Dedup scope: **per-WS-connection, in-memory only** (maintained by the
   * WS handler, not the engine). Not durable across reconnects — the client
   * must not retry across reconnects using the same `clientRequestId`.
   */
  clientRequestId: z.string().optional(),
});
export type EngineInput = z.infer<typeof engineInputSchema>;

// ============================================================================
// DispatchResult
// ============================================================================

/**
 * The synchronous result of `engine.dispatch()`.
 *
 * Accepted dispatches emit one or more `GameEvent`s to subscribed seats whose
 * audience policy permits receipt. Rejected dispatches emit no events.
 */
export type DispatchResult =
  | { accepted: true; seq: number; actionId: string }
  | { accepted: false; reason: string };
