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
let loading = $state(false);
let error = $state<string | null>(null);

$effect(() => {
  // Reset editing state when seat changes
  void seatId;
  isEditingName = false;
  editedName = '';
  isEditingRole = false;
});

async function handleSaveName() {
  if (!editedName.trim() || !seat) return;
  loading = true;
  error = null;
  try {
    await adminTree.updateSeat(seat.campaignId, seatId, { displayName: editedName.trim() });
    isEditingName = false;
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to update seat';
  } finally {
    loading = false;
  }
}

async function handleSaveRole() {
  if (!seat) return;
  loading = true;
  error = null;
  try {
    await adminTree.updateSeat(seat.campaignId, seatId, { role: editedRole });
    isEditingRole = false;
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to update seat';
  } finally {
    loading = false;
  }
}

async function handleToggleActive() {
  if (!seat) return;
  loading = true;
  error = null;
  try {
    await adminTree.updateSeat(seat.campaignId, seatId, { isActive: !seat.isActive });
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to update seat';
  } finally {
    loading = false;
  }
}

async function handleCreateInvite() {
  if (!seat) return;
  const pin = prompt('Enter a PIN for this invite (4–8 digits):');
  if (!pin?.trim() || !/^\d{4,8}$/.test(pin.trim())) {
    if (pin !== null) alert('PIN must be 4–8 digits.');
    return;
  }
  loading = true;
  error = null;
  try {
    await adminTree.createInvite(seat.campaignId, {
      seatId,
      pin: pin.trim(),
      expiresIn: 7 * 24 * 60 * 60, // 7 days in seconds
      maxUses: 1,
    });
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to create invite';
  } finally {
    loading = false;
  }
}

async function handleRevokeInvite(invite: AdminInviteWithUrl) {
  if (!seat) return;
  if (!confirm('Revoke this invite? Anyone with the link will no longer be able to use it.')) return;
  loading = true;
  error = null;
  try {
    await adminTree.revokeInvite(seat.campaignId, invite.inviteToken);
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to revoke invite';
  } finally {
    loading = false;
  }
}

function handleCopyInviteUrl(url: string) {
  navigator.clipboard.writeText(url).catch(() => {
    alert('Could not copy to clipboard.');
  });
}

async function handleDeleteSeat() {
  if (!seat) return;
  if (!confirm(`Delete seat "${seat.displayName}"? This will also revoke all invites and remove any active sessions. This cannot be undone.`)) return;
  loading = true;
  error = null;
  const campaignId = seat.campaignId; // capture before seat becomes undefined
  try {
    await adminTree.deleteSeat(campaignId, seatId);
    adminTree.navigateTo(campaignId);
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to delete seat';
    loading = false;
  }
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
    <button class="btn btn--danger" onclick={handleDeleteSeat} disabled={loading}>
      🗑️ Delete Seat
    </button>
  </div>
  {#if error}
    <p class="error-message" role="alert">{error}</p>
  {/if}

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
            <button class="btn btn--sm btn--primary" onclick={handleSaveName} disabled={loading}>Save</button>
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
            <button class="btn btn--sm btn--primary" onclick={handleSaveRole} disabled={loading}>Save</button>
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
          <button class="btn btn--sm btn--secondary" onclick={handleToggleActive} disabled={loading}>
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
      <button class="btn btn--primary" onclick={handleCreateInvite} disabled={loading}>
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
                    disabled={loading}
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
