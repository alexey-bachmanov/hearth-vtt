<script lang="ts">
/**
 * PingTool - Map ping/attention marker.
 * 
 * Click to send animated ping at cursor location.
 */

let isActive = $state<boolean>(false);

function togglePing() {
  isActive = !isActive;
  // TODO: Wire to send ping on canvas click
  console.log('Ping tool:', isActive ? 'active' : 'inactive');
}
</script>

<button 
  class="ping-button" 
  class:active={isActive}
  onclick={togglePing}
>
  📍 Ping
</button>

<style>
  .ping-button {
    padding: var(--space-xs) var(--space-md);
    background-color: var(--color-bg-tertiary);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-sm);
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .ping-button:hover {
    background-color: var(--color-bg-elevated);
    border-color: var(--color-accent-primary);
    color: var(--color-text-primary);
  }

  .ping-button.active {
    background-color: var(--color-accent-primary);
    border-color: var(--color-accent-primary);
    color: white;
  }
</style>
