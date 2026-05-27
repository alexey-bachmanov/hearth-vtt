import type {
  DispatchResult,
  EngineInput,
  SeatId,
  SeatView,
  WireEvent,
} from '@hearth-vtt/shared';

/**
 * Public GameEngine facade boundary for server transport and application layers.
 *
 * This interface intentionally exposes only dispatch, audience-filtered view reads,
 * per-seat event subscriptions, and lifecycle shutdown.
 */
export interface GameEngine {
  /**
   * Attempts to apply a player action to campaign state.
   */
  dispatch(input: EngineInput): Promise<DispatchResult>;

  /**
   * Returns the latest audience-filtered state projection for a seat.
   */
  getView(seatId: SeatId): SeatView;

  /**
   * Subscribes to the seat-scoped event stream.
   *
   * Listener is synchronous by contract. Implementations must not await it.
   */
  subscribe(seatId: SeatId, listener: (event: WireEvent) => void): () => void;

  /**
   * Closes engine resources.
   */
  close(): Promise<void>;
}

// PlaceholderEngine is the only concrete implementation for Phase 2.5.
export { PlaceholderEngine } from './placeholder.js';

// CampaignManager owns the lifecycle of one GameEngine per active campaign.
export { CampaignManager } from './campaign-manager.js';

// Re-export shared boundary types for server-side engine consumers.
export type {
  ActionType,
  SeatId,
  Capabilities,
  DispatchResult,
  EngineInput,
  SeatView,
  SceneView,
  TokenView,
  ActorView,
  WireEvent,
  FullEventEnvelope,
  RedactedEvent,
  GameEvent,
} from '@hearth-vtt/shared';
