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
  playerAccountSchema,
  type PlayerAccount,
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
  AccountId,
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

// ── Notification 2×2 model ──────────────────────────────────────────────────

export {
  notificationOriginSchema,
  type NotificationOrigin,
  notificationLifetimeSchema,
  type NotificationLifetime,
} from './notification';

// NOTE: refs.ts (EntityRef, SourceRef) was deleted in Engine v0.2 Phase 1.
// These types had zero consumers. See shared/src/refs.ts for details.

// ── HearthML ruleset UI types ──────────────────────────────────────────────

export {
  bindingSchema,
  type Binding,
  styleTokensSchema,
  type StyleTokens,
  sxPropsSchema,
  type SxProps,
  panelNodeSchema,
  type PanelNode,
  panelSlotSchema,
  type PanelSlot,
  panelDefSchema,
  type PanelDef,
} from './ruleset-ui';

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
  diceRollPayloadSchema,
  type DiceRollPayload,
} from './engine';

// ── Shared visibility geometry (Phase 2.5) ───────────────────────────────────

export {
  computeVisibility,
  type VisibilityPolygon,
  type Wall,
  type SceneBounds,
  type VisionParams,
} from './visibility/index';

// ── HTTP API schemas (Phase 2.6) ─────────────────────────────────────────────

export {
  seatSummarySchema,
  type SeatSummary,
  meResponseSchema,
  type MeResponse,
  loginRequestSchema,
  type LoginRequest,
  loginResponseSchema,
  type LoginResponse,
  refreshResponseSchema,
  type RefreshResponse,
  claimInviteRequestSchema,
  type ClaimInviteRequest,
  claimInviteResponseSchema,
  type ClaimInviteResponse,
  adminAccountSummarySchema,
  type AdminAccountSummary,
  adminAccountsResponseSchema,
  type AdminAccountsResponse,
  adminResetPasswordRequestSchema,
  type AdminResetPasswordRequest,
  changePasswordRequestSchema,
  type ChangePasswordRequest,
} from './protocol/http';
