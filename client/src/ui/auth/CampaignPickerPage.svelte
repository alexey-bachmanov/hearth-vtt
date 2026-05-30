<script lang="ts">
/**
 * CampaignPickerPage — player campaign list (`/play`).
 *
 * Lists all campaigns the current player has a seat in (`me.seats`).
 * Each entry navigates to `/play/<campaignId>`.
 *
 * Empty state: shown when the player has no seats yet.
 *
 * Handles `?error=campaign-access-revoked` set by the stale-seat redirect
 * (5C-4): reads the param once on mount, removes it from the URL via
 * replaceState, and shows a transient error toast.
 *
 * @see docs/decisions/010-player-account-model.md
 */

import { onMount } from 'svelte';
import { navigate } from '../../app/routes.js';
import { authState } from '../../state/auth.svelte.js';
import { notificationState } from '../../state/notifications.svelte.js';

onMount(() => {
  const search = window.location.search;
  if (search.includes('error=campaign-access-revoked')) {
    // Strip the error param before notifying so it isn't re-shown on refresh
    const stripped = search
      .replace(/[?&]error=campaign-access-revoked/, '')
      .replace(/^\?$/, '');
    window.history.replaceState(
      null,
      '',
      window.location.pathname + stripped,
    );
    notificationState.warning(
      'Your access to that campaign was revoked. Contact your GM.',
      'ephemeral',
    );
  }
});
</script>

<div class="centered-page">
  <div class="picker-card">
    <header class="card-header">
      <h1>Your Campaigns</h1>
      <button
        class="account-link"
        onclick={() => navigate('/play/account')}
        aria-label="Account settings"
      >
        {authState.me?.username ?? ''}
      </button>
    </header>

    {#if !authState.me?.seats.length}
      <div class="empty-state">
        <p>You are not signed up for any campaigns yet.</p>
        <p class="hint">Ask your Game Master for an invite link to join one.</p>
      </div>
    {:else}
      <ul class="campaign-list">
        {#each authState.me.seats as seat (seat.seatId)}
          <li>
            <button
              class="campaign-btn"
              onclick={() => navigate(`/play/${seat.campaignId}`)}
            >
              <span class="campaign-name">{seat.campaignName}</span>
              <span class="campaign-role">{seat.role}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>

<style>
  .picker-card {
    width: 100%;
    max-width: 560px;
    padding: var(--space-2xl);
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    display: flex;
    flex-direction: column;
    gap: var(--space-xl);
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-md);
  }

  h1 {
    margin: 0;
    font-size: var(--font-size-2xl);
    font-weight: var(--font-weight-bold);
    color: var(--color-text-primary);
  }

  .account-link {
    background: none;
    border: 1px solid var(--color-border-default);
    color: var(--color-text-secondary);
    padding: var(--space-xs) var(--space-md);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-sm);
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .account-link:hover {
    opacity: 0.8;
  }

  .empty-state {
    text-align: center;
    color: var(--color-text-secondary);
  }

  .empty-state p {
    margin: 0 0 var(--space-sm) 0;
  }

  .hint {
    font-size: var(--font-size-sm);
    font-style: italic;
  }

  .campaign-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .campaign-btn {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    padding: var(--space-md) var(--space-lg);
    background-color: var(--color-bg-tertiary);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: opacity 0.15s;
    text-align: left;
  }

  .campaign-btn:hover {
    opacity: 0.8;
  }

  .campaign-name {
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-primary);
  }

  .campaign-role {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    text-transform: capitalize;
  }
</style>
