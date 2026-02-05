<script lang="ts">
/**
 * InitiativeTracker - Button to open initiative modal.
 * 
 * Opens the InitiativeModal floating window.
 */

function openInitiativeModal() {
  // TODO: Wire to uiState.openWindow('initiative')
  console.log('Open initiative tracker modal');
}
</script>

<button class="initiative-button" onclick={openInitiativeModal}>
  ⚔️ Initiative
</button>

<style>
  .initiative-button {
    padding: var(--space-xs) var(--space-md);
    background-color: var(--color-bg-tertiary);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-sm);
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition: all var(--transition-fast);
    display: flex;
    align-items: center;
    gap: var(--space-xs);
  }

  .initiative-button:hover {
    background-color: var(--color-bg-elevated);
    border-color: var(--color-accent-primary);
    color: var(--color-text-primary);
  }
</style>
