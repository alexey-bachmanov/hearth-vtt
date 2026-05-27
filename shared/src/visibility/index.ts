/**
 * Shared visibility geometry.
 *
 * Pure function used by:
 * - The server engine (authoritative fog-of-war mask computation and the
 *   polygon carried in `fog.revealed` events)
 * - The client renderer (optimistic lit-area overlay derived from current
 *   token position — never persisted, snaps back automatically on rejection)
 *
 * **Key invariant:** the server sends authoritative polygons in `fog.revealed`
 * events. The client uses `computeVisibility` *only* for the local lit overlay.
 * Server and client output do not need to be bit-identical; only display
 * depends on this function client-side.
 *
 * **Wall raycasting is not yet implemented.** Walls are accepted in the
 * signature for forward compatibility and are currently ignored. The function
 * returns the full scene bounds (unlimited radius) or an approximated circle
 * polygon (finite radius) clamped to bounds.
 *
 * @see docs/decisions/011-engine-facade-and-dsl-reversal.md §fog-payload
 */

import type { Position } from '../entities';

// ============================================================================
// Types
// ============================================================================

/**
 * A 2-D visibility polygon: an ordered array of vertices with no closing
 * duplicate. The polygon is implicitly closed between the last and first
 * vertex.
 */
export type VisibilityPolygon = Position[];

/**
 * A wall segment that blocks line-of-sight.
 *
 * Coordinates are in world-space pixels, matching the coordinate system used
 * by `Position` in `entities.ts`.
 */
export type Wall = {
  /** X coordinate of the start point. */
  x1: number;
  /** Y coordinate of the start point. */
  y1: number;
  /** X coordinate of the end point. */
  x2: number;
  /** Y coordinate of the end point. */
  y2: number;
};

/**
 * Axis-aligned bounding rectangle for a scene, in world-space pixels.
 *
 * Origin (x, y) is the top-left corner. Width and height extend right and
 * downward respectively, matching the canvas coordinate system.
 */
export type SceneBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Vision parameters for a token.
 *
 * - `radius === 0`: unlimited vision — the full scene bounds are visible.
 * - `radius > 0`: vision is constrained to a circle of `radius` world pixels
 *   centered on the token, clamped to the scene bounds.
 */
export type VisionParams = {
  /** Vision radius in world pixels. Use `0` for unlimited vision. */
  radius: number;
};

// ============================================================================
// Implementation
// ============================================================================

/**
 * Number of polygon vertices used to approximate a circular vision area.
 *
 * 16 segments gives a reasonable circle approximation for typical VTT scales
 * without excessive vertex count. Increase for smoother circles if needed.
 */
const CIRCLE_SEGMENTS = 16;

/**
 * Compute the visibility polygon from a token's position.
 *
 * Returns the region visible from `tokenPos` given the supplied vision
 * parameters, walls, and scene bounds.
 *
 * **Current implementation note:** wall occlusion is not yet implemented.
 * The `walls` parameter is accepted for API stability but is ignored. The
 * return value is:
 * - `radius === 0`: the four corners of `bounds` (full scene rectangle).
 * - `radius > 0`: a regular `CIRCLE_SEGMENTS`-gon centered on `tokenPos`,
 *   with each vertex clamped to lie within `bounds`.
 *
 * @param tokenPos - World-space position of the token (vision origin).
 * @param visionParams - Vision parameters (radius; more fields TBD).
 * @param walls - Wall segments blocking line-of-sight (currently ignored).
 * @param bounds - The scene bounding box used to clamp the result.
 * @returns An ordered polygon of at least 3 vertices representing the lit
 *   area visible from `tokenPos`.
 */
export function computeVisibility(
  tokenPos: Position,
  visionParams: VisionParams,
  walls: Wall[],
  bounds: SceneBounds,
): VisibilityPolygon {
  // Suppress unused-variable lint until raycasting is implemented.
  void walls;

  if (visionParams.radius <= 0) {
    return boundsPolygon(bounds);
  }

  return circlePolygon(tokenPos, visionParams.radius, bounds);
}

// ============================================================================
// Private helpers
// ============================================================================

/** Return the four corners of `bounds` as a clockwise polygon. */
function boundsPolygon(bounds: SceneBounds): VisibilityPolygon {
  const { x, y, width, height } = bounds;
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];
}

/**
 * Return a regular `CIRCLE_SEGMENTS`-gon centered on `center` with the given
 * `radius`, clamping each vertex to lie within `bounds`.
 */
function circlePolygon(
  center: Position,
  radius: number,
  bounds: SceneBounds,
): VisibilityPolygon {
  const vertices: VisibilityPolygon = [];
  for (let i = 0; i < CIRCLE_SEGMENTS; i++) {
    const angle = (2 * Math.PI * i) / CIRCLE_SEGMENTS;
    const x = clamp(
      center.x + radius * Math.cos(angle),
      bounds.x,
      bounds.x + bounds.width,
    );
    const y = clamp(
      center.y + radius * Math.sin(angle),
      bounds.y,
      bounds.y + bounds.height,
    );
    vertices.push({ x, y });
  }
  return vertices;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
