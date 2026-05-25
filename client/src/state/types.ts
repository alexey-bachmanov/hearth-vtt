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
 * Canonical definition lives in @hearth-vtt/shared.
 */
export type { GridType } from '@hearth-vtt/shared';

/**
 * 2D position coordinates (pixels or grid units depending on context).
 * Canonical definition lives in @hearth-vtt/shared.
 */
export type { Position } from '@hearth-vtt/shared';
