/**
 * Renderer public interface and factory for HearthVTT.
 *
 * Architecture:
 * - `Renderer` is the stable public interface. UI components (MainCanvas.svelte)
 *   depend only on this interface; the PixiJS implementation is an internal detail.
 * - `createRenderer()` returns the real PixiJS-backed implementation in the browser.
 * - `StubRenderer` is a no-op implementation for tests and SSR safety.
 * - Svelte $effect blocks in MainCanvas.svelte bridge reactive state → renderer calls.
 *   The renderer itself never imports Svelte runes.
 *
 * Active interface (Phase A/B):
 *   init, dispose, setScene, updateTokens, setViewport,
 *   setTokenDragPreview, clearTokenDragPreview, hitTestToken
 *
 * Deferred to later phases (fog, lighting, AoE, VFX, annotations, measurement):
 *   updateVisibilityMask, updateLights, addAoEEffect, removeAoEEffect,
 *   showTargetingReticle, hideTargetingReticle, triggerVFX,
 *   addAnnotation, removeAnnotation, setMeasurementPreview
 */

import type { Scene, Token, Position } from '@hearth-vtt/shared';

// ============================================================================
// Public types
// ============================================================================

export interface ViewportParams {
  zoom: number;
  panOffset: Position;
}

// ============================================================================
// Renderer interface
// ============================================================================

/**
 * The stable public API for the canvas renderer.
 *
 * Consumers should program against this interface, not the concrete class.
 */
export interface Renderer {
  /** Asynchronously initialize the renderer against a canvas element. */
  init(canvas: HTMLCanvasElement): Promise<void>;

  /** Tear down all PixiJS resources. */
  dispose(): void;

  /** Update the scene: background image, grid, and scene dimensions. */
  setScene(scene: Scene | undefined): void;

  /**
   * Synchronize the full token list for the active scene.
   * The renderer diffs against its current state — only changed sprites are updated.
   */
  updateTokens(tokens: Token[]): void;

  /** Apply zoom + pan to the world container. */
  setViewport(params: ViewportParams): void;

  /**
   * Show a drag-preview ghost for a token being dragged.
   * Overrides the token's rendered position without committing to state.
   */
  setTokenDragPreview(tokenId: string, worldPosition: Position): void;

  /** Remove the drag-preview ghost and restore the token's committed position. */
  clearTokenDragPreview(tokenId: string): void;

  /**
   * Return the id of the topmost token whose sprite contains (screenX, screenY),
   * or null if the point hits no token.
   */
  hitTestToken(screenX: number, screenY: number): string | null;
}

// ============================================================================
// StubRenderer — no-op implementation for tests and SSR
// ============================================================================

/**
 * No-op Renderer. Safe to instantiate in test environments where WebGL
 * is unavailable. Methods log at debug level and return safe defaults.
 */
export class StubRenderer implements Renderer {
  async init(_canvas: HTMLCanvasElement): Promise<void> {}
  dispose(): void {}
  setScene(_scene: Scene | undefined): void {}
  updateTokens(_tokens: Token[]): void {}
  setViewport(_params: ViewportParams): void {}
  setTokenDragPreview(_tokenId: string, _worldPosition: Position): void {}
  clearTokenDragPreview(_tokenId: string): void {}
  hitTestToken(_screenX: number, _screenY: number): string | null {
    return null;
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a renderer instance.
 *
 * Returns a PixiRenderer in normal browser builds. The import is dynamic so
 * that PixiJS is only bundled when actually needed (not in test/SSR builds
 * that import this module without calling createRenderer).
 */
export async function createRenderer(): Promise<Renderer> {
  const { PixiRenderer } = await import('./pixi/PixiRenderer');
  return new PixiRenderer();
}
