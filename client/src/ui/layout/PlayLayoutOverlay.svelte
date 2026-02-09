<script lang="ts">
  /**
   * PlayLayoutOverlay - Overlay layer for interactive UI elements.
   *
   * Positioned absolutely over the base layer. Uses flexbox to create "lanes"
   * for UI elements. Components in this layer have pointer-events enabled
   * individually, while the container itself is non-interactive (allows
   * click-through to canvas).
   *
   * Structure (left to right):
   * - Toolbar spacer (56px, matches LeftToolbar width)
   * - ToolDrawer (slides in/out, 320px when open)
   * - CanvasOverlayColumn (flex: 1, contains top bar + notifications)
   * - RightSidebar (slides in/out, 320px when open)
   */

  import { ToolDrawer } from '../toolbar';
  import { RightSidebar } from '../sidebar';
  import CanvasOverlayColumn from './CanvasOverlayColumn.svelte';
</script>

<div class="play-layout-overlay">
  <!-- Spacer to align with left toolbar -->
  <div class="toolbar-spacer"></div>

  <!-- Tool drawer (slides over canvas) -->
  <ToolDrawer />

  <!-- Canvas overlay column (top bar, spacer, notifications) -->
  <CanvasOverlayColumn />

  <!-- Right sidebar (slides over canvas) -->
  <RightSidebar />
</div>

<style>
  .play-layout-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: row;
    pointer-events: none; /* Allow click-through to canvas */
    z-index: var(--z-canvas-overlay);
    overflow: hidden; /* Clip transformed elements */
  }

  .toolbar-spacer {
    flex: 0 0 var(--toolbar-left-width);
    pointer-events: none; /* Allow clicks to pass through to toolbar below */
  }
</style>
