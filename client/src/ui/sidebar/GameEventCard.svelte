<script lang="ts">
/**
 * GameEventCard - Single event/message entry.
 * 
 * Displays a chat message, dice roll, damage, effect, or system event.
 * Renders appropriate content based on event type.
 */

import type { GameEvent } from '../../state/campaign.svelte';

interface Props {
  event: GameEvent;
}

let { event }: Props = $props();

// Format timestamp from ISO string
const timestamp = $derived(() => {
  try {
    const date = new Date(event.timestamp);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
});

// Generate event content based on type
const content = $derived(() => {
  switch (event.type) {
    case 'chat.message':
      return `${event.actorName || 'Unknown'}: ${event.message || ''}`;
    
    case 'roll.result': {
      const dice = event.dice?.map(d => `d${d.sides}:${d.result}`).join(', ') || '';
      return `${event.actorName || 'Unknown'} rolled ${event.formula || ''}: ${event.total || 0}${dice ? ` (${dice})` : ''}`;
    }
    
    case 'damage.applied':
      return `${event.actorName || 'Unknown'} dealt ${event.damage || 0} ${event.damageType || 'damage'} to ${event.target || 'target'}`;
    
    case 'effect.applied':
      return `${event.effectName || 'Effect'} applied to ${event.target || event.actorName || 'target'}`;
    
    case 'system':
      return event.message || 'System event';
    
    default:
      return 'Unknown event';
  }
});

// Determine card styling variant
const variant = $derived(() => {
  if (event.type === 'roll.result') return 'roll';
  if (event.type === 'damage.applied') return 'damage';
  if (event.type === 'system') return 'system';
  return 'chat';
});
</script>

<div class="event-card" data-variant={variant()}>
  <div class="event-timestamp">{timestamp()}</div>
  <div class="event-content">{content()}</div>
</div>

<style>
  .event-card {
    padding: var(--space-sm);
    background-color: var(--color-bg-tertiary);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-sm);
  }

  .event-card[data-variant="system"] {
    background-color: var(--color-bg-elevated);
    border-color: var(--color-accent-primary);
  }

  .event-card[data-variant="roll"] {
    background-color: var(--color-bg-elevated);
    border-left: 3px solid var(--color-accent-primary);
  }

  .event-card[data-variant="damage"] {
    background-color: var(--color-bg-elevated);
    border-left: 3px solid var(--color-danger);
  }

  .event-timestamp {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    margin-bottom: var(--space-xs);
  }

  .event-content {
    color: var(--color-text-primary);
    line-height: var(--line-height-relaxed);
  }
</style>
