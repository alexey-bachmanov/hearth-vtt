<script lang="ts">
/**
 * LeftSidebar - GM-only tools panel.
 * 
 * Contains scene navigation, wall/light editors, and actor library.
 * Only visible to GM role.
 */

import SceneNavigator from './SceneNavigator.svelte';
import WallEditor from './WallEditor.svelte';
import LightEditor from './LightEditor.svelte';
import ActorLibrary from './ActorLibrary.svelte';

// Tabbed interface for GM tools
let activeTab = $state<'scenes' | 'walls' | 'lights' | 'actors'>('scenes');
</script>

<div class="left-sidebar">
  <div class="sidebar-header">
    <h3>GM Tools</h3>
  </div>
  
  <div class="sidebar-tabs">
    <button 
      class="tab-button" 
      class:active={activeTab === 'scenes'}
      onclick={() => activeTab = 'scenes'}
    >
      Scenes
    </button>
    <button 
      class="tab-button" 
      class:active={activeTab === 'walls'}
      onclick={() => activeTab = 'walls'}
    >
      Walls
    </button>
    <button 
      class="tab-button" 
      class:active={activeTab === 'lights'}
      onclick={() => activeTab = 'lights'}
    >
      Lights
    </button>
    <button 
      class="tab-button" 
      class:active={activeTab === 'actors'}
      onclick={() => activeTab = 'actors'}
    >
      Actors
    </button>
  </div>

  <div class="sidebar-content">
    {#if activeTab === 'scenes'}
      <SceneNavigator />
    {:else if activeTab === 'walls'}
      <WallEditor />
    {:else if activeTab === 'lights'}
      <LightEditor />
    {:else if activeTab === 'actors'}
      <ActorLibrary />
    {/if}
  </div>
</div>

<style>
  .left-sidebar {
    display: flex;
    flex-direction: column;
    height: 100%;
    background-color: var(--color-bg-secondary);
    border-right: 1px solid var(--color-border-default);
  }

  .sidebar-header {
    padding: var(--space-md);
    border-bottom: 1px solid var(--color-border-default);
    background-color: var(--color-bg-tertiary);
  }

  .sidebar-header h3 {
    margin: 0;
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
    color: var(--color-gm-highlight);
  }

  .sidebar-tabs {
    display: flex;
    border-bottom: 1px solid var(--color-border-default);
  }

  .tab-button {
    flex: 1;
    padding: var(--space-sm);
    background-color: var(--color-bg-secondary);
    border: none;
    border-right: 1px solid var(--color-border-subtle);
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .tab-button:last-child {
    border-right: none;
  }

  .tab-button:hover {
    background-color: var(--color-bg-tertiary);
    color: var(--color-text-primary);
  }

  .tab-button.active {
    background-color: var(--color-bg-primary);
    color: var(--color-accent-primary);
    border-bottom: 2px solid var(--color-accent-primary);
  }

  .sidebar-content {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-md);
  }
</style>
