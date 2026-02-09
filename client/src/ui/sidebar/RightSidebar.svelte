<script lang="ts">
/**
 * RightSidebar - Chat and event log overlay.
 * 
 * Collapses to a narrow control bar on the right edge, or expands to show full chat log.
 * Toggle via vertical bar with icon button on the inside edge.
 */

import { Icon } from '../shared';
import { MessageSquare, ChevronRight } from 'lucide-svelte';
import { uiState } from '../../state/ui.svelte';
import ChatLog from './ChatLog.svelte';

let showContent = $state(false);
let sidebarEl: HTMLDivElement | null = $state(null);

function toggleSidebar() {
  if (uiState.rightSidebarOpen) {
    // Closing: hide content immediately, then collapse
    showContent = false;
    uiState.rightSidebarOpen = false;
  } else {
    // Opening: start expansion, wait for it to complete before showing content
    uiState.rightSidebarOpen = true;
    showContent = false;
  }
}

function handleTransitionEnd(event: TransitionEvent) {
  // Only respond to width/flex-basis transitions on the sidebar itself
  if ((event.propertyName === 'flex-basis' || event.propertyName === 'width') && 
      event.target === sidebarEl && 
      uiState.rightSidebarOpen) {
    showContent = true;
  }
}
</script>

<div
  bind:this={sidebarEl}
  class="drawer drawer--right"
  class:drawer--closed={!uiState.rightSidebarOpen}
  ontransitionend={handleTransitionEnd}
>
  <!-- Control bar on inside (left) edge -->
  <div class="drawer__control-bar">
    <button
      class="drawer__control-btn"
      onclick={toggleSidebar}
      aria-label={uiState.rightSidebarOpen ? 'Collapse chat' : 'Expand chat'}
    >
      <Icon 
        icon={uiState.rightSidebarOpen ? ChevronRight : MessageSquare} 
        label="" 
        size={24} 
      />
    </button>
  </div>

  {#if showContent && uiState.rightSidebarOpen}
    <div class="drawer__content">
      <ChatLog />
    </div>
  {/if}
</div>
