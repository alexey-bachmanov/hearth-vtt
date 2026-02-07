<script lang="ts">
/**
 * PlayLayout - Main game interface layout.
 * 
 * Defines the 5-zone spatial layout for the game UI:
 * - SnackbarArea (top)
 * - LeftSidebar (left, GM only)
 * - MainCanvas (center)
 * - RightSidebar (right)
 * - BottomToolbar (bottom)
 * - FloatingWindowLayer (overlay)
 * 
 * Uses CSS Grid for layout management.
 */

import { SnackbarArea } from '../snackbar';
import { LeftSidebar, RightSidebar } from '../sidebar';
import { MainCanvas } from '../canvas';
import { BottomToolbar } from '../toolbar';
import { FloatingWindowLayer } from '../window';

// TODO: Get from auth/session state
let isGM = $state(true); // Placeholder for role detection
</script>

<div class="play-layout">
  <!-- Top: Snackbar area for prompts and notifications -->
  <div class="snackbar-zone">
    <SnackbarArea />
  </div>

  <!-- Left: GM-only sidebar -->
  {#if isGM}
    <div class="left-sidebar-zone">
      <LeftSidebar />
    </div>
  {/if}

  <!-- Center: WebGL canvas -->
  <div class="canvas-zone">
    <MainCanvas />
  </div>

  <!-- Right: Chat + drawers -->
  <div class="right-sidebar-zone">
    <RightSidebar />
  </div>

  <!-- Bottom: Toolbar -->
  <div class="toolbar-zone">
    <BottomToolbar />
  </div>

  <!-- Overlay: Floating windows -->
  <FloatingWindowLayer />
</div>

<style>
  .play-layout {
    display: grid;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    background-color: var(--color-bg-primary);
    
    /* Grid template: [snackbar] [left | center | right] [toolbar] */
    grid-template-columns: 
      var(--sidebar-left-width) 
      1fr 
      var(--sidebar-right-width);
    grid-template-rows: 
      auto 
      1fr 
      var(--toolbar-bottom-height);
    grid-template-areas:
      "snackbar snackbar snackbar"
      "left     canvas   right"
      "toolbar  toolbar  toolbar";
  }

  /* When GM sidebar is hidden */
  .play-layout:not(:has(.left-sidebar-zone)) {
    grid-template-columns: 
      0 
      1fr 
      var(--sidebar-right-width);
  }

  .snackbar-zone {
    grid-area: snackbar;
    z-index: var(--z-snackbar);
  }

  .left-sidebar-zone {
    grid-area: left;
    z-index: var(--z-sidebar);
    overflow: hidden;
  }

  .canvas-zone {
    grid-area: canvas;
    z-index: var(--z-canvas);
    overflow: hidden;
  }

  .right-sidebar-zone {
    grid-area: right;
    z-index: var(--z-sidebar);
    overflow: hidden;
  }

  .toolbar-zone {
    grid-area: toolbar;
    z-index: var(--z-toolbar);
    overflow: hidden;
  }
</style>
