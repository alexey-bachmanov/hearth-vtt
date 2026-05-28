/**
 * Opaque identifier type aliases.
 *
 * All identifiers are plain string aliases for now. Upgrade to branded types
 * (e.g. `string & { readonly __brand: 'CampaignId' }`) when compile-time
 * enforcement is needed — changing a single definition here propagates the
 * upgrade to every call site automatically.
 */

export type AccountId = string;
export type CampaignId = string;
export type SeatId = string;
export type ActorId = string;
export type TokenId = string;
export type SceneId = string;
export type TomeId = string;
export type RulesetId = string;
export type ActionId = string;
export type EventId = string;
export type PromptId = string;
export type WorkflowId = string;
