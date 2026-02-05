<script lang="ts">
/**
 * InitiativeModal - Combat turn order tracker.
 * 
 * Shows initiative order and current turn marker.
 */

// Mock initiative data
const initiativeOrder = [
  { id: 1, name: 'Goblin 1', initiative: 18, isActive: true },
  { id: 2, name: 'Player 1', initiative: 16, isActive: false },
  { id: 3, name: 'Player 2', initiative: 14, isActive: false },
  { id: 4, name: 'Goblin 2', initiative: 12, isActive: false },
];
</script>

<div class="initiative-modal">
  <div class="component-label">
    <strong>InitiativeModal</strong>
  </div>
  <p class="component-description">
    Combat turn order tracker
  </p>
  
  <div class="initiative-list">
    {#each initiativeOrder as combatant (combatant.id)}
      <div class="initiative-entry" class:active={combatant.isActive}>
        <span class="initiative-score">{combatant.initiative}</span>
        <span class="combatant-name">{combatant.name}</span>
        {#if combatant.isActive}
          <span class="current-turn">← Current Turn</span>
        {/if}
      </div>
    {/each}
  </div>
  
  <div class="initiative-controls">
    <button class="control-button">⏮️ Previous</button>
    <button class="control-button primary">Next Turn ⏭️</button>
    <button class="control-button danger">End Combat</button>
  </div>
</div>

<style>
  .initiative-modal {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    min-width: 400px;
  }

  .component-label strong {
    color: var(--color-text-primary);
    font-size: var(--font-size-md);
  }

  .component-description {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--color-text-tertiary);
  }

  .initiative-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .initiative-entry {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm);
    background-color: var(--color-bg-tertiary);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-sm);
    transition: all var(--transition-fast);
  }

  .initiative-entry.active {
    background-color: var(--color-accent-primary);
    border-color: var(--color-accent-primary);
  }

  .initiative-score {
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-bold);
    color: var(--color-text-primary);
    min-width: 32px;
    text-align: center;
  }

  .initiative-entry.active .initiative-score,
  .initiative-entry.active .combatant-name {
    color: white;
  }

  .combatant-name {
    flex: 1;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .current-turn {
    font-size: var(--font-size-xs);
    color: white;
    font-weight: var(--font-weight-semibold);
  }

  .initiative-controls {
    display: flex;
    gap: var(--space-sm);
    padding-top: var(--space-sm);
    border-top: 1px solid var(--color-border-default);
  }

  .control-button {
    flex: 1;
    padding: var(--space-sm);
    background-color: var(--color-bg-tertiary);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-sm);
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .control-button:hover {
    background-color: var(--color-bg-elevated);
    border-color: var(--color-accent-primary);
    color: var(--color-text-primary);
  }

  .control-button.primary {
    background-color: var(--color-accent-primary);
    border-color: var(--color-accent-primary);
    color: white;
  }

  .control-button.primary:hover {
    background-color: var(--color-accent-hover);
  }

  .control-button.danger {
    background-color: var(--color-bg-tertiary);
    border-color: var(--color-danger);
    color: var(--color-danger);
  }

  .control-button.danger:hover {
    background-color: var(--color-danger);
    color: white;
  }
</style>
