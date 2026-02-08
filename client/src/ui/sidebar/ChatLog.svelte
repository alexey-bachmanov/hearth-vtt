<script lang="ts">
/**
 * ChatLog - Recent game events and player chat messages.
 * 
 * Displays a scrollable list of GameEventCards wired to campaign state.
 */

import { campaignState } from '../../state';
import GameEventCard from './GameEventCard.svelte';

const events = $derived(Array.from(campaignState.events.values()));

let messageInput = $state('');

function handleSend() {
  if (messageInput.trim()) {
    // TODO: Send message via API/WebSocket
    console.log('Send message:', messageInput);
    messageInput = '';
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    handleSend();
  }
}
</script>

<div class="chat-log">
  <div class="chat-messages">
    {#each events as event (event.id)}
      <GameEventCard {event} />
    {/each}

    {#if events.length === 0}
      <div class="empty-state">
        <p>No events yet. Game events and chat messages will appear here.</p>
      </div>
    {/if}
  </div>
  
  <div class="chat-input">
    <input
      type="text"
      placeholder="Type a message..."
      bind:value={messageInput}
      onkeydown={handleKeydown}
      aria-label="Chat message"
    />
    <button onclick={handleSend} aria-label="Send message">Send</button>
  </div>
</div>

<style>
  .chat-log {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .chat-messages {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-md);
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .empty-state {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    font-style: italic;
  }

  .empty-state p {
    margin: 0;
    max-width: 250px;
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

  .chat-input input:focus {
    outline: none;
    border-color: var(--color-accent-primary);
  }

  .chat-input button {
    padding: var(--space-sm) var(--space-md);
    background-color: var(--color-accent-primary);
    color: white;
    border: none;
    border-radius: var(--radius-sm);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition: background-color var(--transition-fast);
  }

  .chat-input button:hover {
    background-color: var(--color-accent-hover);
  }

  .chat-input button:active {
    background-color: var(--color-accent-active);
  }
</style>
