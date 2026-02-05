<script lang="ts">
/**
 * InviteManager - Create, list, and revoke invites.
 * 
 * Shows invite URLs and allows generating new invites for seats.
 */

// Mock invite data - TODO: Wire to GET /api/invites
const invites = [
  {
    id: 'inv-1',
    token: 'abc123def456',
    seatId: 'seat-2',
    seatName: 'Player 1',
    status: 'active',
    expiresAt: '2026-02-15',
  },
  {
    id: 'inv-2',
    token: 'xyz789ghi012',
    seatId: 'seat-3',
    seatName: 'Player 2',
    status: 'claimed',
    expiresAt: '2026-02-10',
  },
];

let showCreateForm = $state(false);
let selectedSeatId = $state('seat-1');

function handleCreate() {
  console.log('Create invite for seat:', selectedSeatId);
  // TODO: Call POST /api/invites
  showCreateForm = false;
}

function handleCancel() {
  showCreateForm = false;
  selectedSeatId = 'seat-1';
}

function handleRevoke(inviteId: string) {
  console.log('Revoke invite:', inviteId);
  // TODO: Call DELETE /api/invites/:id
}

function copyInviteUrl(token: string) {
  const url = `${window.location.origin}/join/${token}`;
  navigator.clipboard.writeText(url);
  console.log('Copied invite URL:', url);
}
</script>

<div class="invite-manager">
  <div class="page-header">
    <h1>Invites</h1>
  </div>

  <div class="invites-table">
    <div class="table-header">
      <span>Seat</span>
      <span>Token</span>
      <span>Status</span>
      <span>Expires</span>
      <span>Actions</span>
    </div>
    {#each invites as invite (invite.id)}
      <div class="table-row">
        <span class="seat-name">{invite.seatName}</span>
        <span class="invite-token">
          <code>{invite.token.slice(0, 8)}...</code>
        </span>
        <span class="invite-status" class:active={invite.status === 'active'}>
          {invite.status}
        </span>
        <span class="invite-expires">{invite.expiresAt}</span>
        <div class="invite-actions">
          <button class="action-button" onclick={() => copyInviteUrl(invite.token)}>
            📋 Copy URL
          </button>
          {#if invite.status === 'active'}
            <button class="action-button danger" onclick={() => handleRevoke(invite.id)}>
              Revoke
            </button>
          {/if}
        </div>
      </div>
    {/each}

    <div class="table-row create-row" class:expanded={showCreateForm}>
      {#if showCreateForm}
        <div class="create-form">
          <h3>Create New Invite</h3>
          <div class="form-group">
            <span class="form-label">Select Seat</span>
            <select bind:value={selectedSeatId}>
              <option value="seat-1">GM Seat</option>
              <option value="seat-2">Player 1</option>
              <option value="seat-3">Player 2</option>
            </select>
          </div>
          <div class="create-actions">
            <button class="action-button" onclick={handleCancel}>Cancel</button>
            <button class="action-button primary" onclick={handleCreate}>Create</button>
          </div>
        </div>
      {:else}
        <button class="create-button" onclick={() => showCreateForm = true}>
          ➕ Create Invite
        </button>
      {/if}
    </div>
  </div>
</div>

<style>
  .invite-manager {
    max-width: 1200px;
  }

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-xl);
  }

  .page-header h1 {
    margin: 0;
    font-size: var(--font-size-3xl);
    font-weight: var(--font-weight-bold);
    color: var(--color-text-primary);
  }

  .create-button {
    padding: var(--space-sm) var(--space-lg);
    background-color: var(--color-accent-primary);
    border: none;
    border-radius: var(--radius-sm);
    color: white;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    cursor: pointer;
    transition: background-color var(--transition-fast);
  }

  .create-button:hover {
    background-color: var(--color-accent-hover);
  }

  .invites-table {
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  .table-header {
    display: grid;
    grid-template-columns: 1.5fr 1.5fr 1fr 1fr 2fr;
    gap: var(--space-md);
    padding: var(--space-md) var(--space-lg);
    background-color: var(--color-bg-tertiary);
    border-bottom: 1px solid var(--color-border-default);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-secondary);
  }

  .table-row {
    display: grid;
    grid-template-columns: 1.5fr 1.5fr 1fr 1fr 2fr;
    gap: var(--space-md);
    padding: var(--space-md) var(--space-lg);
    border-bottom: 1px solid var(--color-border-subtle);
    align-items: center;
  }

  .table-row:last-child {
    border-bottom: none;
  }

  .seat-name {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-primary);
  }

  .invite-token code {
    padding: var(--space-xs);
    background-color: var(--color-bg-elevated);
    border-radius: var(--radius-sm);
    font-family: monospace;
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
  }

  .invite-status {
    padding: var(--space-xs) var(--space-sm);
    background-color: var(--color-bg-elevated);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-tertiary);
    text-align: center;
  }

  .invite-status.active {
    background-color: var(--color-success);
    color: white;
  }

  .invite-expires {
    font-size: var(--font-size-sm);
    color: var(--color-text-tertiary);
  }

  .invite-actions {
    display: flex;
    gap: var(--space-sm);
  }

  .action-button {
    padding: var(--space-xs) var(--space-md);
    background-color: var(--color-bg-tertiary);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-sm);
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .action-button:hover {
    background-color: var(--color-bg-elevated);
    border-color: var(--color-accent-primary);
    color: var(--color-text-primary);
  }

  .action-button.danger {
    color: var(--color-danger);
  }

  .action-button.danger:hover {
    background-color: var(--color-danger);
    border-color: var(--color-danger);
    color: white;
  }

  .create-row {
    display: flex;
    flex-direction: column;
    padding: var(--space-lg);
    background-color: var(--color-bg-tertiary);
  }

  .create-row.expanded {
    background-color: var(--color-bg-secondary);
  }

  .create-button {
    padding: var(--space-sm) var(--space-lg);
    background-color: var(--color-accent-primary);
    border: none;
    border-radius: var(--radius-sm);
    color: white;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    cursor: pointer;
    transition: background-color var(--transition-fast);
  }

  .create-button:hover {
    background-color: var(--color-accent-hover);
  }

  .create-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .create-form h3 {
    margin: 0;
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .form-label {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-secondary);
  }

  .form-group select {
    padding: var(--space-sm);
    background-color: var(--color-bg-primary);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-sm);
    color: var(--color-text-primary);
    font-size: var(--font-size-sm);
  }

  .create-actions {
    display: flex;
    gap: var(--space-sm);
    justify-content: flex-end;
  }

  .action-button.primary {
    background-color: var(--color-accent-primary);
    border-color: var(--color-accent-primary);
    color: white;
  }

  .action-button.primary:hover {
    background-color: var(--color-accent-hover);
  }
</style>
