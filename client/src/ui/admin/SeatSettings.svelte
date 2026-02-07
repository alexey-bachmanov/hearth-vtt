<script lang="ts">
/**
 * SeatSettings - View and manage a specific seat.
 * 
 * Displays:
 * - Seat details (name, role, permissions)
 * - List of invites for this seat
 * - Create/revoke invite actions
 * - Delete seat button
 */

interface Seat {
  id: string;
  campaignId: string;
  displayName: string;
  role: 'gm' | 'player' | 'spectator';
  isActive: boolean;
  createdAt: string;
}

interface Invite {
  id: string;
  seatId: string;
  inviteToken: string;
  inviteUrl: string;
  pinHash: string;
  maxUses: number;
  usesRemaining: number;
  expiresAt: string;
  createdAt: string;
  revokedAt: string | null;
}

interface Props {
  seatId: string;
  onBack: () => void;
}

let { seatId, onBack }: Props = $props();

// Mock seat data - in real app, loaded from API
let seat = $state<Seat>({
  id: seatId,
  campaignId: 'campaign-1',
  displayName: 'Player 1',
  role: 'player',
  isActive: true,
  createdAt: '2026-01-15T10:10:00Z',
});

let displayName = $state('Player 1');
let role = $state<'gm' | 'player' | 'spectator'>('player');
let isActive = $state(true);

// Mock invites data - in real app, loaded from API
let invites = $state<Invite[]>([
  {
    id: 'invite-1',
    seatId: 'seat-1',
    inviteToken: 'ABC123XYZ',
    inviteUrl: 'http://localhost:3000/join/ABC123XYZ',
    pinHash: 'hashed_pin',
    maxUses: 1,
    usesRemaining: 1,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: '2026-02-01T10:00:00Z',
    revokedAt: null,
  },
]);

let isEditingName = $state(false);
let editedName = $state('');

let isEditingRole = $state(false);
let editedRole = $state<'gm' | 'player' | 'spectator'>('player');

function handleSaveName() {
  if (editedName.trim()) {
    displayName = editedName.trim();
    console.log('Saving seat name:', displayName);
    // TODO: Call API to update seat name
  }
  isEditingName = false;
}

function handleSaveRole() {
  role = editedRole;
  console.log('Saving seat role:', role);
  // TODO: Call API to update seat role
  isEditingRole = false;
}

function handleToggleActive() {
  isActive = !isActive;
  console.log('Toggling seat active status:', isActive);
  // TODO: Call API to update seat status
}

function handleCreateInvite() {
  const pin = prompt('Enter PIN for this invite (4-8 characters):');
  if (pin && pin.length >= 4) {
    console.log('Creating invite with PIN');
    // TODO: Call API to create invite
  }
}

function handleRevokeInvite(invite: Invite) {
  if (confirm('Revoke this invite? Anyone with the link will no longer be able to use it.')) {
    console.log('Revoking invite:', invite.id);
    // TODO: Call API to revoke invite
  }
}

function handleCopyInviteUrl(url: string) {
  navigator.clipboard.writeText(url);
  alert('Invite URL copied to clipboard!');
}

function handleDeleteSeat() {
  if (confirm(`Delete seat "${displayName}"? This will also revoke all invites and remove any active sessions. This cannot be undone.`)) {
    console.log('Deleting seat:', seat.id);
    // TODO: Call API to delete seat
    onBack();
  }
}

function isInviteExpired(invite: Invite): boolean {
  return new Date(invite.expiresAt) < new Date();
}

function isInviteActive(invite: Invite): boolean {
  return !invite.revokedAt && !isInviteExpired(invite) && invite.usesRemaining > 0;
}
</script>

<div class="seat-settings">
  <div class="page-header">
    <button class="back-button" onclick={onBack}>← Back</button>
    <button class="btn btn-danger" onclick={handleDeleteSeat}>
      🗑️ Delete Seat
    </button>
  </div>

  <!-- Seat Details -->
  <section class="settings-section">
    <h2>Seat Details</h2>
    
    <div class="details-grid">
      <div class="detail-item">
        <span class="label">Display Name:</span>
        {#if isEditingName}
          <div class="edit-field">
            <input 
              type="text" 
              bind:value={editedName}
              onkeydown={(e) => e.key === 'Enter' && handleSaveName()}
            />
            <button class="btn btn-sm btn-primary" onclick={handleSaveName}>Save</button>
            <button class="btn btn-sm btn-secondary" onclick={() => { isEditingName = false; editedName = displayName; }}>
              Cancel
            </button>
          </div>
        {:else}
          <div class="display-field">
            <span>{displayName}</span>
            <button class="btn-icon" onclick={() => { isEditingName = true; editedName = displayName; }}>
              ✏️
            </button>
          </div>
        {/if}
      </div>
      
      <div class="detail-item">
        <span class="label">Role:</span>
        {#if isEditingRole}
          <div class="edit-field">
            <select bind:value={editedRole}>
              <option value="gm">GM</option>
              <option value="player">Player</option>
              <option value="spectator">Spectator</option>
            </select>
            <button class="btn btn-sm btn-primary" onclick={handleSaveRole}>Save</button>
            <button class="btn btn-sm btn-secondary" onclick={() => { isEditingRole = false; editedRole = role; }}>
              Cancel
            </button>
          </div>
        {:else}
          <div class="display-field">
            <span class="role-badge" class:gm={role === 'gm'}>
              {role.toUpperCase()}
            </span>
            <button class="btn-icon" onclick={() => { isEditingRole = true; editedRole = role; }}>
              ✏️
            </button>
          </div>
        {/if}
      </div>
      
      <div class="detail-item">
        <span class="label">Status:</span>
        <div class="display-field">
          <span class="status-badge" class:active={isActive}>
            {isActive ? '● Active' : '○ Inactive'}
          </span>
          <button class="btn btn-sm btn-secondary" onclick={handleToggleActive}>
            {isActive ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      </div>
      
      <div class="detail-item">
        <span class="label">Created:</span>
        <span>{new Date(seat.createdAt).toLocaleString()}</span>
      </div>
    </div>
  </section>

  <!-- Invites -->
  <section class="settings-section">
    <div class="section-header">
      <h2>Invites</h2>
      <button class="btn btn-primary" onclick={handleCreateInvite}>
        ➕ Create Invite
      </button>
    </div>
    
    <div class="invites-list">
      {#if invites.length === 0}
        <div class="empty-state">
          <p>No invites yet. Create an invite to allow someone to claim this seat.</p>
        </div>
      {:else}
        {#each invites as invite}
          <div class="invite-card" class:active={isInviteActive(invite)}>
            <div class="invite-header">
              <div class="invite-status-indicator">
                {#if invite.revokedAt}
                  <span class="status-dot revoked"></span>
                  <span>Revoked</span>
                {:else if isInviteExpired(invite)}
                  <span class="status-dot expired"></span>
                  <span>Expired</span>
                {:else if invite.usesRemaining === 0}
                  <span class="status-dot used"></span>
                  <span>Used</span>
                {:else}
                  <span class="status-dot active"></span>
                  <span>Active</span>
                {/if}
              </div>
              
              <div class="invite-actions">
                {#if isInviteActive(invite)}
                  <button 
                    class="btn btn-sm btn-secondary"
                    onclick={() => handleCopyInviteUrl(invite.inviteUrl)}
                  >
                    📋 Copy URL
                  </button>
                  <button 
                    class="btn btn-sm btn-danger"
                    onclick={() => handleRevokeInvite(invite)}
                  >
                    Revoke
                  </button>
                {/if}
              </div>
            </div>
            
            <div class="invite-details">
              <div class="invite-url">
                <code>{invite.inviteUrl}</code>
              </div>
              
              <div class="invite-meta">
                <span>Uses: {invite.usesRemaining} / {invite.maxUses}</span>
                <span>Expires: {new Date(invite.expiresAt).toLocaleString()}</span>
                <span>Created: {new Date(invite.createdAt).toLocaleString()}</span>
              </div>
            </div>
          </div>
        {/each}
      {/if}
    </div>
  </section>
</div>


<style>
  .seat-settings {
    max-width: 1200px;
  }

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-xl);
  }

  .settings-section h2 {
    margin: 0 0 var(--space-lg) 0;
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
  }

  .section-header h2 {
    margin: 0;
  }

  /* Field display and editing */
  .display-field {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .edit-field {
    display: flex;
    gap: var(--space-sm);
    align-items: center;
  }

  .edit-field input,
  .edit-field select {
    flex: 1;
    max-width: 300px;
    padding: var(--space-sm) var(--space-md);
    background-color: var(--color-bg-primary);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-sm);
    color: var(--color-text-primary);
    font-size: var(--font-size-md);
  }

  .edit-field input:focus,
  .edit-field select:focus {
    outline: none;
    border-color: var(--color-accent-primary);
  }

  /* Badges */
  .role-badge {
    padding: var(--space-xs) var(--space-sm);
    background-color: var(--color-bg-primary);
    border-radius: var(--radius-xs);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
  }

  .role-badge.gm {
    background-color: #ffd700;
    color: #000;
  }

  .status-badge {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
  }

  .status-badge.active {
    color: var(--color-success, #48bb78);
  }

  /* Invites section */
  .invites-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .invite-card {
    padding: var(--space-lg);
    background-color: var(--color-bg-tertiary);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-sm);
    opacity: 0.6;
  }

  .invite-card.active {
    opacity: 1;
    border-color: var(--color-success, #48bb78);
  }

  .invite-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-md);
  }

  .invite-status-indicator {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .status-dot.active {
    background-color: var(--color-success, #48bb78);
  }

  .status-dot.revoked,
  .status-dot.expired,
  .status-dot.used {
    background-color: var(--color-text-tertiary);
  }

  .invite-actions {
    display: flex;
    gap: var(--space-sm);
  }

  .invite-details {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .invite-url {
    padding: var(--space-sm);
    background-color: var(--color-bg-primary);
    border-radius: var(--radius-xs);
    overflow-x: auto;
  }

  .invite-url code {
    font-size: var(--font-size-sm);
    color: var(--color-text-primary);
    font-family: monospace;
  }

  .invite-meta {
    display: flex;
    gap: var(--space-lg);
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
  }

  .empty-state {
    padding: var(--space-2xl);
    text-align: center;
    color: var(--color-text-tertiary);
  }
</style>
