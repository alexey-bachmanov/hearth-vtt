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
 *
 * Props:
 *   campaignId - Campaign to connect to.
 *   seatId     - (dev only) Seat override forwarded to wsClient.connect().
 *                DEV HACK: remove `seatId` prop after Phase 5 (real player auth).
 */

import { onMount } from 'svelte';
import { wsClient } from '../../api/index.js';
import PlayLayoutBase from './PlayLayoutBase.svelte';
import PlayLayoutOverlay from './PlayLayoutOverlay.svelte';
import { FloatingWindowLayer } from '../window';
import { ContextMenu } from '../canvas';

// DEV HACK: seatId prop threads the ?seat= bypass down from Router.
// Remove seatId after Phase 5 (real player auth).
let {
  campaignId,
  seatId,
}: { campaignId?: string; seatId?: string } = $props();

onMount(() => {
  wsClient.connect(campaignId, seatId);
  return () => wsClient.disconnect();
});
</script>

<div class="play-layout">
  <!-- Skip link: off-screen by default, appears on keyboard focus. -->
  <a class="skip-link" href="#main-content">Skip to canvas</a>

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

  .skip-link {
    position: absolute;
    top: -100%;
    left: 0;
    z-index: 9999;
    padding: 0.5rem 1rem;
    background: var(--color-bg-elevated);
    color: var(--color-text-primary);
    text-decoration: none;
    border-radius: 0 0 var(--radius-sm) 0;
  }

  .skip-link:focus {
    top: 0;
  }
</style>
