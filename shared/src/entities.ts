/**
 * Core game-entity types shared across server and client.
 *
 * These are the canonical definitions for Scene, Token, Actor, and their
 * supporting types. Both the server (for validation and persistence) and the
 * client (for state management and rendering) import from here.
 *
 * Zod schemas are provided for boundary validation (HTTP bodies, WS messages,
 * imported campaign files). Internal code should use the inferred TS types.
 */

import { z } from 'zod';

// ============================================================================
// GridType
// ============================================================================

export const gridTypeSchema = z.enum(['square', 'hex', 'none']);

/**
 * Grid overlay type for a scene.
 *
 * - `square` — traditional square grid (e.g. D&D 5-ft squares)
 * - `hex`    — hexagonal grid (flat-top or pointy-top TBD per scene config)
 * - `none`   — no grid overlay
 */
export type GridType = z.infer<typeof gridTypeSchema>;

// ============================================================================
// Position
// ============================================================================

export const positionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

/**
 * 2-D position in world-space pixels.
 *
 * Origin (0, 0) is the top-left corner of the scene background image.
 * Token positions refer to the top-left corner of the token's bounding box.
 */
export type Position = z.infer<typeof positionSchema>;

// ============================================================================
// SceneBackground
// ============================================================================

export const sceneBackgroundSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('image'), url: z.string() }),
  z.object({ kind: z.literal('video'), url: z.string() }),
]);

/**
 * Discriminated union describing the background media for a scene.
 *
 * - `{ kind: 'image', url }` — static image (.jpg, .png, .webp, etc.)
 * - `{ kind: 'video', url }` — looping animated background (.webm, .mp4)
 *
 * The URL is a path to a campaign asset served over HTTP by the game server.
 */
export type SceneBackground = z.infer<typeof sceneBackgroundSchema>;

// ============================================================================
// Scene
// ============================================================================

export const sceneSchema = z.object({
  /** Unique scene identifier. */
  id: z.string(),
  /** Display name shown in scene selector and QuickStatus overlay. */
  name: z.string(),
  /**
   * Background media for this scene.
   */
  background: sceneBackgroundSchema.optional(),
  /** Grid type for this scene. */
  gridType: gridTypeSchema,
  /** Pixels per grid cell (e.g. 50 means one 50×50 px square = one grid unit). */
  gridSize: z.number(),
  /** Human-readable scale label (e.g. "5ft", "10m"). */
  gridScale: z.string(),
  /** Total scene width in pixels (background image / video native width). */
  width: z.number(),
  /** Total scene height in pixels (background image / video native height). */
  height: z.number(),
  /**
   * Opaque gameplay data blob.
   *
   * Rulesets store scene-specific state here. The core engine never inspects
   * the contents.
   */
  data: z.record(z.string(), z.unknown()),
});

/**
 * A scene (map / location) in a campaign.
 *
 * Scenes contain a background image or video, a grid configuration, and
 * serve as the container for tokens, obstructions, and lighting.
 */
export type Scene = z.infer<typeof sceneSchema>;

// ============================================================================
// Token
// ============================================================================

export const tokenSchema = z.object({
  /** Unique token identifier. */
  id: z.string(),
  /** The actor this token represents. */
  actorId: z.string(),
  /** The scene this token is placed in. */
  sceneId: z.string(),
  /** Display name shown above the token on the map. */
  name: z.string(),
  /** URL of the token image/icon displayed on the map. */
  imageUrl: z.string(),
  /** World-space position (top-left of bounding box), in pixels. */
  position: positionSchema,
  /** Size in grid squares (1 = medium / 1×1, 2 = large / 2×2, etc.). */
  size: z.number(),
  /** Rotation in degrees (0 = facing up). */
  rotation: z.number().optional(),
  /** If true, the token is hidden from players and visible only to the GM. */
  hidden: z.boolean().optional(),
  /**
   * Opaque gameplay data blob.
   *
   * Rulesets store token-specific state here. The core engine never inspects
   * the contents.
   */
  data: z.record(z.string(), z.unknown()),
});

/**
 * A token placed on a scene.
 *
 * A token is the visual representation of an actor on the map. Multiple tokens
 * can reference the same actor (e.g. summoned duplicates, familiars).
 */
export type Token = z.infer<typeof tokenSchema>;

// ============================================================================
// Actor
// ============================================================================

export const actorSeatPermissionSchema = z.enum(['control', 'read']);

/** Permission level a seat has over an actor. */
export type ActorSeatPermission = z.infer<typeof actorSeatPermissionSchema>;

export const actorSchema = z.object({
  /** Unique actor identifier. */
  id: z.string(),
  /** Display name. */
  name: z.string(),
  /**
   * Per-seat permission map.
   *
   * Keys are seat IDs; values are `'control'` (full edit access) or `'read'`
   * (view-only). GM-role seats have implicit full access and are not listed here.
   */
  seatPermissions: z.record(actorSeatPermissionSchema),
  /**
   * Opaque gameplay data blob.
   *
   * Rulesets store game-mechanics state here (HP, stats, inventory, etc.).
   * The core engine never inspects the contents — it is passed through to
   * ruleset resolvers and client UI components.
   */
  data: z.record(z.string(), z.unknown()),
});

/**
 * An actor (character, creature, or NPC) in a campaign.
 *
 * Actors hold game-mechanics state in the opaque `data` blob. Their visual
 * presence on a scene is represented by one or more Token objects.
 */
export type Actor = z.infer<typeof actorSchema>;

// ============================================================================
// PlayerAccount
// ============================================================================

export const playerAccountSchema = z.object({
  /** Unique account identifier. */
  id: z.string(),
  /**
   * Username chosen by the player at registration time.
   *
   * Case-insensitive unique per server. ASCII alphanumeric + `_-.`, 2–32 chars.
   */
  username: z.string(),
  /**
   * When true, the player must change their password on next login.
   *
   * Set by admin when issuing a temporary password via
   * `POST /api/admin/accounts/:id/reset-password`.
   */
  mustChangePassword: z.boolean(),
  /** ISO-8601 timestamp of account creation. */
  createdAt: z.string(),
  /** ISO-8601 timestamp of last successful login, or null if never logged in. */
  lastLoginAt: z.string().nullable(),
});

/**
 * A server-local player identity.
 *
 * A PlayerAccount is not tied to any single campaign; it can hold seats across
 * multiple campaigns on the same server. It is the unit of authentication
 * (username + password), session ownership, and admin management.
 *
 * See ADR-010 and docs/components/auth-join-flow.md for the full model.
 */
export type PlayerAccount = z.infer<typeof playerAccountSchema>;
