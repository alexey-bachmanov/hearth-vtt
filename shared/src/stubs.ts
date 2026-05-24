/**
 * Placeholder types for complex domain objects whose concrete shapes will be
 * defined once the GameEngine sprint (implementation-strategy Phase 3) is
 * underway.
 *
 * `CampaignState` carries the minimal shape required by `applyPatches`. All
 * other stubs are `unknown` — they exist so downstream code can reference
 * the names today and get the real types for free when this file is updated.
 */

/**
 * Current authoritative state of a campaign.
 *
 * Minimal stub shape — entities are stored in a flat map keyed by entity id.
 * Extend this type during the GameEngine sprint once entity schemas and scene
 * state are finalised.
 */
export type CampaignState = {
  entities: Record<string, Record<string, unknown>>;
};

/** Persisted point-in-time snapshot of a CampaignState (shape TBD). */
export type Snapshot = unknown;

/** An intent emitted by a client or resolver (shape TBD). */
export type Action = unknown;

/** An Action wrapped with routing and auth metadata (shape TBD). */
export type ActionEnvelope = unknown;

/** The output of RulesetRuntime.resolve() (shape TBD). */
export type Resolution = unknown;

/** Initial state bundle sent to a client on WebSocket connect (shape TBD). */
export type SyncBundle = unknown;
