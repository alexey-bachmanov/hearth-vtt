/**
 * SelectionLayer — shape-agnostic selection and hover highlights.
 *
 * Maintains "ghost sprites" — invisible copies of token sprites with an
 * OutlineFilter (knockout=true) applied — positioned identically to their
 * source sprites in world space. Because the ghosts live in a separate
 * container above TokenLayer, the token sprites are completely untouched.
 *
 * The OutlineFilter traces any non-transparent pixel in the sprite's texture,
 * so it works correctly for round, square, or irregularly shaped tokens.
 *
 * Layer position: inside worldContainer, above TokenLayer.
 *
 * Decoupling contract:
 *   SelectionLayer never imports TokenLayer. It receives sprite data through
 *   a `getSprite` callback provided by PixiRenderer. To swap the highlight
 *   implementation (e.g. glow, drop shadow, custom shader) replace this file
 *   only — no changes to TokenLayer or PixiRenderer logic are required.
 *
 * Usage:
 *   layer.setSelection(tokenIds, getSprite)  — diff-update selection outlines
 *   layer.setHover(tokenId | null, getSprite) — update hover outline
 *   layer.syncPositions(getSprite)            — call after updateTokens so
 *                                               ghosts follow moved tokens
 */

import { Container, Sprite } from 'pixi.js';
import { OutlineFilter } from 'pixi-filters';

// ---- visual constants -------------------------------------------------------

/** Accent colour for selected tokens — matches MarqueeLayer. */
const SELECTION_COLOR = 0x4da6ff;
/** Softer colour for the hovered-but-not-selected token. */
const HOVER_COLOR = 0xffffff;
/** Outline thickness in world pixels for selected tokens. */
const SELECTION_THICKNESS = 2;
/** Outline thickness for hovered token (thinner = less intrusive). */
const HOVER_THICKNESS = 1.5;
/**
 * OutlineFilter quality (0–1). Higher = more angle samples = smoother on
 * diagonal edges but slower. 0.3 is a good balance for a handful of tokens.
 */
const OUTLINE_QUALITY = 0.3;

// ---- helpers ----------------------------------------------------------------

/** Minimal sprite info needed to position a ghost. */
type SpriteGetter = (id: string) => Sprite | null;

function makeGhost(source: Sprite, color: number, thickness: number): Sprite {
  const ghost = new Sprite(source.texture);
  // Filter needs extra pixels beyond the sprite bounds to render the outline.
  const filter = new OutlineFilter({
    thickness,
    color,
    alpha: 1,
    quality: OUTLINE_QUALITY,
    knockout: true,
  });
  filter.padding = Math.ceil(thickness) + 2;
  ghost.filters = [filter];
  syncGhost(ghost, source);
  return ghost;
}

function syncGhost(ghost: Sprite, source: Sprite): void {
  ghost.anchor.copyFrom(source.anchor);
  ghost.x = source.x;
  ghost.y = source.y;
  ghost.width = source.width;
  ghost.height = source.height;
  ghost.rotation = source.rotation;
  // Ghost alpha is always 1 — the outline should be visible even on hidden tokens.
}

// ---- SelectionLayer ---------------------------------------------------------

export class SelectionLayer {
  readonly container: Container;

  private _selectedGhosts = new Map<string, Sprite>();
  private _hoverGhost: Sprite | null = null;
  private _hoveredId: string | null = null;

  constructor() {
    this.container = new Container();
    this.container.label = 'selection';
  }

  /**
   * Diff-update the set of selection outline ghosts.
   * Ghosts for tokens no longer selected are destroyed; new ones are created.
   */
  setSelection(tokenIds: string[], getSprite: SpriteGetter): void {
    const incoming = new Set(tokenIds);

    // Remove ghosts for deselected tokens.
    for (const [id, ghost] of this._selectedGhosts) {
      if (!incoming.has(id)) {
        ghost.destroy();
        this._selectedGhosts.delete(id);
      }
    }

    // Add or update ghosts for selected tokens.
    for (const id of tokenIds) {
      const source = getSprite(id);
      if (!source) continue;

      const existing = this._selectedGhosts.get(id);
      if (existing) {
        syncGhost(existing, source);
      } else {
        const ghost = makeGhost(source, SELECTION_COLOR, SELECTION_THICKNESS);
        this._selectedGhosts.set(id, ghost);
        this.container.addChild(ghost);
      }
    }
  }

  /**
   * Update the hover outline ghost.
   * Pass `null` to clear the current hover highlight.
   */
  setHover(tokenId: string | null, getSprite: SpriteGetter): void {
    if (tokenId === this._hoveredId) return;

    if (this._hoverGhost) {
      this._hoverGhost.destroy();
      this._hoverGhost = null;
    }
    this._hoveredId = tokenId;

    if (tokenId) {
      const source = getSprite(tokenId);
      if (source) {
        this._hoverGhost = makeGhost(source, HOVER_COLOR, HOVER_THICKNESS);
        this.container.addChild(this._hoverGhost);
      }
    }
  }

  /**
   * Synchronise ghost positions after tokens have moved.
   * Removes ghosts for tokens that no longer have a live sprite
   * (e.g. removed from the scene).
   *
   * Call this after every `TokenLayer.updateTokens`.
   */
  syncPositions(getSprite: SpriteGetter): void {
    for (const [id, ghost] of this._selectedGhosts) {
      const source = getSprite(id);
      if (!source) {
        ghost.destroy();
        this._selectedGhosts.delete(id);
      } else {
        syncGhost(ghost, source);
      }
    }

    if (this._hoveredId && this._hoverGhost) {
      const source = getSprite(this._hoveredId);
      if (!source) {
        this._hoverGhost.destroy();
        this._hoverGhost = null;
        this._hoveredId = null;
      } else {
        syncGhost(this._hoverGhost, source);
      }
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
    this._selectedGhosts.clear();
    this._hoverGhost = null;
  }
}
