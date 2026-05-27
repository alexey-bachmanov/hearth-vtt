import { describe, it, expect } from 'vitest';
import {
  computeVisibility,
  type Wall,
  type SceneBounds,
  type VisionParams,
} from './index';
import type { Position } from '../entities';

// ============================================================================
// Fixtures
// ============================================================================

const BOUNDS: SceneBounds = { x: 0, y: 0, width: 1000, height: 800 };
const CENTER: Position = { x: 500, y: 400 };
const UNLIMITED: VisionParams = { radius: 0 };
const FINITE: VisionParams = { radius: 200 };
const NO_WALLS: Wall[] = [];

// ============================================================================
// Tests
// ============================================================================

describe('computeVisibility', () => {
  // ── basic contract ─────────────────────────────────────────────────────────

  it('returns at least 3 vertices (minimum valid polygon)', () => {
    expect(
      computeVisibility(CENTER, UNLIMITED, NO_WALLS, BOUNDS).length,
    ).toBeGreaterThanOrEqual(3);
    expect(
      computeVisibility(CENTER, FINITE, NO_WALLS, BOUNDS).length,
    ).toBeGreaterThanOrEqual(3);
  });

  it('is deterministic — identical inputs produce identical output', () => {
    const a = computeVisibility(CENTER, FINITE, NO_WALLS, BOUNDS);
    const b = computeVisibility(CENTER, FINITE, NO_WALLS, BOUNDS);
    expect(a).toEqual(b);
  });

  it('is pure — does not mutate its inputs', () => {
    const pos: Position = { x: 100, y: 100 };
    const params: VisionParams = { radius: 50 };
    const walls: Wall[] = [{ x1: 0, y1: 0, x2: 10, y2: 10 }];
    const bounds: SceneBounds = { x: 0, y: 0, width: 500, height: 500 };

    const posCopy = { ...pos };
    const paramsCopy = { ...params };
    const boundsCopy = { ...bounds };
    const wallsCopy = walls.map((w) => ({ ...w }));

    computeVisibility(pos, params, walls, bounds);

    expect(pos).toEqual(posCopy);
    expect(params).toEqual(paramsCopy);
    expect(bounds).toEqual(boundsCopy);
    expect(walls).toEqual(wallsCopy);
  });

  it('accepts a non-empty walls array without throwing', () => {
    const walls: Wall[] = [
      { x1: 100, y1: 0, x2: 100, y2: 800 },
      { x1: 200, y1: 200, x2: 400, y2: 200 },
    ];
    expect(() =>
      computeVisibility(CENTER, FINITE, walls, BOUNDS),
    ).not.toThrow();
  });

  // ── unlimited radius (radius === 0) ────────────────────────────────────────

  describe('unlimited radius', () => {
    it('returns exactly the 4 corners of the scene bounds', () => {
      const poly = computeVisibility(CENTER, UNLIMITED, NO_WALLS, BOUNDS);
      expect(poly).toHaveLength(4);
      expect(poly).toContainEqual({ x: BOUNDS.x, y: BOUNDS.y });
      expect(poly).toContainEqual({ x: BOUNDS.x + BOUNDS.width, y: BOUNDS.y });
      expect(poly).toContainEqual({
        x: BOUNDS.x + BOUNDS.width,
        y: BOUNDS.y + BOUNDS.height,
      });
      expect(poly).toContainEqual({ x: BOUNDS.x, y: BOUNDS.y + BOUNDS.height });
    });

    it('works regardless of token position', () => {
      const corners: Position[] = [
        { x: 0, y: 0 },
        { x: 1000, y: 800 },
        { x: 999, y: 1 },
      ];
      for (const pos of corners) {
        const poly = computeVisibility(pos, UNLIMITED, NO_WALLS, BOUNDS);
        expect(poly).toHaveLength(4);
      }
    });
  });

  // ── finite radius ──────────────────────────────────────────────────────────

  describe('finite radius', () => {
    it('returns 16 vertices for a circle approximation', () => {
      const poly = computeVisibility(CENTER, FINITE, NO_WALLS, BOUNDS);
      expect(poly).toHaveLength(16);
    });

    it('all vertices lie within the scene bounds (inclusive)', () => {
      const poly = computeVisibility(CENTER, FINITE, NO_WALLS, BOUNDS);
      for (const p of poly) {
        expect(p.x).toBeGreaterThanOrEqual(BOUNDS.x);
        expect(p.x).toBeLessThanOrEqual(BOUNDS.x + BOUNDS.width);
        expect(p.y).toBeGreaterThanOrEqual(BOUNDS.y);
        expect(p.y).toBeLessThanOrEqual(BOUNDS.y + BOUNDS.height);
      }
    });

    it('clamps to bounds when radius exceeds the scene dimensions', () => {
      const smallBounds: SceneBounds = { x: 0, y: 0, width: 100, height: 100 };
      const pos: Position = { x: 50, y: 50 };
      const bigRadius: VisionParams = { radius: 9999 };
      const poly = computeVisibility(pos, bigRadius, NO_WALLS, smallBounds);
      for (const p of poly) {
        expect(p.x).toBeGreaterThanOrEqual(smallBounds.x);
        expect(p.x).toBeLessThanOrEqual(smallBounds.x + smallBounds.width);
        expect(p.y).toBeGreaterThanOrEqual(smallBounds.y);
        expect(p.y).toBeLessThanOrEqual(smallBounds.y + smallBounds.height);
      }
    });

    it('shifts the polygon center as the token moves', () => {
      const posA: Position = { x: 200, y: 200 };
      const posB: Position = { x: 700, y: 600 };
      const polyA = computeVisibility(posA, FINITE, NO_WALLS, BOUNDS);
      const polyB = computeVisibility(posB, FINITE, NO_WALLS, BOUNDS);
      // At least one vertex must differ between the two positions.
      expect(polyA).not.toEqual(polyB);
    });

    it('works when token is at a scene corner', () => {
      const corner: Position = { x: 0, y: 0 };
      expect(() =>
        computeVisibility(corner, FINITE, NO_WALLS, BOUNDS),
      ).not.toThrow();
    });
  });
});
