<script lang="ts">
/**
 * GameEventCard - Single event/message entry.
 *
 * Renders a chat message or dice roll result from the campaign event log.
 */

import type { GameEvent } from '../../state/campaign.svelte';

interface Props {
  event: GameEvent;
}

let { event }: Props = $props();

// Format timestamp from milliseconds
const timestamp = $derived(() => {
  try {
    return new Date(event.timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
});
</script>

<div class="event-card" data-type={event.type}>
  <div class="event-timestamp">{timestamp()}</div>

  {#if event.type === 'chat.message'}
    <div class="event-content">
      <span class="event-sender">{event.displayName}</span>
      <span class="event-text">{event.text}</span>
    </div>

  {:else if event.type === 'dice.rolled'}
    <div class="event-content event-content--roll">
      <span class="event-sender">{event.displayName}</span>
      <span class="event-roll-formula">rolled {event.formula}</span>
      <span class="event-roll-dice">[{event.rolls.join(', ')}]</span>
      <span class="event-roll-total">= {event.total}</span>
    </div>

  {:else}
    <div class="event-content event-content--system">{event.message}</div>
  {/if}
</div>

<style>
  .event-card {
    padding: var(--space-sm);
    background-color: var(--color-bg-tertiary);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-sm);
  }

  .event-card[data-type='dice.rolled'] {
    background-color: var(--color-bg-elevated);
    border-left: 3px solid var(--color-accent-primary);
  }

  .event-card[data-type='system'] {
    background-color: var(--color-bg-elevated);
    border-color: var(--color-accent-primary);
    font-style: italic;
  }

  .event-timestamp {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    margin-bottom: var(--space-xs);
  }

  .event-content {
    color: var(--color-text-primary);
    line-height: var(--line-height-relaxed);
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    align-items: baseline;
  }

  .event-sender {
    font-weight: 600;
  }

  .event-sender::after {
    content: ':';
  }

  .event-roll-formula {
    color: var(--color-text-secondary);
  }

  .event-roll-dice {
    color: var(--color-text-tertiary);
    font-size: 0.85em;
  }

  .event-roll-total {
    font-weight: 700;
    color: var(--color-accent-primary, var(--color-text-primary));
  }

  .event-content--system {
    color: var(--color-text-secondary);
  }
</style>
