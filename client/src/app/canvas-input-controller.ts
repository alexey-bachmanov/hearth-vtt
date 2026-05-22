/**
 * CanvasInputController — translates raw DOM pointer/wheel events into
 * typed state mutations on `viewportState` and `campaignState`.
 *
 * Design principles:
 * - Framework-agnostic (no Svelte imports). Accepts state stores by reference
 *   so they can be mocked or reset in unit tests.
 * - All internal bookkeeping is plain mutable fields — NOT $state runes.
 * - `attach(element)` wires up listeners and returns a cleanup function
 *   (called by the Svelte `onDestroy` in MainCanvas.svelte).
 *
 * Input behaviors:
 * - **Middle-click drag** → pan (`viewportState.panBy`)
 * - **Scroll wheel** → zoom toward cursor (`viewportState.setZoom` + pan adjust)
 * - **Left-click drag on token** → show drag preview; on release commit locally
 *   (`campaignState.moveToken`). Snap-to-grid applied if `viewportState.snapToGrid`.
 * - **Right-click / contextmenu** → always prevented (no binding).
 *
 * Out of scope (deferred):
 * - Token selection state
 * - Server action dispatch (Phase 3 of implementation-strategy.md)
 * - Touch / pinch-zoom gestures
 */

import type { Renderer } from '../render';
import type { CampaignState } from '../state/campaign.svelte';
import type { ViewportState } from '../state/viewport.svelte';

// Pixels of pointer movement required before a left-click becomes a drag.
const DRAG_THRESHOLD = 4;

// Zoom step per wheel scroll "tick" (normalized to 100px of deltaY).
const ZOOM_STEP = 0.001;

type Mode = 'idle' | 'panning' | 'tokenDragging';

export interface CanvasInputControllerOptions {
  viewportState: ViewportState;
  campaignState: CampaignState;
  renderer: Pick<
    Renderer,
    'hitTestToken' | 'setTokenDragPreview' | 'clearTokenDragPreview'
  >;
}

export class CanvasInputController {
  private _viewport: ViewportState;
  private _campaign: CampaignState;
  private _renderer: CanvasInputControllerOptions['renderer'];

  private _mode: Mode = 'idle';

  // Pointer state for panning
  private _panPointerId = -1;
  private _panLastX = 0;
  private _panLastY = 0;

  // Pointer state for token dragging
  private _dragPointerId = -1;
  private _dragTokenId = '';
  private _dragStartX = 0;
  private _dragStartY = 0;
  private _dragStarted = false; // true once threshold is exceeded

  constructor({
    viewportState,
    campaignState,
    renderer,
  }: CanvasInputControllerOptions) {
    this._viewport = viewportState;
    this._campaign = campaignState;
    this._renderer = renderer;
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Attach event listeners to `element`.
   * Returns a cleanup function that removes all listeners.
   */
  attach(element: HTMLElement): () => void {
    const onPointerDown = (e: PointerEvent) => this._handlePointerDown(e);
    const onPointerMove = (e: PointerEvent) => this._handlePointerMove(e);
    const onPointerUp = (e: PointerEvent) => this._handlePointerUp(e);
    const onPointerCancel = (e: PointerEvent) => this._handlePointerCancel(e);
    const onWheel = (e: WheelEvent) => this._handleWheel(e);
    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerup', onPointerUp);
    element.addEventListener('pointercancel', onPointerCancel);
    element.addEventListener('wheel', onWheel, { passive: false });
    element.addEventListener('contextmenu', onContextMenu);

    return () => {
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerup', onPointerUp);
      element.removeEventListener('pointercancel', onPointerCancel);
      element.removeEventListener('wheel', onWheel);
      element.removeEventListener('contextmenu', onContextMenu);
    };
  }

  // ============================================================================
  // Event handlers
  // ============================================================================

  private _handlePointerDown(e: PointerEvent): void {
    // Middle-click → start pan
    if (e.button === 1) {
      e.preventDefault(); // suppress browser auto-scroll cursor
      if (this._mode !== 'idle') return;

      this._mode = 'panning';
      this._panPointerId = e.pointerId;
      this._panLastX = e.clientX;
      this._panLastY = e.clientY;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    // Left-click → maybe token drag
    if (e.button === 0) {
      if (this._mode !== 'idle') return;

      const tokenId = this._renderer.hitTestToken(e.clientX, e.clientY);
      if (tokenId) {
        this._mode = 'tokenDragging';
        this._dragPointerId = e.pointerId;
        this._dragTokenId = tokenId;
        this._dragStartX = e.clientX;
        this._dragStartY = e.clientY;
        this._dragStarted = false;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }
      // No token hit → no-op (selection deferred)
    }
  }

  private _handlePointerMove(e: PointerEvent): void {
    if (this._mode === 'panning' && e.pointerId === this._panPointerId) {
      const dx = e.clientX - this._panLastX;
      const dy = e.clientY - this._panLastY;
      this._panLastX = e.clientX;
      this._panLastY = e.clientY;
      this._viewport.panBy(dx, dy);
      return;
    }

    if (this._mode === 'tokenDragging' && e.pointerId === this._dragPointerId) {
      const dx = e.clientX - this._dragStartX;
      const dy = e.clientY - this._dragStartY;

      // Cross the drag threshold before showing preview
      if (!this._dragStarted) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        this._dragStarted = true;
      }

      const worldPos = this._screenToWorld(e.clientX, e.clientY);
      this._renderer.setTokenDragPreview(this._dragTokenId, worldPos);
    }
  }

  private _handlePointerUp(e: PointerEvent): void {
    if (this._mode === 'panning' && e.pointerId === this._panPointerId) {
      this._mode = 'idle';
      this._panPointerId = -1;
      return;
    }

    if (this._mode === 'tokenDragging' && e.pointerId === this._dragPointerId) {
      if (this._dragStarted) {
        // Commit new position to local state.
        // TODO (Phase 3): replace with server action dispatch.
        let worldPos = this._screenToWorld(e.clientX, e.clientY);
        if (this._viewport.snapToGrid) {
          worldPos = this._snapToGrid(worldPos);
        }
        this._campaign.moveToken(this._dragTokenId, worldPos);
        this._renderer.clearTokenDragPreview(this._dragTokenId);
      }
      this._mode = 'idle';
      this._dragPointerId = -1;
      this._dragTokenId = '';
      this._dragStarted = false;
    }
  }

  private _handlePointerCancel(e: PointerEvent): void {
    if (this._mode === 'panning' && e.pointerId === this._panPointerId) {
      this._mode = 'idle';
      this._panPointerId = -1;
      return;
    }
    if (this._mode === 'tokenDragging' && e.pointerId === this._dragPointerId) {
      if (this._dragStarted) {
        this._renderer.clearTokenDragPreview(this._dragTokenId);
      }
      this._mode = 'idle';
      this._dragPointerId = -1;
      this._dragTokenId = '';
      this._dragStarted = false;
    }
  }

  private _handleWheel(e: WheelEvent): void {
    e.preventDefault();

    const oldZoom = this._viewport.zoom;
    const { panOffset } = this._viewport;

    // Normalize deltaY to pixels (browsers vary: DOM_DELTA_LINE, DOM_DELTA_PAGE, etc.)
    let deltaY = e.deltaY;
    if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) deltaY *= 16;
    if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) deltaY *= 400;

    const newZoom = Math.max(
      0.1,
      Math.min(5.0, oldZoom - deltaY * ZOOM_STEP * oldZoom),
    );

    // Cursor world-space position (must stay fixed after zoom).
    const worldX = (e.clientX - panOffset.x) / oldZoom;
    const worldY = (e.clientY - panOffset.y) / oldZoom;

    // New pan that keeps the world point under the cursor.
    const newPanX = e.clientX - worldX * newZoom;
    const newPanY = e.clientY - worldY * newZoom;

    this._viewport.setZoom(newZoom);
    this._viewport.setPan(newPanX, newPanY);
  }

  // ============================================================================
  // Coordinate helpers
  // ============================================================================

  /**
   * Convert screen-space coordinates to world-space using current viewport.
   */
  private _screenToWorld(
    screenX: number,
    screenY: number,
  ): { x: number; y: number } {
    const { zoom, panOffset } = this._viewport;
    return {
      x: (screenX - panOffset.x) / zoom,
      y: (screenY - panOffset.y) / zoom,
    };
  }

  /**
   * Snap a world-space position to the nearest grid cell center.
   */
  private _snapToGrid(pos: { x: number; y: number }): { x: number; y: number } {
    const { gridSize } = this._viewport;
    return {
      x: Math.round(pos.x / gridSize) * gridSize,
      y: Math.round(pos.y / gridSize) * gridSize,
    };
  }
}
