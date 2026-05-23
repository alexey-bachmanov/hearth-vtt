<script lang="ts">
  /**
   * CanvasOverlayColumn - Vertical flex column for canvas overlays.
   *
   * Replaces CanvasOverlayBar. This component automatically sizes to fill
   * the available space between the drawer and sidebar, eliminating the need
   * for manual offset calculations.
   *
   * Structure (top to bottom):
   * - Top bar (QuickStatus left, ActorPills right)
   * - Middle spacer (flex: 1, empty space)
   * - Notification area (bottom)
   */

  import { ActorPills, QuickStatus } from '../canvas';
import NotificationArea from '../notifications/NotificationArea.svelte';
</script>

<div class="canvas-overlay-column">
  <!-- Top bar: Quick status and actor pills -->
  <div class="canvas-top-bar">
    <QuickStatus />
    
    <ActorPills />
  </div>

  <!-- Middle: Empty spacer -->
  <div class="canvas-middle"></div>

  <!-- Bottom: Notification area -->
  <NotificationArea />
</div>

<style>
  .canvas-overlay-column {
    flex: 1; /* Fill available space between drawer and sidebar */
    display: flex;
    flex-direction: column;
    pointer-events: none; /* Allow click-through except for interactive children */
  }

  /* Top bar with quick status and actor pills */
  .canvas-top-bar {
    flex: 0 0 auto;
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-md);
    gap: var(--space-md);
    pointer-events: none; /* Children will enable pointer-events */
  }

  /* Middle spacer (empty, allows canvas interaction) */
  .canvas-middle {
    flex: 1;
  }
</style>
