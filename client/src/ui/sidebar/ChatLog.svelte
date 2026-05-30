<script lang="ts">
/**
 * ChatLog - Recent game events and player chat messages.
 * 
 * Displays a scrollable list of GameEventCards wired to campaign state.
 */

import { campaignState } from '../../state';
import { wsClient } from '../../api';
import GameEventCard from './GameEventCard.svelte';

const events = $derived(Array.from(campaignState.events.values()));

let messageInput = $state('');
let sendError = $state('');

/**
 * Pre-flight regex for dice formula strings.
 *
 * Allows the characters used by rpg-dice-roller notation: digits, d, k, h,
 * l, r, f (fudge), comparison operators, arithmetic, parentheses, and
 * whitespace. Anything else is rejected before the payload reaches the server.
 */
const DICE_FORMULA_PREFLIGHT = /^[0-9dkhlrf<>=!+\-*/()\s]+$/i;

/** Command pattern: /roll or /r followed by a formula. */
const ROLL_COMMAND = /^\/r(?:oll)?\s+(.+)$/i;

/** Max chat message length (matching server-side limit). */
const MAX_CHAT_LENGTH = 2000;

function handleSend() {
  const text = messageInput.trim();
  if (!text) return;

  sendError = '';

  const rollMatch = text.match(ROLL_COMMAND);
  if (rollMatch) {
    const formula = rollMatch[1].trim();
    if (!DICE_FORMULA_PREFLIGHT.test(formula)) {
      sendError = 'Invalid dice formula. Use notation like "2d6+3" or "4d8kh3".';
      return;
    }
    wsClient.dispatch('dice.roll', { formula });
    messageInput = '';
    return;
  }

  if (text.length > MAX_CHAT_LENGTH) {
    sendError = `Message too long (max ${MAX_CHAT_LENGTH} characters).`;
    return;
  }

  wsClient.dispatch('chat.send', { text });
  messageInput = '';
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
    {#if sendError}
      <p class="send-error" role="alert">{sendError}</p>
    {/if}
    <div class="chat-input-row">
      <input
        type="text"
        placeholder="Type a message or /roll 1d20..."
        bind:value={messageInput}
        onkeydown={handleKeydown}
        aria-label="Send a message"
      />
      <button onclick={handleSend} aria-label="Send message">Send</button>
    </div>
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
    flex-direction: column;
    gap: var(--space-xs, 4px);
    padding: var(--space-md);
    border-top: 1px solid var(--color-border-default);
    background-color: var(--color-bg-tertiary);
  }

  .send-error {
    margin: 0;
    padding: var(--space-xs, 4px) var(--space-sm);
    background-color: var(--color-error-bg, #3a1a1a);
    border: 1px solid var(--color-error-border, #c0392b);
    border-radius: var(--radius-sm);
    color: var(--color-error-text, #e74c3c);
    font-size: var(--font-size-xs, 0.75rem);
  }

  .chat-input-row {
    display: flex;
    gap: var(--space-sm);
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
