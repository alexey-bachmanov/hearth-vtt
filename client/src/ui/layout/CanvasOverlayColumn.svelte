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
   * - Notification area (bottom, TODO: Phase 7)
   */

  import { ActorPills, QuickStatus } from '../canvas';
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
  <div class="canvas-notification-area">
    <!-- TODO: Phase 7 - NotificationArea component -->
  </div>
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

  .canvas-top-bar > * {
    pointer-events: auto; /* Re-enable for actual content */
  }

  /* Middle spacer (empty, allows canvas interaction) */
  .canvas-middle {
    flex: 1;
  }

  /* Bottom notification area */
  .canvas-notification-area {
    flex: 0 0 auto;
    padding: var(--space-md);
    pointer-events: none; /* Children will enable pointer-events */
  }

  .canvas-notification-area > * {
    pointer-events: auto;
  }
</style>
