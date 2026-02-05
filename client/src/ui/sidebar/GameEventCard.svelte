<script lang="ts">
/**
 * GameEventCard - Single event/message entry.
 * 
 * Displays a chat message, dice roll, or system event.
 */

interface Props {
  event: {
    id: number;
    type: 'chat' | 'dice' | 'system';
    content: string;
    timestamp: string;
  };
}

let { event }: Props = $props();
</script>

<div class="event-card" data-type={event.type}>
  <div class="event-timestamp">{event.timestamp}</div>
  <div class="event-content">{event.content}</div>
</div>

<style>
  .event-card {
    padding: var(--space-sm);
    background-color: var(--color-bg-tertiary);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-sm);
  }

  .event-card[data-type="system"] {
    background-color: var(--color-bg-elevated);
    border-color: var(--color-accent-primary);
  }

  .event-card[data-type="dice"] {
    background-color: var(--color-bg-elevated);
    border-left: 3px solid var(--color-accent-primary);
  }

  .event-timestamp {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    margin-bottom: var(--space-xs);
  }

  .event-content {
    color: var(--color-text-secondary);
    line-height: 1.4;
  }
</style>
