/**
 * PixiRenderer — PixiJS v8-backed implementation of the Renderer interface.
 *
 * Architecture:
 * - One `Application` owns the WebGL/WebGPU context and the main ticker.
 * - A `worldContainer` (background → grid → tokens) receives the viewport
 *   transform (zoom + pan). Screen-space overlays sit above it.
 * - Callers (MainCanvas.svelte via $effect) push state changes in via the
 *   Renderer interface methods. The renderer never reads Svelte runes.
 * - `init()` is async; calls before it resolves are queued and replayed.
 */

import { Application, Container } from 'pixi.js';
import type { Scene, Token, Position } from '@hearth-vtt/shared';
import type { Renderer, ViewportParams } from '../index';
import { BackgroundLayer } from './layers/BackgroundLayer';
import { GridLayer } from './layers/GridLayer';
import { OverlayLayer } from './layers/OverlayLayer';
import { TokenLayer } from './layers/TokenLayer';

export class PixiRenderer implements Renderer {
  private _app: Application | null = null;
  private _worldContainer: Container | null = null;
  private _background: BackgroundLayer | null = null;
  private _grid: GridLayer | null = null;
  private _tokens: TokenLayer | null = null;
  private _overlay: OverlayLayer | null = null;
  private _resizeObserver: ResizeObserver | null = null;

  /**
   * True once `init()` has completed successfully.
   * Calls that arrive before init completes are queued via _pendingCalls.
   */
  private _ready = false;
  private _pendingCalls: Array<() => void> = [];

  // ============================================================================
  // Lifecycle
  // ============================================================================

  async init(canvas: HTMLCanvasElement): Promise<void> {
    const app = new Application();

    await app.init({
      canvas,
      resizeTo: canvas.parentElement ?? undefined,
      backgroundAlpha: 0,
      // antialias + autoDensity/resolution together address token/grid edge
      // jaggies at all zoom levels. MSAA (via antialias) is handled by the
      // WebGL driver; autoDensity + devicePixelRatio ensures the backing buffer
      // matches the screen's physical pixel density.
      //
      // FXAA post-process filter was evaluated but is only available via
      // @pixi/filter-fxaa, which is not compatible with PixiJS v8. Skipped as
      // out of scope; native MSAA is sufficient for this project's needs.
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio ?? 1,
    });

    this._app = app;

    // Layer stack (bottom → top inside worldContainer)
    const world = new Container();
    world.label = 'world';
    this._worldContainer = world;

    this._background = new BackgroundLayer();
    this._grid = new GridLayer();
    this._tokens = new TokenLayer(app);
    this._overlay = new OverlayLayer();

    world.addChild(this._background.container);
    world.addChild(this._grid.container);
    world.addChild(this._tokens.container);
    world.addChild(this._overlay.container);

    // Token overlay (drag ghosts) is screen-space: added directly to stage above world.
    app.stage.addChild(world);
    app.stage.addChild(this._tokens.overlayContainer);

    // Observe parent size changes so the canvas fills its container.
    const parent = canvas.parentElement;
    if (parent) {
      this._resizeObserver = new ResizeObserver(() => {
        app.renderer.resize(parent.clientWidth, parent.clientHeight);
      });
      this._resizeObserver.observe(parent);
    }

    this._ready = true;

    // Replay any calls that arrived before init completed.
    for (const fn of this._pendingCalls) fn();
    this._pendingCalls = [];
  }

  dispose(): void {
    this._resizeObserver?.disconnect();
    this._background?.destroy();
    this._grid?.destroy();
    this._tokens?.destroy();
    this._overlay?.destroy();
    this._app?.destroy(false, { children: true });

    this._app = null;
    this._worldContainer = null;
    this._background = null;
    this._grid = null;
    this._tokens = null;
    this._overlay = null;
    this._resizeObserver = null;
    this._ready = false;
    this._pendingCalls = [];
  }

  // ============================================================================
  // Scene
  // ============================================================================

  setScene(scene: Scene | undefined): void {
    this._enqueue(() => {
      // setScene on BackgroundLayer is async (image load); fire and forget.
      // Errors are handled internally in BackgroundLayer.
      this._background!.setScene(scene);
      this._grid!.setScene(scene);
    });
  }

  // ============================================================================
  // Tokens
  // ============================================================================

  updateTokens(tokens: Token[]): void {
    this._enqueue(() => {
      this._tokens!.updateTokens(tokens);
    });
  }

  setTokenDragPreview(tokenId: string, worldPosition: Position): void {
    this._enqueue(() => {
      this._tokens!.setTokenDragPreview(tokenId, worldPosition);
    });
  }

  clearTokenDragPreview(tokenId: string): void {
    this._enqueue(() => {
      this._tokens!.clearTokenDragPreview(tokenId);
    });
  }

  hitTestToken(screenX: number, screenY: number): string | null {
    if (!this._ready || !this._tokens) return null;
    return this._tokens.hitTestToken(screenX, screenY);
  }

  // ============================================================================
  // Overlay
  // ============================================================================

  /**
   * Reserved for future ambient scene effects (rain, snow, particles, AoE fog).
   * The OverlayLayer container is wired into the world stack above tokens; this
   * method is a no-op until specific effect types are designed and implemented.
   */
  setOverlay(_spec: unknown): void {
    // Intentionally empty placeholder — see OverlayLayer.ts.
  }

  // ============================================================================
  // Viewport
  // ============================================================================

  setViewport({ zoom, panOffset }: ViewportParams): void {
    this._enqueue(() => {
      const world = this._worldContainer!;
      world.scale.set(zoom);
      world.x = panOffset.x;
      world.y = panOffset.y;
    });
  }

  // ============================================================================
  // Private helpers
  // ============================================================================

  /**
   * Execute `fn` immediately if the renderer is ready, otherwise enqueue it.
   * This ensures calls that arrive during async init are not silently dropped.
   */
  private _enqueue(fn: () => void): void {
    if (this._ready) {
      fn();
    } else {
      this._pendingCalls.push(fn);
    }
  }
}
