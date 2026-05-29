<script lang="ts">
/**
 * PlayAccountPage — player account placeholder (`/play/account`).
 *
 * Displays the current player's username and provides a logout action.
 * Links back to the campaign picker at `/play`.
 *
 * "Full account settings" is listed as out-of-scope for this phase;
 * a "coming soon" message is shown in that section.
 *
 * @see docs/decisions/010-player-account-model.md
 */

import { navigate } from '../../app/routes.js';
import { authState } from '../../state/auth.svelte.js';
</script>

<div class="centered-page">
  <div class="account-card">
    <h1>My Account</h1>

    <div class="info-row">
      <span class="label">Username</span>
      <span class="value">{authState.me?.username ?? '—'}</span>
    </div>

    <div class="section">
      <h2>Settings</h2>
      <p class="coming-soon">Account settings coming soon.</p>
    </div>

    <div class="actions">
      <button class="btn btn-secondary" onclick={() => navigate('/play')}>
        Back to Campaign Picker
      </button>
      <button class="btn btn-danger" onclick={() => authState.logout()}>
        Log Out
      </button>
    </div>
  </div>
</div>

<style>
  .account-card {
    width: 100%;
    max-width: 480px;
    padding: var(--space-2xl);
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    display: flex;
    flex-direction: column;
    gap: var(--space-xl);
  }

  h1 {
    margin: 0;
    font-size: var(--font-size-2xl);
    font-weight: var(--font-weight-bold);
    color: var(--color-text-primary);
  }

  h2 {
    margin: 0 0 var(--space-sm) 0;
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-primary);
  }

  .info-row {
    display: flex;
    gap: var(--space-md);
    align-items: baseline;
  }

  .label {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    font-weight: var(--font-weight-medium);
    min-width: 100px;
  }

  .value {
    font-size: var(--font-size-base);
    color: var(--color-text-primary);
  }

  .coming-soon {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    font-style: italic;
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .btn {
    padding: var(--space-sm) var(--space-lg);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    border: 1px solid transparent;
    transition: opacity 0.15s;
    text-align: center;
  }

  .btn:hover {
    opacity: 0.85;
  }

  .btn-secondary {
    background-color: var(--color-bg-tertiary);
    color: var(--color-text-primary);
    border-color: var(--color-border-default);
  }

  .btn-danger {
    background-color: transparent;
    color: var(--color-error, #dc2626);
    border-color: var(--color-error, #dc2626);
  }
</style>
