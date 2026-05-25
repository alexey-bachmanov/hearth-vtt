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
   *
   * Replaces the legacy `mapImageUrl` field. When both are present, `background`
   * takes precedence. When only `mapImageUrl` is present, the renderer falls back
   * to treating it as `{ kind: 'image', url: mapImageUrl }`.
   */
  background: sceneBackgroundSchema.optional(),
  /**
   * @deprecated Use `background` instead.
   *
   * Legacy static image URL. Kept for backward compatibility during the
   * transition to the discriminated `background` field. Will be removed once
   * all scene data uses `background`.
   */
  mapImageUrl: z.string().optional(),
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
  /** World-space position (top-left of bounding box), in pixels. */
  position: positionSchema,
  /** Size in grid squares (1 = medium / 1×1, 2 = large / 2×2, etc.). */
  size: z.number(),
  /** Rotation in degrees (0 = facing up). */
  rotation: z.number().optional(),
  /** If true, the token is hidden from players and visible only to the GM. */
  hidden: z.boolean().optional(),
});

/**
 * A token placed on a scene.
 *
 * A token is the visual representation of an actor on the map. Multiple tokens
 * can reference the same actor (e.g. summoned duplicates, familiars). Token
 * state (position, visibility) is scene-specific; actor state (HP, inventory)
 * is shared across all tokens for that actor.
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
   * Actor category.
   *
   * - `pc`      — player character (controlled by a seat)
   * - `npc`     — non-player character (controlled by the GM)
   * - `monster` — creature from a tome/compendium (controlled by the GM)
   */
  type: z.enum(['pc', 'npc', 'monster']),
  /**
   * Per-seat permission map.
   *
   * Keys are seat IDs; values are `'control'` (full edit access) or `'read'`
   * (view-only). GM-role seats have implicit full access and are not listed here.
   */
  seatPermissions: z.record(actorSeatPermissionSchema),
  /** Hit points. */
  hp: z.object({
    current: z.number(),
    max: z.number(),
  }),
  /** Armor class. */
  ac: z.number(),
  /** Class level (optional — only for levelled PCs). */
  level: z.number().optional(),
  /** Character class name (optional). */
  class: z.string().optional(),
  /** True when the actor is concentrating on a spell or effect. */
  isConcentrating: z.boolean().optional(),
  /** Active condition names (e.g. "Poisoned", "Prone"). */
  conditions: z.array(z.string()).optional(),
});

/**
 * An actor (character, creature, or NPC) in a campaign.
 *
 * Actors hold game-mechanics state (HP, conditions, inventory). Their visual
 * presence on a scene is represented by one or more Token objects.
 */
export type Actor = z.infer<typeof actorSchema>;
