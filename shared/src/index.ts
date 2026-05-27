// @hearth-vtt/shared — public API barrel
// Exports are added here as modules are implemented.

export { seatRoleSchema, type SeatRole } from './seat';

export {
  gridTypeSchema,
  type GridType,
  positionSchema,
  type Position,
  sceneBackgroundSchema,
  type SceneBackground,
  sceneSchema,
  type Scene,
  tokenSchema,
  type Token,
  actorSeatPermissionSchema,
  type ActorSeatPermission,
  actorSchema,
  type Actor,
} from './entities';
export {
  serverMessageSchema,
  type ServerMessage,
  clientMessageSchema,
  type ClientMessage,
  // New event-stream types
  redactedEventSchema,
  type RedactedEvent,
  fullEventEnvelopeSchema,
  type FullEventEnvelope,
  wireEventSchema,
  type WireEvent,
  type ViewMessage,
} from './protocol/ws';

export type {
  CampaignId,
  SeatId,
  ActorId,
  TokenId,
  SceneId,
  TomeId,
  RulesetId,
  ActionId,
  EventId,
  PromptId,
  WorkflowId,
} from './ids';

export {
  entityTypeSchema,
  type EntityType,
  audienceSchema,
  type Audience,
  promptKindSchema,
  type PromptKind,
} from './enums';

export { gameEventSchema, type GameEvent } from './event';

export {
  promptActionSchema,
  type PromptAction,
  promptSchema,
  type Prompt,
} from './prompt';

export {
  entityRefSchema,
  type EntityRef,
  sourceRefSchema,
  type SourceRef,
} from './refs';

// ── Engine boundary types (Phase 2.5) ────────────────────────────────────────

export {
  capabilitiesSchema,
  type Capabilities,
  type ActionType,
  type SceneView,
  type TokenView,
  type ActorView,
  type SeatView,
  engineInputSchema,
  type EngineInput,
  type DispatchResult,
} from './engine';

// ── Shared visibility geometry (Phase 2.5) ───────────────────────────────────

export {
  computeVisibility,
  type VisibilityPolygon,
  type Wall,
  type SceneBounds,
  type VisionParams,
} from './visibility/index';
