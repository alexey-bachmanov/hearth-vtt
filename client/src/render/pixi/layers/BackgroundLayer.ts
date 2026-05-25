/**
 * BackgroundLayer — renders the scene's map background image or video.
 *
 * Loads the map URL via PixiJS Assets (for images) or an HTML <video>
 * element (for videos) and displays it as a Sprite sized to the scene's
 * declared pixel dimensions. Handles scene swaps cleanly (old texture is
 * destroyed/video paused, new one loaded).
 *
 * background.kind === 'image': standard Assets.load path.
 * background.kind === 'video': muted, looping <video> element →
 *   Texture.from(videoElement). PixiJS's global ticker auto-uploads each
 *   decoded frame to the GPU texture, so animation plays automatically once
 *   the sprite is on stage. The element is paused and released on scene swap.
 */

import { Assets, Container, Sprite, Texture } from 'pixi.js';
import type { Scene } from '@hearth-vtt/shared';

export class BackgroundLayer {
  readonly container: Container;

  private _sprite: Sprite | null = null;
  private _loadingUrl: string | null = null;
  /** Kept so we can pause/release on scene swap when kind === 'video'. */
  private _videoElement: HTMLVideoElement | null = null;

  constructor() {
    this.container = new Container();
    this.container.label = 'background';
  }

  /**
   * Update the background to match the given scene.
   * If scene is undefined or has no background URL the layer is cleared.
   */
  async setScene(scene: Scene | undefined): Promise<void> {
    const kind = scene?.background?.kind;
    const url = scene?.background?.url ?? scene?.mapImageUrl ?? '';

    if (!url) {
      this._clear();
      return;
    }

    // Skip reload if we're already showing (or loading) this URL.
    if (url === this._loadingUrl) return;
    this._loadingUrl = url;

    try {
      const texture: Texture =
        kind === 'video'
          ? await this._loadVideoTexture(url)
          : await Assets.load(url);

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

  /**
   * Create a playing <video> element and return a PixiJS Texture backed by it.
   *
   * The video element is not added to the DOM — PixiJS reads decoded frames
   * directly from the element via a VideoSource updated each ticker tick.
   *
   * The element is stored in `_videoElement` so `_clear()` can pause it on
   * scene swap, preventing off-screen video from consuming decode resources.
   */
  private async _loadVideoTexture(url: string): Promise<Texture> {
    const video = document.createElement('video');
    video.src = url;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    // Explicit attribute required for iOS (property setter alone is not sufficient).
    video.setAttribute('playsinline', '');

    await new Promise<void>((resolve, reject) => {
      video.addEventListener('canplay', () => resolve(), { once: true });
      video.addEventListener(
        'error',
        () =>
          reject(
            new Error(`BackgroundLayer: failed to load video "${url}"`),
          ),
        { once: true },
      );
      video.load();
    });

    // Track so _clear() can pause on scene swap or destroy.
    this._videoElement = video;

    // Awaiting play() surfaces autoplay-policy rejections to the caller's
    // catch block so the layer clears gracefully instead of showing a stale
    // frame. Muted video is exempt from most browser autoplay restrictions.
    await video.play();

    return Texture.from(video);
  }

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
    if (this._videoElement) {
      this._videoElement.pause();
      // Clear src so the browser releases the media resource.
      this._videoElement.src = '';
      this._videoElement = null;
    }
    if (this._sprite) {
      this._sprite.destroy();
      this._sprite = null;
    }
  }
}
