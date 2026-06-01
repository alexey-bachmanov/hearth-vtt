<script lang="ts">
/**
 * SeatSettings - View and manage a specific seat.
 *
 * Displays:
 * - Seat details (name, role, active status)
 * - Claimed-by account info with "Go to Account" cross-link
 * - List of invites for this seat
 * - Create/revoke invite actions
 * - Delete seat button
 *
 * TODO (Phase 5+): Replace mock handlers with real API calls:
 *   PATCH  /api/admin/campaigns/:id/seats/:seatId
 *   POST   /api/admin/invites  (per seat)
 *   DELETE /api/admin/invites/:token
 */

import { adminTree, type AdminSeat, type AdminInviteWithUrl } from '../../state/admin.svelte.js';

interface Props {
  seatId: string;
}

let { seatId }: Props = $props();

let seat = $derived<AdminSeat | undefined>(adminTree.getSeat(seatId));
let invites = $derived<AdminInviteWithUrl[]>(adminTree.getInvitesForSeat(seatId));
let claimedByAccount = $derived(adminTree.getAccountForSeat(seatId));

let isEditingName = $state(false);
let editedName = $state('');
let isEditingRole = $state(false);
let editedRole = $state<'gm' | 'player' | 'spectator'>('player');

$effect(() => {
  // Reset editing state when seat changes
  void seatId;
  isEditingName = false;
  editedName = '';
  isEditingRole = false;
});

function handleSaveName() {
  if (!editedName.trim()) return;
  const s = adminTree.seats.find((x) => x.id === seatId);
  if (s) s.displayName = editedName.trim();
  // TODO (Phase 5+): PATCH /api/admin/campaigns/:id/seats/:seatId
  console.log('[SeatSettings] Rename seat (mock):', editedName.trim());
  isEditingName = false;
}

function handleSaveRole() {
  const s = adminTree.seats.find((x) => x.id === seatId);
  if (s) s.role = editedRole;
  // TODO (Phase 5+): PATCH /api/admin/campaigns/:id/seats/:seatId
  console.log('[SeatSettings] Change role (mock):', editedRole);
  isEditingRole = false;
}

function handleToggleActive() {
  const s = adminTree.seats.find((x) => x.id === seatId);
  if (s) s.isActive = !s.isActive;
  // TODO (Phase 5+): PATCH /api/admin/campaigns/:id/seats/:seatId
  console.log('[SeatSettings] Toggle active (mock):', !seat?.isActive);
}

function handleCreateInvite() {
  const pin = prompt('Enter PIN for this invite (4-8 digits):');
  if (pin && pin.length >= 4) {
    // TODO (Phase 5+): POST /api/admin/invites
    console.log('[SeatSettings] Create invite (mock) for seat:', seatId);
  }
}

function handleRevokeInvite(invite: AdminInviteWithUrl) {
  if (confirm('Revoke this invite? Anyone with the link will no longer be able to use it.')) {
    // TODO (Phase 5+): DELETE /api/admin/invites/:token
    console.log('[SeatSettings] Revoke invite (mock):', invite.id);
  }
}

function handleCopyInviteUrl(url: string) {
  navigator.clipboard.writeText(url).catch(() => {
    alert('Could not copy to clipboard.');
  });
}

function handleDeleteSeat() {
  if (!seat) return;
  if (!confirm(`Delete seat "${seat.displayName}"? This will also revoke all invites and remove any active sessions. This cannot be undone.`)) {
    return;
  }
  // TODO (Phase 5+): DELETE /api/admin/campaigns/:id/seats/:seatId
  console.log('[SeatSettings] Delete seat (mock):', seatId);
  adminTree.navigateTo(seat.campaignId);
}

function isInviteExpired(invite: AdminInviteWithUrl): boolean {
  return new Date(invite.expiresAt) < new Date();
}

function isInviteActive(invite: AdminInviteWithUrl): boolean {
  return !invite.revokedAt && !isInviteExpired(invite) && invite.usesRemaining > 0;
}
</script>

{#if !seat}
  <div class="detail-empty"><p>Seat not found.</p></div>
{:else}
<div class="seat-settings">
  <div class="page-header">
    <button class="back-button" onclick={() => adminTree.navigateTo(seat!.campaignId)}>
      ← Campaign
    </button>
    <button class="btn btn--danger" onclick={handleDeleteSeat}>
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
            <button class="btn btn--sm btn--primary" onclick={handleSaveName}>Save</button>
            <button class="btn btn--sm btn--secondary" onclick={() => { isEditingName = false; editedName = seat?.displayName ?? ''; }}>
              Cancel
            </button>
          </div>
        {:else}
          <div class="display-field">
            <span>{seat.displayName}</span>
            <button class="btn-icon" onclick={() => { isEditingName = true; editedName = seat?.displayName ?? ''; }}>
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
            <button class="btn btn--sm btn--primary" onclick={handleSaveRole}>Save</button>
            <button class="btn btn--sm btn--secondary" onclick={() => { isEditingRole = false; }}>
              Cancel
            </button>
          </div>
        {:else}
          <div class="display-field">
            <span class="role-badge" class:gm={seat.role === 'gm'}>
              {seat.role.toUpperCase()}
            </span>
            <button class="btn-icon" onclick={() => { isEditingRole = true; editedRole = seat?.role ?? 'player'; }}>
              ✏️
            </button>
          </div>
        {/if}
      </div>
      
      <div class="detail-item">
        <span class="label">Status:</span>
        <div class="display-field">
          <span class="status-badge" class:status-badge--active={seat.isActive}>
            {seat.isActive ? '● Active' : '○ Inactive'}
          </span>
          <button class="btn btn--sm btn--secondary" onclick={handleToggleActive}>
            {seat.isActive ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      </div>
      
      <div class="detail-item">
        <span class="label">Created:</span>
        <span>{new Date(seat.createdAt).toLocaleString()}</span>
      </div>

      {#if claimedByAccount}
        <div class="detail-item">
          <span class="label">Claimed by:</span>
          <div class="display-field">
            <span>{claimedByAccount.username}</span>
            <button
              class="btn btn--sm btn--secondary"
              onclick={() => adminTree.navigateTo(claimedByAccount!.id)}
            >
              Go to Account →
            </button>
          </div>
        </div>
      {:else}
        <div class="detail-item">
          <span class="label">Claimed by:</span>
          <span class="text-muted">Unclaimed</span>
        </div>
      {/if}
    </div>
  </section>

  <!-- Invites -->
  <section class="settings-section">
    <div class="section-header">
      <h2>Invites</h2>
      <button class="btn btn--primary" onclick={handleCreateInvite}>
        ➕ Create Invite
      </button>
    </div>
    
    <div class="invites-list">
      {#if invites.length === 0}
        <div class="empty-state">
          <p>No invites yet. Create an invite to allow someone to claim this seat.</p>
        </div>
      {:else}
        {#each invites as invite (invite.id)}
          <div class="invite-card" class:invite-card--active={isInviteActive(invite)}>
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
                  <span class="status-dot status-dot--active"></span>
                  <span>Active</span>
                {/if}
              </div>
              
              <div class="invite-actions">
                {#if isInviteActive(invite)}
                  <button 
                    class="btn btn--sm btn--secondary"
                    onclick={() => handleCopyInviteUrl(invite.inviteUrl)}
                  >
                    📋 Copy URL
                  </button>
                  <button 
                    class="btn btn--sm btn--danger"
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
{/if}


<style>
  .seat-settings {
    max-width: var(--admin-content-max-width);
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
    background-color: var(--color-gm-badge);
    color: var(--color-text-inverse);
  }

  .status-badge {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
  }

  .status-badge--active {
    color: var(--color-success);
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

  .invite-card--active {
    opacity: 1;
    border-color: var(--color-success);
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

  .status-dot--active {
    background-color: var(--color-success);
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
</style>
