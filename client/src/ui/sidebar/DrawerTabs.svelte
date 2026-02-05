<script lang="ts">
/**
 * DrawerTabs - Tab navigation for drawers.
 * 
 * Switches between Compendium, Journal, Settings, Jukebox.
 */

interface Props {
  activeDrawer: 'compendium' | 'journal' | 'settings' | 'jukebox';
}

let { activeDrawer = $bindable() }: Props = $props();
</script>

<div class="drawer-tabs">
  <button 
    class="tab" 
    class:active={activeDrawer === 'compendium'}
    onclick={() => activeDrawer = 'compendium'}
  >
    📖 Compendium
  </button>
  <button 
    class="tab" 
    class:active={activeDrawer === 'journal'}
    onclick={() => activeDrawer = 'journal'}
  >
    📔 Journal
  </button>
  <button 
    class="tab" 
    class:active={activeDrawer === 'settings'}
    onclick={() => activeDrawer = 'settings'}
  >
    ⚙️ Settings
  </button>
  <button 
    class="tab" 
    class:active={activeDrawer === 'jukebox'}
    onclick={() => activeDrawer = 'jukebox'}
  >
    🎵 Jukebox
  </button>
</div>

<style>
  .drawer-tabs {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    border-bottom: 1px solid var(--color-border-default);
  }

  .tab {
    padding: var(--space-sm);
    background-color: var(--color-bg-secondary);
    border: none;
    border-right: 1px solid var(--color-border-subtle);
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .tab:last-child {
    border-right: none;
  }

  .tab:hover {
    background-color: var(--color-bg-tertiary);
    color: var(--color-text-primary);
  }

  .tab.active {
    background-color: var(--color-bg-primary);
    color: var(--color-accent-primary);
    border-bottom: 2px solid var(--color-accent-primary);
  }
</style>
