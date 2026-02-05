<script lang="ts">
/**
 * SeatManager - List, create, edit, and delete seats.
 * 
 * Manages player/GM seats for campaigns.
 */

// Mock seat data - TODO: Wire to GET /api/seats
const seats = [
  { id: 'seat-1', campaignId: 'camp-1', name: 'GM Seat', role: 'gm', isActive: true },
  { id: 'seat-2', campaignId: 'camp-1', name: 'Player 1', role: 'player', isActive: true },
  { id: 'seat-3', campaignId: 'camp-1', name: 'Player 2', role: 'player', isActive: false },
  { id: 'seat-4', campaignId: 'camp-2', name: 'DM Seat', role: 'gm', isActive: true },
];

let showCreateForm = $state(false);
let newSeatName = $state('');
let newSeatRole = $state<'gm' | 'player'>('player');

function handleCreate() {
  console.log('Create seat:', { name: newSeatName, role: newSeatRole });
  // TODO: Call POST /api/seats
  showCreateForm = false;
  newSeatName = '';
  newSeatRole = 'player';
}

function handleCancel() {
  showCreateForm = false;
  newSeatName = '';
  newSeatRole = 'player';
}

function handleDelete(seatId: string) {
  console.log('Delete seat:', seatId);
  // TODO: Call DELETE /api/seats/:id
}
</script>

<div class="seat-manager">
  <div class="page-header">
    <h1>Seats</h1>
  </div>

  <div class="seats-table">
    <div class="table-header">
      <span>Name</span>
      <span>Role</span>
      <span>Status</span>
      <span>Actions</span>
    </div>
    {#each seats as seat (seat.id)}
      <div class="table-row">
        <span class="seat-name">{seat.name}</span>
        <span class="seat-role" class:gm={seat.role === 'gm'}>{seat.role.toUpperCase()}</span>
        <span class="seat-status" class:active={seat.isActive}>
          {seat.isActive ? '✓ Active' : '○ Inactive'}
        </span>
        <div class="seat-actions">
          <button class="action-button">Edit</button>
          <button class="action-button danger" onclick={() => handleDelete(seat.id)}>Delete</button>
        </div>
      </div>
    {/each}

    <div class="table-row create-row" class:expanded={showCreateForm}>
      {#if showCreateForm}
        <div class="create-form">
          <h3>Create New Seat</h3>
          <div class="form-group">
            <span class="form-label">Seat Name</span>
            <input type="text" placeholder="e.g., Player 3" bind:value={newSeatName} />
          </div>
          <div class="form-group">
            <span class="form-label">Role</span>
            <select bind:value={newSeatRole}>
              <option value="player">Player</option>
              <option value="gm">GM</option>
            </select>
          </div>
          <div class="create-actions">
            <button class="action-button" onclick={handleCancel}>Cancel</button>
            <button class="action-button primary" onclick={handleCreate}>Create</button>
          </div>
        </div>
      {:else}
        <button class="create-button" onclick={() => showCreateForm = true}>
          ➕ Create Seat
        </button>
      {/if}
    </div>
  </div>
</div>

<style>
  .seat-manager {
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

  .seats-table {
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  .table-header {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr 2fr;
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
    grid-template-columns: 2fr 1fr 1fr 2fr;
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

  .seat-role {
    padding: var(--space-xs) var(--space-sm);
    background-color: var(--color-bg-elevated);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-secondary);
    text-align: center;
  }

  .seat-role.gm {
    background-color: var(--color-gm-highlight);
    color: white;
  }

  .seat-status {
    font-size: var(--font-size-sm);
    color: var(--color-text-tertiary);
  }

  .seat-status.active {
    color: var(--color-success);
  }

  .seat-actions {
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

  .form-group input,
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
