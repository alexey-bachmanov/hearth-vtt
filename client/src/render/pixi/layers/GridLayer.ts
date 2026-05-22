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

    if (!scene || scene.gridType === 'none') return;

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
