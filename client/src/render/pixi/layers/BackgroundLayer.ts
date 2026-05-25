/**
 * BackgroundLayer — renders the scene's map background image.
 *
 * Loads the map image URL via PixiJS Assets and displays it as a Sprite
 * sized to the scene's declared pixel dimensions. Handles scene swaps
 * cleanly (old texture is destroyed, new one loaded).
 *
 * Animated maps are deferred to a future phase.
 */

import { Assets, Container, Sprite, Texture } from 'pixi.js';
import type { Scene } from '@hearth-vtt/shared';

export class BackgroundLayer {
  readonly container: Container;

  private _sprite: Sprite | null = null;
  private _loadingUrl: string | null = null;

  constructor() {
    this.container = new Container();
    this.container.label = 'background';
  }

  /**
   * Update the background to match the given scene.
   * If scene is undefined or has no image URL the layer is cleared.
   */
  async setScene(scene: Scene | undefined): Promise<void> {
    const url = scene?.background?.url ?? scene?.mapImageUrl ?? '';

    if (!url) {
      this._clear();
      return;
    }

    // Skip reload if we're already showing (or loading) this URL.
    if (url === this._loadingUrl) return;
    this._loadingUrl = url;

    try {
      const texture: Texture = await Assets.load(url);

      // Guard against a stale load completing after the scene changed again.
      if (url !== this._loadingUrl) return;

      this._applyTexture(texture, scene!);
    } catch {
      // URL failed — clear and leave the layer blank (renderer stays functional).
      if (url === this._loadingUrl) {
        this._clear();
      }
    }
  }

  /**
   * Destroy all PixiJS resources held by this layer.
   */
  destroy(): void {
    this._clear();
    this.container.destroy({ children: true });
  }

  // ---- private helpers -------------------------------------------------------

  private _applyTexture(texture: Texture, scene: Scene): void {
    // Reuse existing sprite if possible; create otherwise.
    if (!this._sprite) {
      this._sprite = new Sprite(texture);
      this.container.addChild(this._sprite);
    } else {
      this._sprite.texture = texture;
    }

    // Size the sprite to the scene's declared dimensions so that world-space
    // coordinates (grid units × gridSize) map cleanly onto the background.
    this._sprite.width = scene.width;
    this._sprite.height = scene.height;
    this._sprite.x = 0;
    this._sprite.y = 0;
  }

  private _clear(): void {
    this._loadingUrl = null;
    if (this._sprite) {
      this._sprite.destroy();
      this._sprite = null;
    }
  }
}
