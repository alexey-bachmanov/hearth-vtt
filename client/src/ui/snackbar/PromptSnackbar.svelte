<script lang="ts">
/**
 * PromptSnackbar - Displays blocking or ephemeral prompts from the server.
 * 
 * Renders prompts that require user interaction (e.g., target selection).
 */
</script>

<div class="prompt-snackbar">
  <div class="prompt-content">
    <strong>PromptSnackbar</strong>
    <span>Blocking/ephemeral prompts (e.g., "Select a target")</span>
  </div>
  <button class="prompt-action">Action</button>
  <button class="prompt-cancel">Cancel</button>
</div>

<style>
  .prompt-snackbar {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-md);
    background-color: var(--color-bg-elevated);
    border: 2px solid var(--color-accent-primary);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md);
  }

  .prompt-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .prompt-content strong {
    color: var(--color-text-primary);
    font-size: var(--font-size-md);
  }

  .prompt-content span {
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
  }

  .prompt-action,
  .prompt-cancel {
    padding: var(--space-sm) var(--space-md);
    border: none;
    border-radius: var(--radius-sm);
    font-weight: var(--font-weight-semibold);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .prompt-action {
    background-color: var(--color-accent-primary);
    color: var(--color-text-primary);
  }

  .prompt-action:hover {
    background-color: var(--color-accent-hover);
  }

  .prompt-cancel {
    background-color: var(--color-bg-tertiary);
    color: var(--color-text-secondary);
  }

  .prompt-cancel:hover {
    background-color: var(--color-border-strong);
  }
</style>
