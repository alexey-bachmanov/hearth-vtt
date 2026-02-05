<script lang="ts">
/**
 * ConcentrationIndicator - Displays persistent effect/concentration state.
 * 
 * Shows ongoing effects that require concentration (e.g., "Concentrating on Wall of Fire").
 */
</script>

<div class="concentration-indicator">
  <div class="concentration-icon">🔮</div>
  <div class="concentration-content">
    <strong>ConcentrationIndicator</strong>
    <span>Persistent effect tracking (e.g., "Concentrating on Wall of Fire")</span>
  </div>
  <button class="concentration-dismiss">End</button>
</div>

<style>
  .concentration-indicator {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-md);
    background-color: var(--color-bg-elevated);
    border: 2px solid var(--color-warning);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md);
  }

  .concentration-icon {
    font-size: var(--font-size-xl);
  }

  .concentration-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .concentration-content strong {
    color: var(--color-warning);
    font-size: var(--font-size-sm);
  }

  .concentration-content span {
    color: var(--color-text-secondary);
    font-size: var(--font-size-xs);
  }

  .concentration-dismiss {
    padding: var(--space-sm) var(--space-md);
    background-color: var(--color-bg-tertiary);
    border: none;
    border-radius: var(--radius-sm);
    color: var(--color-text-secondary);
    font-weight: var(--font-weight-semibold);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .concentration-dismiss:hover {
    background-color: var(--color-border-strong);
    color: var(--color-text-primary);
  }
</style>
