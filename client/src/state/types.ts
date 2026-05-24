/**
 * Common types shared across state stores.
 *
 * This module contains type definitions used by multiple state stores
 * to avoid duplication and ensure consistency.
 */

/**
 * Seat role for permission gating. Canonical definition lives in @hearth-vtt/shared.
 * Use `SeatRole | null` where no seat is assigned (e.g. before login).
 */
export type { SeatRole } from '@hearth-vtt/shared';

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
