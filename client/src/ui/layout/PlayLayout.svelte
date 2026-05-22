<script lang="ts">
/**
 * PlayLayout - Main game interface layout.
 *
 * Composed of three layers:
 * 1. Base layer: LeftToolbar + MainCanvas (visual background)
 * 2. Overlay layer: ToolDrawer + CanvasOverlayColumn + RightSidebar (interactive UI)
 * 3. Floating layer: Draggable windows
 *
 * The base and overlay layers use flexbox for natural reflow when drawers/sidebar
 * open/close. This eliminates manual position calculations and provides better
 * encapsulation between components.
 */

import PlayLayoutBase from './PlayLayoutBase.svelte';
import PlayLayoutOverlay from './PlayLayoutOverlay.svelte';
import { FloatingWindowLayer } from '../window'; import { ContextMenu } from '../canvas';</script>

<div class="play-layout">
  <!-- Layer 1: Base (toolbar + canvas background) -->
  <PlayLayoutBase />

  <!-- Layer 2: Overlay (drawer + canvas overlays + sidebar) -->
  <PlayLayoutOverlay />

  <!-- Layer 3: Floating windows -->
  <FloatingWindowLayer />

  <!-- Layer 4: Context menu (above floating windows) -->
  <ContextMenu />
</div>

<style>
  .play-layout {
    position: relative;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    background-color: var(--color-bg-primary);
  }
</style>
