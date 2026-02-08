<script lang="ts">
/**
 * RightSidebar - Chat and event log overlay.
 * 
 * Slides in/out from the right edge, overlaying the canvas.
 * Toggle via vertical tab button on the left edge.
 */

import { Icon } from '../shared';
import { MessageSquare, X } from 'lucide-svelte';
import ChatLog from './ChatLog.svelte';

let isOpen = $state(true);
let showContent = $state(true);
let sidebarEl: HTMLDivElement | null = $state(null);

function toggleSidebar() {
  if (isOpen) {
    // Closing: hide content immediately, then slide out
    showContent = false;
    isOpen = false;
  } else {
    // Opening: start slide in, wait for it to complete before showing content
    isOpen = true;
    showContent = false;
  }
}

function handleTransitionEnd(event: TransitionEvent) {
  // Only respond to transform transitions on the sidebar itself
  if (event.propertyName === 'transform' && event.target === sidebarEl && isOpen) {
    showContent = true;
  }
}
</script>

<div
  bind:this={sidebarEl}
  class="right-sidebar"
  class:right-sidebar--closed={!isOpen}
  ontransitionend={handleTransitionEnd}
>
  <!-- Vertical tab button on left edge -->
  <button
    class="sidebar-tab"
    onclick={toggleSidebar}
    aria-label={isOpen ? 'Close chat' : 'Open chat'}
  >
    <Icon icon={isOpen ? X : MessageSquare} label="" size={20} />
  </button>

  {#if showContent}
    <ChatLog />
  {/if}
</div>

<style>
  .right-sidebar {
    position: fixed;
    top: 0;
    right: 0;
    height: 100vh;
    width: var(--sidebar-right-width);
    display: flex;
    flex-direction: column;
    background-color: var(--color-bg-secondary);
    border-left: 1px solid var(--color-border-default);
    box-shadow: var(--shadow-lg);
    z-index: var(--z-sidebar);
    transition: transform var(--transition-normal);
  }

  .right-sidebar--closed {
    transform: translateX(100%);
  }

  /* Vertical tab button on left edge */
  .sidebar-tab {
    position: absolute;
    top: var(--space-md);
    left: -40px; /* Tab width */
    width: 40px;
    height: 80px;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border-default);
    border-right: none;
    border-radius: var(--radius-sm) 0 0 var(--radius-sm);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .sidebar-tab:hover {
    background-color: var(--color-bg-hover);
    border-color: var(--color-border-hover);
  }
</style>
