<script lang="ts">
/**
 * FloatingWindowLayer - Overlay container for modal windows.
 * 
 * Manages z-index and rendering of all floating windows.
 */

// Mock window state - TODO: Wire to uiState
let openWindows = $state<Array<{id: string, type: string, zIndex: number}>>([]);

// Example: openWindows could contain:
// { id: 'char-1', type: 'character', zIndex: 200 }
// { id: 'doc-1', type: 'document', zIndex: 201 }
</script>

<div class="floating-window-layer">
  {#if openWindows.length === 0}
    <div class="no-windows">
      <!-- No floating windows open -->
    </div>
  {:else}
    {#each openWindows as window (window.id)}
      <div class="window-placeholder" style="z-index: {window.zIndex}">
        <!-- FloatingWindow component would render here -->
        [Window: {window.type}]
      </div>
    {/each}
  {/if}
</div>

<style>
  .floating-window-layer {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    pointer-events: none;
    z-index: var(--z-modal);
  }

  .no-windows {
    display: none;
  }

  .window-placeholder {
    position: absolute;
    pointer-events: auto;
    background-color: var(--color-bg-elevated);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-large);
    padding: var(--space-md);
  }
</style>
