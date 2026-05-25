/**
 * OverlayLayer — world-space overlay reservation for ambient scene effects.
 *
 * Currently a no-op placeholder that reserves a slot in the world-container
 * layer stack directly above tokens. Future content (rain, snow, particle
 * emitters, area-of-effect fog, etc.) will be rendered here without
 * restructuring the layer order.
 *
 * Layer order inside worldContainer (bottom → top):
 *   BackgroundLayer → GridLayer → TokenLayer → OverlayLayer → (Lighting TBD)
 *
 * The renderer exposes a `setOverlay(spec)` stub; its implementation is
 * intentionally deferred until specific effect types are designed.
 */

import { Container } from 'pixi.js';

export class OverlayLayer {
  readonly container: Container;

  constructor() {
    this.container = new Container();
    this.container.label = 'overlay';
  }

  /**
   * Destroy all PixiJS resources held by this layer.
   * Nothing to do yet — the placeholder container has no children.
   */
  destroy(): void {
    this.container.destroy({ children: true });
  }
}
