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
 * Intent layer:
 * Raw pointer events are first mapped to a `CanvasIntent` via
 * `resolvePointerDownIntent` and the module-level `BINDING_TABLE`, then
 * dispatched to the appropriate state mutation. This separates "what is the
 * user trying to do?" from "how do we do it?", making the binding table the
 * single source of truth for pointer-down input semantics.
 *
 * Input behaviors:
 * - **Middle-click drag** → `pan` intent → `viewportState.panBy`
 * - **Scroll wheel** → `zoom` intent → `viewportState.setZoom` + pan adjust
 * - **Left-click on token** → `beginTokenDrag` intent (tentative); resolves to
 *   `selectToken` at pointerup if released before the drag threshold, or commits
 *   a `moveToken` if the threshold is crossed (D4).
 * - **Shift + left-click on token** → `addToSelection` intent (wired in D2).
 * - **Left-click on empty canvas** → `marqueeSelect` intent (wired in D5).
 * - **Right-click** → `contextMenu` intent; native browser menu always suppressed.
 * - **Escape key** → `deselectAll` intent (wired in D8).
 *
 * Out of scope (deferred to later phases):
 * - Touch / pinch-zoom gestures (Phase E)
 * - Server action dispatch for token moves (Phase 3)
 */

import type { Renderer } from '../render';
import type { CampaignState } from '../state/campaign.svelte';
import type { ViewportState } from '../state/viewport.svelte';
import type { ContextMenuTarget } from '../state/ui.svelte';

// Pixels of pointer movement required before a left-click becomes a drag.
const DRAG_THRESHOLD = 4;

// Zoom step per wheel scroll "tick" (normalized to 100px of deltaY).
const ZOOM_STEP = 0.001;

type Mode = 'idle' | 'panning' | 'tokenDragging';

// ============================================================================
// Intent layer
// ============================================================================

/**
 * The full set of semantic actions the canvas input system can produce.
 * Each intent maps to exactly one state mutation or renderer call.
 *
 * - `pan` / `zoom` — viewport movement (pointer drag / wheel)
 * - `selectToken` — single-select a token (left-click, no drag, no shift)
 * - `addToSelection` — extend multi-selection (shift + left-click on token)
 * - `beginTokenDrag` — start dragging a token (resolves to `selectToken` if
 *   released before the drag threshold)
 * - `contextMenu` — open context menu (right-click or long-press)
 * - `marqueeSelect` — drag-rectangle multi-select on empty canvas
 * - `deselectAll` — clear selection (Escape key)
 */
export type CanvasIntent =
  | 'pan'
  | 'zoom'
  | 'selectToken'
  | 'addToSelection'
  | 'beginTokenDrag'
  | 'contextMenu'
  | 'marqueeSelect'
  | 'deselectAll';

/** Context captured at the moment of a pointer-down event. */
export interface PointerDownContext {
  /** DOM button index: 0 = left, 1 = middle, 2 = right. */
  button: number;
  shiftKey: boolean;
  /** Id of the token under the pointer, or null for empty canvas. */
  tokenId: string | null;
}

interface BindingEntry {
  match: (ctx: PointerDownContext) => boolean;
  intent: CanvasIntent;
}

/**
 * Ordered binding table: first matching entry wins.
 *
 * Rules are evaluated top to bottom. To customise bindings in the future,
 * replace or extend this table — the dispatch logic in the controller does
 * not need to change.
 */
const BINDING_TABLE: BindingEntry[] = [
  // Middle-click → pan, regardless of target
  { match: (c) => c.button === 1, intent: 'pan' },
  // Shift + left-click on token → add to multi-selection
  {
    match: (c) => c.button === 0 && c.shiftKey && c.tokenId !== null,
    intent: 'addToSelection',
  },
  // Left-click on token (no modifier) → tentative drag / select
  {
    match: (c) => c.button === 0 && !c.shiftKey && c.tokenId !== null,
    intent: 'beginTokenDrag',
  },
  // Left-click on empty canvas → marquee multi-select (mouse/stylus only)
  {
    match: (c) => c.button === 0 && c.tokenId === null,
    intent: 'marqueeSelect',
  },
];

/**
 * Map a pointer-down context to a `CanvasIntent` using the binding table.
 * Returns null when no entry matches (e.g. right-click, which is handled via
 * the `contextmenu` DOM event rather than `pointerdown`).
 */
export function resolvePointerDownIntent(
  ctx: PointerDownContext,
): CanvasIntent | null {
  return BINDING_TABLE.find((entry) => entry.match(ctx))?.intent ?? null;
}

export interface CanvasInputControllerOptions {
  viewportState: ViewportState;
  campaignState: CampaignState;
  renderer: Pick<
    Renderer,
    'hitTestToken' | 'setTokenDragPreview' | 'clearTokenDragPreview'
  >;
  /** Called when the user right-clicks the canvas. Receives the hit-tested target. */
  onContextMenu?: (target: ContextMenuTarget) => void;
  /**
   * Permission gate: returns true when the current seat is allowed to drag
   * the given token. Defaults to always-true (no restriction).
   */
  canDragToken?: (tokenId: string) => boolean;
}

export class CanvasInputController {
  private _viewport: ViewportState;
  private _campaign: CampaignState;
  private _renderer: CanvasInputControllerOptions['renderer'];
  private _onContextMenu: ((target: ContextMenuTarget) => void) | undefined;
  private _canDragToken: (tokenId: string) => boolean;

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
    onContextMenu,
    canDragToken,
  }: CanvasInputControllerOptions) {
    this._viewport = viewportState;
    this._campaign = campaignState;
    this._renderer = renderer;
    this._onContextMenu = onContextMenu;
    this._canDragToken = canDragToken ?? (() => true);
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
    const onContextMenu = (e: MouseEvent) => this._handleContextMenu(e);

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
    // Suppress browser auto-scroll on middle-click regardless of current mode.
    if (e.button === 1) e.preventDefault();

    if (this._mode !== 'idle') return;

    // Only hit-test on left-click; other buttons don't target tokens.
    const tokenId =
      e.button === 0 ? this._renderer.hitTestToken(e.clientX, e.clientY) : null;

    const intent = resolvePointerDownIntent({
      button: e.button,
      shiftKey: e.shiftKey,
      tokenId,
    });

    switch (intent) {
      case 'pan':
        this._mode = 'panning';
        this._panPointerId = e.pointerId;
        this._panLastX = e.clientX;
        this._panLastY = e.clientY;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        break;

      case 'beginTokenDrag':
        if (tokenId && this._canDragToken(tokenId)) {
          this._mode = 'tokenDragging';
          this._dragPointerId = e.pointerId;
          this._dragTokenId = tokenId;
          this._dragStartX = e.clientX;
          this._dragStartY = e.clientY;
          this._dragStarted = false;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }
        break;

      case 'addToSelection':
        // Wired in D2 (selection store).
        break;

      case 'marqueeSelect':
        // Wired in D5.
        break;

      default:
        break;
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

  private _handleContextMenu(e: MouseEvent): void {
    // Always prevent the browser's native context menu on the canvas.
    e.preventDefault();
    const tokenId = this._renderer.hitTestToken(e.clientX, e.clientY);
    const target: ContextMenuTarget = tokenId
      ? { kind: 'token', tokenId, screenX: e.clientX, screenY: e.clientY }
      : { kind: 'canvas', screenX: e.clientX, screenY: e.clientY };
    this._onContextMenu?.(target);
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
