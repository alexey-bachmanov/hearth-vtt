/**
 * Viewport state management using Svelte 5 runes.
 *
 * This module holds the current player's canvas view state: zoom level,
 * pan offset, grid configuration, and other view-specific settings.
 * This is local to each client and not synced with the server.
 */

import type { GridType, Position } from './types';

/**
 * ViewportState tracks the current player's view of the canvas.
 *
 * Contains zoom, pan, grid settings, and other view-specific state.
 * Updated by canvas input handlers (scroll, drag, etc.).
 * Read by QuickStatus overlay and renderer.
 */
class ViewportState {
  // Zoom level (1.0 = 100%, 0.5 = 50%, 2.0 = 200%)
  zoom = $state<number>(1.0);

  // Pan offset from canvas origin (pixels)
  panOffset = $state<Position>({ x: 0, y: 0 });

  // Grid configuration (from active scene)
  gridType = $state<GridType>('square');
  gridSize = $state<number>(50); // pixels per grid square
  gridScale = $state<string>('5ft'); // e.g., "5ft", "10m", "1mi"

  // Grid snapping
  snapToGrid = $state<boolean>(true);

  // Current map name (for display in QuickStatus)
  mapName = $state<string>('');

  // Visibility mask (GM fog of war, player vision)
  // TODO: Implement visibility mask structure
  visibilityMask = $state<unknown | null>(null);

  // ============================================================================
  // Zoom Methods
  // ============================================================================

  /**
   * Set zoom level (clamped to min/max).
   */
  setZoom(level: number) {
    this.zoom = Math.max(0.1, Math.min(5.0, level));
  }

  /**
   * Zoom in by a fixed step (e.g., scroll wheel).
   */
  zoomIn(step: number = 0.1) {
    this.setZoom(this.zoom + step);
  }

  /**
   * Zoom out by a fixed step.
   */
  zoomOut(step: number = 0.1) {
    this.setZoom(this.zoom - step);
  }

  /**
   * Reset zoom to 100%.
   */
  resetZoom() {
    this.zoom = 1.0;
  }

  // ============================================================================
  // Pan Methods
  // ============================================================================

  /**
   * Set pan offset directly.
   */
  setPan(x: number, y: number) {
    this.panOffset = { x, y };
  }

  /**
   * Pan by a delta amount (e.g., drag).
   */
  panBy(dx: number, dy: number) {
    this.panOffset = {
      x: this.panOffset.x + dx,
      y: this.panOffset.y + dy,
    };
  }

  /**
   * Center viewport on a specific world position.
   */
  centerOn(x: number, y: number, canvasWidth: number, canvasHeight: number) {
    this.panOffset = {
      x: canvasWidth / 2 - x * this.zoom,
      y: canvasHeight / 2 - y * this.zoom,
    };
  }

  /**
   * Reset pan to origin.
   */
  resetPan() {
    this.panOffset = { x: 0, y: 0 };
  }

  // ============================================================================
  // Grid Methods
  // ============================================================================

  /**
   * Update grid configuration from active scene.
   */
  setGrid(type: GridType, size: number, scale: string) {
    this.gridType = type;
    this.gridSize = size;
    this.gridScale = scale;
  }

  /**
   * Toggle snap to grid.
   */
  toggleSnapToGrid() {
    this.snapToGrid = !this.snapToGrid;
  }

  // ============================================================================
  // Map Info Methods
  // ============================================================================

  /**
   * Update map name (from active scene).
   */
  setMapName(name: string) {
    this.mapName = name;
  }

  // ============================================================================
  // Visibility Methods
  // ============================================================================

  /**
   * Update visibility mask from server.
   *
   * TODO: Implement proper visibility mask structure.
   */
  setVisibilityMask(mask: unknown) {
    this.visibilityMask = mask;
  }

  /**
   * Clear visibility mask.
   */
  clearVisibilityMask() {
    this.visibilityMask = null;
  }

  // ============================================================================
  // Reset
  // ============================================================================

  /**
   * Reset viewport to defaults.
   */
  reset() {
    this.zoom = 1.0;
    this.panOffset = { x: 0, y: 0 };
    this.gridType = 'square';
    this.gridSize = 50;
    this.gridScale = '5ft';
    this.snapToGrid = true;
    this.mapName = '';
    this.visibilityMask = null;
  }
}

/**
 * Singleton viewport state instance.
 */
export const viewportState = new ViewportState();
