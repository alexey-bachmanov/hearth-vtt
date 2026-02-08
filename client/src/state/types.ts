/**
 * Common types shared across state stores.
 *
 * This module contains type definitions used by multiple state stores
 * to avoid duplication and ensure consistency.
 */

/**
 * Seat role for permission gating.
 *
 * - gm: Game master with full permissions
 * - player: Player with limited permissions
 * - spectator: Observer with read-only access
 * - null: No seat assigned (not logged in)
 */
export type SeatRole = 'gm' | 'player' | 'spectator' | null;

/**
 * Grid type for scenes and viewport.
 *
 * - square: Traditional D&D-style square grid
 * - hex: Hexagonal grid (flat-top or pointy-top)
 * - none: No grid overlay
 */
export type GridType = 'square' | 'hex' | 'none';

/**
 * 2D position coordinates (pixels or grid units depending on context).
 */
export interface Position {
  x: number;
  y: number;
}
