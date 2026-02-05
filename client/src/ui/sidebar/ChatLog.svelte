<script lang="ts">
/**
 * ChatLog - Recent game events and player chat messages.
 * 
 * Displays a scrollable list of GameEventCards.
 */

import GameEventCard from './GameEventCard.svelte';

// Placeholder data
const sampleEvents = [
  { id: 1, type: 'chat' as const, content: 'Player 1: Hello!', timestamp: '10:23' },
  { id: 2, type: 'dice' as const, content: 'Player 2 rolled 1d20: 18', timestamp: '10:24' },
  { id: 3, type: 'system' as const, content: 'Combat started', timestamp: '10:25' },
];
</script>

<div class="chat-log">
  <div class="chat-header">
    <h3>Event Log</h3>
  </div>
  
  <div class="chat-messages">
    {#each sampleEvents as event (event.id)}
      <GameEventCard {event} />
    {/each}
  </div>
  
  <div class="chat-input">
    <input type="text" placeholder="Type a message..." />
    <button>Send</button>
  </div>
</div>

<style>
  .chat-log {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .chat-header {
    padding: var(--space-md);
    border-bottom: 1px solid var(--color-border-default);
    background-color: var(--color-bg-tertiary);
  }

  .chat-header h3 {
    margin: 0;
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
  }

  .chat-messages {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-md);
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .chat-input {
    display: flex;
    gap: var(--space-sm);
    padding: var(--space-md);
    border-top: 1px solid var(--color-border-default);
    background-color: var(--color-bg-tertiary);
  }

  .chat-input input {
    flex: 1;
    padding: var(--space-sm);
    background-color: var(--color-bg-primary);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-sm);
    color: var(--color-text-primary);
    font-size: var(--font-size-sm);
  }

  .chat-input button {
    padding: var(--space-sm) var(--space-md);
    background-color: var(--color-accent-primary);
    border: none;
    border-radius: var(--radius-sm);
    color: white;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition: background-color var(--transition-fast);
  }

  .chat-input button:hover {
    background-color: var(--color-accent-hover);
  }
</style>
