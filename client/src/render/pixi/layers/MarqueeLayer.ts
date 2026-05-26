/**
 * MarqueeLayer — screen-space selection rectangle overlay.
 *
 * Added directly to app.stage (not inside worldContainer) so the rectangle
 * stays fixed in screen space while the user drags, independent of pan/zoom.
 *
 * Styling: semi-transparent fill + 1 px border using the accent colour shared
 * with selection rings (TokenLayer, D6).
 *
 * Usage:
 *   layer.setRect({ x, y, w, h })  — draw or update rectangle (screen coords)
 *   layer.setRect(null)            — hide rectangle
 */

import { Container, Graphics } from 'pixi.js';

/** Accent colour — matches selection rings defined in TokenLayer (D6). */
const ACCENT = 0x4da6ff;

export class MarqueeLayer {
  readonly container: Container;
  private _gfx: Graphics;

  constructor() {
    this.container = new Container();
    this.container.label = 'marquee';
    this._gfx = new Graphics();
    this.container.addChild(this._gfx);
  }

  /**
   * Draw or update the selection rectangle.
   * @param rect Screen-space coordinates. Pass `null` to clear.
   */
  setRect(rect: { x: number; y: number; w: number; h: number } | null): void {
    this._gfx.clear();
    if (!rect || rect.w === 0 || rect.h === 0) return;
    // In PixiJS v8, fill() consumes the current path. setStrokeStyle must be
    // set before drawing the shape, and stroke() called after fill().
    this._gfx.setStrokeStyle({ color: ACCENT, alpha: 0.8, width: 1 });
    this._gfx.rect(rect.x, rect.y, rect.w, rect.h);
    this._gfx.fill({ color: ACCENT, alpha: 0.15 });
    this._gfx.stroke();
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
