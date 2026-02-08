<script lang="ts">
/**
 * PlayLayout - Main game interface layout.
 * 
 * Defines the 3-zone spatial layout for the game UI:
 * - LeftToolbar (left vertical icon bar, 56px)
 * - MainCanvas (center, with overlays for ActorPills, QuickStatus, Notifications)
 * - RightSidebar (right, chat/event log, 320px)
 * - ToolDrawer (slides out over canvas when tool active)
 * - FloatingWindowLayer (overlay for tabbed windows)
 * 
 * Uses CSS Grid for layout management.
 */

import { RightSidebar } from '../sidebar';
import { MainCanvas } from '../canvas';
import { LeftToolbar, ToolDrawer } from '../toolbar';
import { FloatingWindowLayer } from '../window';
</script>

<div class="play-layout">
  <!-- Left: Vertical toolbar -->
  <div class="toolbar-zone">
    <LeftToolbar />
  </div>

  <!-- Center: Canvas with overlays -->
  <div class="canvas-zone">
    <MainCanvas />
    <ToolDrawer />
    <!-- TODO: Phase 6 - ActorPills, QuickStatus -->
    <!-- TODO: Phase 7 - NotificationArea -->
  </div>

  <!-- Right: Chat + event log -->
  <div class="sidebar-zone">
    <RightSidebar />
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
    
    /* 3-column grid: toolbar-left | canvas-area | sidebar-right */
    grid-template-columns: 
      var(--toolbar-left-width) 
      1fr 
      var(--sidebar-right-width);
    grid-template-rows: 1fr;
  }

  .toolbar-zone {
    z-index: var(--z-toolbar);
    overflow: hidden;
  }

  .canvas-zone {
    position: relative; /* Anchor for absolute-positioned overlays */
    z-index: var(--z-canvas);
    overflow: hidden;
  }

  .sidebar-zone {
    z-index: var(--z-sidebar);
    overflow: hidden;
  }
</style>
