/**
 * GridLayer — renders the scene grid overlay.
 *
 * Draws a square grid using PixiJS Graphics, sized to scene.gridSize (pixels
 * per grid square) and covering the full scene extent.
 *
 * Hex grid support is deferred to a future phase; only 'square' is drawn now.
 */

import { Container, Graphics } from 'pixi.js';
import type { Scene } from '../../../state/campaign.svelte';

const GRID_COLOR = 0x000000;
const GRID_ALPHA = 0.2;
const GRID_LINE_WIDTH = 1;

// Fallback grid drawn when no scene is loaded, so pan/zoom are visually
// verifiable without real map data.
const FALLBACK_CELL = 50; // pixels per square
const FALLBACK_EXTENT = 4000; // half-width/height of the drawn area
const FALLBACK_COLOR = 0x6688aa;
const FALLBACK_ALPHA = 0.25;

export class GridLayer {
  readonly container: Container;

  private _graphics: Graphics;

  constructor() {
    this.container = new Container();
    this.container.label = 'grid';

    this._graphics = new Graphics();
    this.container.addChild(this._graphics);
  }

  /**
   * Redraw the grid to match the given scene.
   * Clears if scene is undefined or gridType is 'none'.
   */
  setScene(scene: Scene | undefined): void {
    this._graphics.clear();

    if (!scene) {
      this._drawFallbackGrid();
      return;
    }

    if (scene.gridType === 'none') return;

    if (scene.gridType === 'square') {
      this._drawSquareGrid(scene);
    }
    // TODO: hex grid — deferred to a future phase
  }

  /**
   * Destroy all PixiJS resources held by this layer.
   */
  destroy(): void {
    this.container.destroy({ children: true });
  }

  // ---- private helpers -------------------------------------------------------

  /**
   * Draw a faint infinite-ish grid centered at the world origin.
   * Shown when no scene is loaded so pan and zoom are visually verifiable.
   */
  private _drawFallbackGrid(): void {
    const g = this._graphics;
    const e = FALLBACK_EXTENT;
    const cell = FALLBACK_CELL;

    g.setStrokeStyle({
      width: GRID_LINE_WIDTH,
      color: FALLBACK_COLOR,
      alpha: FALLBACK_ALPHA,
    });

    for (let x = -e; x <= e; x += cell) {
      g.moveTo(x, -e).lineTo(x, e);
    }
    for (let y = -e; y <= e; y += cell) {
      g.moveTo(-e, y).lineTo(e, y);
    }

    g.stroke();
  }

  private _drawSquareGrid(scene: Scene): void {
    const { width, height, gridSize } = scene;
    const g = this._graphics;

    g.setStrokeStyle({
      width: GRID_LINE_WIDTH,
      color: GRID_COLOR,
      alpha: GRID_ALPHA,
    });

    // Vertical lines
    for (let x = 0; x <= width; x += gridSize) {
      g.moveTo(x, 0).lineTo(x, height);
    }

    // Horizontal lines
    for (let y = 0; y <= height; y += gridSize) {
      g.moveTo(0, y).lineTo(width, y);
    }

    g.stroke();
  }
}
