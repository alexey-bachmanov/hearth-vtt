<script lang="ts">
/**
 * SnackbarArea - Container for prompts, notifications, and persistent indicators.
 * 
 * Renders at the top of the PlayLayout.
 * Contains prompt snackbars, notification toasts, and concentration indicators.
 */

import PromptSnackbar from './PromptSnackbar.svelte';
import NotificationToast from './NotificationToast.svelte';
import ConcentrationIndicator from './ConcentrationIndicator.svelte';

// TODO: Wire to prompt/notification state
let hasPrompts = $state(false);
let hasNotifications = $state(false);
let hasConcentration = $state(false);
</script>

<div class="snackbar-area">
  {#if hasPrompts}
    <PromptSnackbar />
  {/if}
  
  {#if hasNotifications}
    <NotificationToast />
  {/if}
  
  {#if hasConcentration}
    <ConcentrationIndicator />
  {/if}
  
  <!-- Placeholder when empty -->
  {#if !hasPrompts && !hasNotifications && !hasConcentration}
    <div class="snackbar-placeholder">
      <span class="snackbar-label">SnackbarArea</span>
      <span class="snackbar-desc">Prompts and notifications appear here</span>
    </div>
  {/if}
</div>

<style>
  .snackbar-area {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    padding: var(--space-md);
    background-color: transparent;
    min-height: 60px;
  }

  .snackbar-placeholder {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-sm) var(--space-md);
    background-color: var(--color-bg-secondary);
    border: 1px dashed var(--color-border-subtle);
    border-radius: var(--radius-md);
  }

  .snackbar-label {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-secondary);
  }

  .snackbar-desc {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
  }
</style>
