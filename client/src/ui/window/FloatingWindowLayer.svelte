<script lang="ts">
/**
 * FloatingWindowLayer - Overlay container for all tabbed floating windows.
 *
 * Iterates uiState.windowGroups and renders a TabbedWindow for each group,
 * sorted by ascending zIndex so higher-zIndex groups render on top.
 *
 * The layer itself is pointer-events: none so clicks fall through to the
 * canvas when no window is under the cursor. Each TabbedWindow re-enables
 * pointer events for its own area via the CSS class.
 */

import { uiState } from '../../state/ui.svelte';
import TabbedWindow from './TabbedWindow.svelte';

// Sort groups by z-index so DOM order matches stacking order.
// Groups with higher zIndex appear later in the list (rendered on top).
let sortedGroups = $derived(
  [...uiState.windowGroups.values()].sort((a, b) => a.zIndex - b.zIndex),
);
</script>

<div class="floating-window-layer">
  {#each sortedGroups as group (group.id)}
    <TabbedWindow groupId={group.id} />
  {/each}
</div>

<style>
  .floating-window-layer {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: var(--z-floating-window);
  }
</style>

