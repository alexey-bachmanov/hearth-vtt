<script lang="ts">
/**
 * AccountDetail - View and manage a single player account.
 *
 * Displays:
 * - Account info (username, created date, last login, password-change flag)
 * - Seats owned by this account (with cross-link to seat panel)
 * - Controls: reset password, revoke all sessions, remove account
 * - Disconnect account from a specific seat
 *
 * TODO (Phase 5+): Wire handlers to real API endpoints.
 *   POST /api/admin/accounts/:id/reset-password
 *   POST /api/admin/accounts/:id/revoke-sessions
 *   (account removal and seat-disconnect endpoints are not yet defined)
 */

import { adminTree, type MockAccount, type MockSeat } from '../../state/admin.svelte.js';
import '../../styles/components-admin.css';

interface Props {
  accountId: string;
}

let { accountId }: Props = $props();

let account = $derived<MockAccount | undefined>(adminTree.getAccount(accountId));
let seats = $derived<MockSeat[]>(adminTree.getSeatsForAccount(accountId));

// Reset-password form state
let showPasswordForm = $state(false);
let newPassword = $state('');
let passwordConfirm = $state('');
let passwordError = $state<string | null>(null);
let passwordSuccess = $state(false);

// Confirm-remove state
let confirmRemove = $state(false);

$effect(() => {
  // Reset local form state when the viewed account changes
  void accountId;
  showPasswordForm = false;
  newPassword = '';
  passwordConfirm = '';
  passwordError = null;
  passwordSuccess = false;
  confirmRemove = false;
});

function formatDate(iso: string | null): string {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleString();
}

function timeSince(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

function handleResetPassword() {
  if (!newPassword || newPassword.length < 8) {
    passwordError = 'Password must be at least 8 characters.';
    return;
  }
  if (newPassword !== passwordConfirm) {
    passwordError = 'Passwords do not match.';
    return;
  }
  // TODO (Phase 5+): call POST /api/admin/accounts/:id/reset-password
  console.log('[AccountDetail] Reset password for account:', accountId, '(mock)');
  passwordError = null;
  passwordSuccess = true;
  showPasswordForm = false;
  newPassword = '';
  passwordConfirm = '';
}

function handleRevokeSessions() {
  if (!confirm(`Revoke all active sessions for "${account?.username}"? They will be logged out immediately.`)) {
    return;
  }
  // TODO (Phase 5+): call POST /api/admin/accounts/:id/revoke-sessions
  console.log('[AccountDetail] Revoke sessions for account:', accountId, '(mock)');
}

function handleDisconnectSeat(seatId: string) {
  const seat = adminTree.getSeat(seatId);
  if (!confirm(`Disconnect account "${account?.username}" from seat "${seat?.displayName}"? The seat will become unclaimed.`)) {
    return;
  }
  // TODO (Phase 5+): call dedicated disconnect endpoint once it exists
  console.log('[AccountDetail] Disconnect account', accountId, 'from seat', seatId, '(mock)');
  const a = adminTree.accounts.find((x) => x.id === accountId);
  if (a) {
    a.seatIds = a.seatIds.filter((id) => id !== seatId);
  }
  const s = adminTree.seats.find((x) => x.id === seatId);
  if (s) {
    delete s.claimedByAccountId;
  }
}

function handleRemoveAccount() {
  if (!confirmRemove) {
    confirmRemove = true;
    return;
  }
  // TODO (Phase 5+): call DELETE /api/admin/accounts/:id once endpoint exists
  console.log('[AccountDetail] Remove account:', accountId, '(mock)');
  adminTree.accounts = adminTree.accounts.filter((a) => a.id !== accountId);
  adminTree.navigateTo('accounts');
}

function handleGoToSeat(seatId: string) {
  adminTree.navigateTo(seatId);
}
</script>

{#if !account}
  <div class="detail-empty">
    <p>Account not found.</p>
  </div>
{:else}
  <div class="account-detail">
    <!-- Header -->
    <header class="detail-header">
      <h1 class="detail-title">
        <span class="account-icon" aria-hidden="true">👤</span>
        {account.username}
      </h1>
      {#if account.mustChangePassword}
        <span class="badge badge--warning">Password reset required</span>
      {/if}
    </header>

    <!-- Account info -->
    <section class="detail-section">
      <h2>Account Info</h2>
      <dl class="info-grid">
        <dt>Username</dt>
        <dd>{account.username}</dd>

        <dt>Account ID</dt>
        <dd class="mono">{account.id}</dd>

        <dt>Created</dt>
        <dd>{formatDate(account.createdAt)}</dd>

        <dt>Last Login</dt>
        <dd>
          {formatDate(account.lastLoginAt)}
          {#if account.lastLoginAt}
            <span class="text-muted">({timeSince(account.lastLoginAt)})</span>
          {/if}
        </dd>

        <dt>Status</dt>
        <dd>
          {#if account.mustChangePassword}
            <span class="badge badge--warning">Must change password</span>
          {:else}
            <span class="badge badge--success">Active</span>
          {/if}
        </dd>
      </dl>
    </section>

    <!-- Seats -->
    <section class="detail-section">
      <h2>Campaign Seats</h2>
      {#if seats.length === 0}
        <p class="empty-state">No seats assigned to this account.</p>
      {:else}
        <ul class="seat-list">
          {#each seats as seat (seat.id)}
            {@const campaign = adminTree.getCampaignForSeat(seat.id)}
            <li class="seat-row">
              <div class="seat-row__info">
                <span class="seat-role-icon" aria-hidden="true">
                  {seat.role === 'gm' ? '👑' : '👤'}
                </span>
                <div class="seat-row__labels">
                  <span class="seat-row__name">{seat.displayName}</span>
                  <span class="text-muted">
                    {campaign?.name ?? seat.campaignId}
                    &middot;
                    {seat.role.toUpperCase()}
                  </span>
                </div>
              </div>
              <div class="seat-row__actions">
                <button
                  class="btn btn--sm btn--secondary"
                  onclick={() => handleGoToSeat(seat.id)}
                >
                  Go to Seat →
                </button>
                <button
                  class="btn btn--sm btn--danger"
                  onclick={() => handleDisconnectSeat(seat.id)}
                >
                  Disconnect
                </button>
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <!-- Controls -->
    <section class="detail-section detail-section--controls">
      <h2>Account Controls</h2>

      <!-- Reset password -->
      <div class="control-group">
        {#if passwordSuccess}
          <p class="success-message">✓ Password reset successfully.</p>
        {/if}

        {#if !showPasswordForm}
          <button
            class="btn btn--secondary"
            onclick={() => { showPasswordForm = true; passwordSuccess = false; }}
          >
            🔑 Reset Password
          </button>
        {:else}
          <form
            class="inline-form"
            onsubmit={(e) => { e.preventDefault(); handleResetPassword(); }}
          >
            <h3>Set New Password</h3>
            {#if passwordError}
              <p class="error-message" role="alert">{passwordError}</p>
            {/if}
            <div class="form-group">
              <label for="new-password-{accountId}">New password</label>
              <input
                id="new-password-{accountId}"
                type="password"
                bind:value={newPassword}
                placeholder="8+ characters"
                autocomplete="new-password"
              />
            </div>
            <div class="form-group">
              <label for="confirm-password-{accountId}">Confirm password</label>
              <input
                id="confirm-password-{accountId}"
                type="password"
                bind:value={passwordConfirm}
                placeholder="Repeat new password"
                autocomplete="new-password"
              />
            </div>
            <div class="form-actions">
              <button type="submit" class="btn btn--primary">Save</button>
              <button
                type="button"
                class="btn btn--secondary"
                onclick={() => { showPasswordForm = false; passwordError = null; newPassword = ''; passwordConfirm = ''; }}
              >
                Cancel
              </button>
            </div>
          </form>
        {/if}
      </div>

      <!-- Revoke sessions -->
      <div class="control-group">
        <button class="btn btn--secondary" onclick={handleRevokeSessions}>
          🔌 Revoke All Sessions
        </button>
        <p class="control-description">
          Immediately logs this account out of all devices.
        </p>
      </div>

      <!-- Remove account -->
      <div class="control-group control-group--danger">
        {#if !confirmRemove}
          <button class="btn btn--danger" onclick={handleRemoveAccount}>
            🗑 Remove Account
          </button>
        {:else}
          <p class="danger-warning">
            This will permanently delete the account and disconnect all its seats. Are you sure?
          </p>
          <div class="form-actions">
            <button class="btn btn--danger" onclick={handleRemoveAccount}>
              Yes, Remove
            </button>
            <button
              class="btn btn--secondary"
              onclick={() => { confirmRemove = false; }}
            >
              Cancel
            </button>
          </div>
        {/if}
      </div>
    </section>
  </div>
{/if}
