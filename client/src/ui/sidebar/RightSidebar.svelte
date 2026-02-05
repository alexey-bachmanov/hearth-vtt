<script lang="ts">
/**
 * RightSidebar - Always-visible chat and drawer tabs.
 * 
 * Contains chat log at the top and tabbed drawers below.
 */

import ChatLog from './ChatLog.svelte';
import DrawerTabs from './DrawerTabs.svelte';
import CompendiumDrawer from './CompendiumDrawer.svelte';
import JournalDrawer from './JournalDrawer.svelte';
import SettingsDrawer from './SettingsDrawer.svelte';
import JukeboxDrawer from './JukeboxDrawer.svelte';

// Which drawer tab is active
let activeDrawer = $state<'compendium' | 'journal' | 'settings' | 'jukebox'>('compendium');
</script>

<div class="right-sidebar">
  <div class="chat-zone">
    <ChatLog />
  </div>
  
  <div class="drawer-zone">
    <DrawerTabs bind:activeDrawer />
    
    <div class="drawer-content">
      {#if activeDrawer === 'compendium'}
        <CompendiumDrawer />
      {:else if activeDrawer === 'journal'}
        <JournalDrawer />
      {:else if activeDrawer === 'settings'}
        <SettingsDrawer />
      {:else if activeDrawer === 'jukebox'}
        <JukeboxDrawer />
      {/if}
    </div>
  </div>
</div>

<style>
  .right-sidebar {
    display: flex;
    flex-direction: column;
    height: 100%;
    background-color: var(--color-bg-secondary);
    border-left: 1px solid var(--color-border-default);
  }

  .chat-zone {
    flex: 1;
    min-height: 0; /* Allow flexbox shrinking */
    border-bottom: 1px solid var(--color-border-default);
  }

  .drawer-zone {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .drawer-content {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-md);
  }
</style>
