/**
 * TokenLayer — renders token sprites on the map.
 *
 * Maintains a Map<tokenId, Sprite> and diffs incoming token lists:
 * - new tokens → create sprite
 * - removed tokens → destroy sprite
 * - changed tokens → update position/size/rotation
 *
 * Token images are loaded from the associated actor's imageUrl (not yet wired
 * to CampaignState here — the caller provides a pre-resolved list). When no
 * image is available a colored circle placeholder is used instead.
 *
 * setTokenDragPreview / clearTokenDragPreview override a token's rendered
 * position without mutating campaign state.
 */

import {
  Assets,
  Container,
  Graphics,
  Sprite,
  Texture,
  RenderTexture,
  type Application,
} from 'pixi.js';
import type { Token } from '../../../state/campaign.svelte';
import type { Position } from '../../../state/types';

// Placeholder circle colors keyed by token type hint (stored in token metadata TBD).
// For now every token gets a distinct hue based on a hash of its id.
const PLACEHOLDER_COLORS = [
  0x4a90d9, // blue
  0xe74c3c, // red
  0x2ecc71, // green
  0xf39c12, // orange
  0x9b59b6, // purple
  0x1abc9c, // teal
];

const DRAG_GHOST_ALPHA = 0.5;
const DRAG_GHOST_OUTLINE_COLOR = 0xffffff;
const DRAG_GHOST_OUTLINE_WIDTH = 2;

/** Sprite wrapper that remembers committed position and drag-override state. */
interface TokenSprite {
  sprite: Sprite;
  token: Token; // last committed token data
  dragging: boolean;
}

export class TokenLayer {
  readonly container: Container;

  /** Separate container for drag-preview ghosts (above normal token sprites). */
  readonly overlayContainer: Container;

  private _sprites: Map<string, TokenSprite> = new Map();
  private _app: Application;

  constructor(app: Application) {
    this._app = app;
    this.container = new Container();
    this.container.label = 'tokens';

    this.overlayContainer = new Container();
    this.overlayContainer.label = 'token-overlay';
  }

  /**
   * Synchronize rendered sprites with the current token list.
   * Tokens not in the incoming list are removed; new ones are created.
   */
  updateTokens(tokens: Token[]): void {
    const incomingIds = new Set(tokens.map((t) => t.id));

    // Remove sprites for tokens no longer in the scene.
    for (const [id, entry] of this._sprites) {
      if (!incomingIds.has(id)) {
        entry.sprite.destroy();
        this._sprites.delete(id);
      }
    }

    // Create or update sprites for each token.
    for (const token of tokens) {
      const existing = this._sprites.get(token.id);
      if (existing) {
        this._applyTokenData(existing, token);
      } else {
        this._createSprite(token);
      }
    }
  }

  /**
   * Override the rendered position of a token while it is being dragged.
   * Does not mutate campaign state.
   */
  setTokenDragPreview(tokenId: string, worldPosition: Position): void {
    const entry = this._sprites.get(tokenId);
    if (!entry) return;

    entry.dragging = true;
    entry.sprite.alpha = DRAG_GHOST_ALPHA;
    entry.sprite.x = worldPosition.x;
    entry.sprite.y = worldPosition.y;
  }

  /**
   * Restore the token sprite to its committed position after a drag ends.
   */
  clearTokenDragPreview(tokenId: string): void {
    const entry = this._sprites.get(tokenId);
    if (!entry) return;

    entry.dragging = false;
    entry.sprite.alpha = 1;
    this._positionSprite(entry.sprite, entry.token);
  }

  /**
   * Return the id of the topmost token sprite whose bounds contain the
   * given screen-space point, or null if none.
   *
   * We iterate in reverse insertion order (last-added = topmost).
   */
  hitTestToken(screenX: number, screenY: number): string | null {
    const entries = [...this._sprites.entries()].reverse();
    for (const [id, entry] of entries) {
      const bounds = entry.sprite.getBounds();
      if (
        screenX >= bounds.x &&
        screenX <= bounds.x + bounds.width &&
        screenY >= bounds.y &&
        screenY <= bounds.y + bounds.height
      ) {
        return id;
      }
    }
    return null;
  }

  /**
   * Destroy all PixiJS resources held by this layer.
   */
  destroy(): void {
    this.container.destroy({ children: true });
    this.overlayContainer.destroy({ children: true });
    this._sprites.clear();
  }

  // ---- private helpers -------------------------------------------------------

  private _createSprite(token: Token): void {
    const sprite = new Sprite(this._placeholderTexture(token));
    sprite.anchor.set(0.5);
    this._positionSprite(sprite, token);
    this.container.addChild(sprite);

    this._sprites.set(token.id, { sprite, token, dragging: false });
  }

  private _applyTokenData(entry: TokenSprite, token: Token): void {
    entry.token = token;
    if (!entry.dragging) {
      this._positionSprite(entry.sprite, token);
    }
  }

  private _positionSprite(sprite: Sprite, token: Token): void {
    // Token position in world-space is the center of the token's grid cell(s).
    sprite.x = token.position.x;
    sprite.y = token.position.y;

    // Scale: token.size is grid squares; gridSize is baked into world coords.
    // The placeholder texture is 64×64; scale to match world pixel size.
    // We rely on the scene gridSize, but TokenLayer doesn't have direct access —
    // the caller (PixiRenderer) passes pre-scaled world-space positions, so
    // size is handled via the texture's natural size × a uniform scale.
    // For the placeholder, just use size directly as pixels.
    const diameter = token.size * 50; // default gridSize = 50px
    sprite.width = diameter;
    sprite.height = diameter;

    sprite.rotation = token.rotation ? (token.rotation * Math.PI) / 180 : 0;
    sprite.alpha = token.hidden ? 0.4 : 1;
  }

  /**
   * Generate a colored circle texture to use when a token has no image.
   * Textures are cached in PixiJS's own asset cache.
   */
  private _placeholderTexture(token: Token): Texture {
    const cacheKey = `placeholder-token-${token.id}`;

    // Return cached texture if it already exists.
    if (Assets.cache.has(cacheKey)) {
      return Assets.cache.get(cacheKey) as Texture;
    }

    const size = 64;
    const color = PLACEHOLDER_COLORS[this._colorIndex(token.id)];

    const g = new Graphics();
    g.circle(size / 2, size / 2, size / 2 - 2);
    g.fill({ color });
    g.setStrokeStyle({
      width: DRAG_GHOST_OUTLINE_WIDTH,
      color: DRAG_GHOST_OUTLINE_COLOR,
      alpha: 0.8,
    });
    g.stroke();

    const rt = RenderTexture.create({ width: size, height: size });
    this._app.renderer.render({ container: g, target: rt });
    g.destroy();

    Assets.cache.set(cacheKey, rt);
    return rt;
  }

  private _colorIndex(id: string): number {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
    }
    return hash % PLACEHOLDER_COLORS.length;
  }
}
