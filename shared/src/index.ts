// @hearth-vtt/shared — public API barrel
// Exports are added here as modules are implemented.

export { seatRoleSchema, type SeatRole } from './seat';
export {
  serverMessageSchema,
  type ServerMessage,
  clientMessageSchema,
  type ClientMessage,
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

export type {
  CampaignState,
  Snapshot,
  Action,
  ActionEnvelope,
  Resolution,
  SyncBundle,
} from './stubs';

export {
  PatchError,
  patchOpSchema,
  type PatchOp,
  patchSchema,
  type Patch,
  applyPatches,
} from './patch';

export { gameEventSchema, type GameEvent } from './event';

export {
  promptActionSchema,
  type PromptAction,
  promptSchema,
  type Prompt,
} from './prompt';

export { workflowStateSchema, type WorkflowState } from './workflow';

export {
  entityRefSchema,
  type EntityRef,
  sourceRefSchema,
  type SourceRef,
} from './refs';
