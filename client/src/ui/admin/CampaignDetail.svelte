<script lang="ts">
/**
 * CampaignDetail - View and edit single campaign settings.
 *
 * Displays:
 * - Campaign metadata (name, created date, updated date)
 * - Attached tomes/ruleset
 * - Import/export buttons
 * - List of seats with create button
 *
 * Navigation is handled via adminTree.navigateTo() — no prop callbacks needed.
 */

import { adminTree, type MockCampaign, type MockSeat } from '../../state/admin.svelte.js';

interface Props {
  campaignId: string;
}

let { campaignId }: Props = $props();

// Derive from the shared store so edits in the store reflect here
let campaign = $derived<MockCampaign | undefined>(adminTree.getCampaign(campaignId));
let seats = $derived<MockSeat[]>(adminTree.getSeatsForCampaign(campaignId));

// Ruleset is still mock; no API endpoint for this yet.
const ruleset = {
  name: 'D&D 5th Edition',
  version: '2024',
  tomes: ["Player's Handbook", "Dungeon Master's Guide"],
};

let isEditingName = $state(false);
let editedName = $state('');

function handleSaveName() {
  if (!editedName.trim() || !campaign) return;
  // TODO (Phase 6+): call PATCH /api/admin/campaigns/:id
  console.log('[CampaignDetail] Rename campaign (mock):', editedName.trim());
  const c = adminTree.campaigns.find((x) => x.id === campaignId);
  if (c) c.name = editedName.trim();
  isEditingName = false;
}

function handleCreateSeat() {
  const name = prompt('Enter seat name:');
  if (!name) return;
  // TODO (Phase 6+): call POST /api/admin/campaigns/:id/seats
  console.log('[CampaignDetail] Create seat (mock):', name);
}

function handleExportCampaign() {
  // TODO (Phase 11): trigger .campaign export download
  console.log('[CampaignDetail] Export campaign (mock):', campaignId);
}

function handleImportData() {
  // TODO (Phase 11): show file picker and import
  console.log('[CampaignDetail] Import data (mock):', campaignId);
}
</script>

<div class="campaign-detail">
  {#if !campaign}
    <div class="detail-empty"><p>Campaign not found.</p></div>
  {:else}
    <div class="page-header">
      <button class="back-button" onclick={() => adminTree.navigateTo('campaigns')}>← Campaigns</button>
    </div>

    <!-- Campaign Metadata -->
    <section class="detail-section">
      <div class="section-header">
        <h2>Campaign Details</h2>
        <div class="section-actions">
          <button class="btn btn--secondary" onclick={handleImportData}>
            📥 Import Data
          </button>
          <button class="btn btn--secondary" onclick={handleExportCampaign}>
            📤 Export Campaign
          </button>
        </div>
      </div>
    
    <div class="metadata-grid">
      <div class="metadata-item">
        <span class="label">Name:</span>
        {#if isEditingName}
          <div class="edit-name">
            <input 
              type="text" 
              bind:value={editedName}
              onkeydown={(e) => e.key === 'Enter' && handleSaveName()}
            />
            <button class="btn btn--sm btn--primary" onclick={handleSaveName}>Save</button>
            <button class="btn btn--sm btn--secondary" onclick={() => { isEditingName = false; editedName = campaign?.name ?? ''; }}>
              Cancel
            </button>
          </div>
        {:else}
          <div class="display-name">
            <span>{campaign.name}</span>
            <button class="btn-icon" onclick={() => { isEditingName = true; editedName = campaign?.name ?? ''; }}>
              ✏️
            </button>
          </div>
        {/if}
      </div>
      
      <div class="metadata-item">
        <span class="label">Created:</span>
        <span>{new Date(campaign.createdAt).toLocaleString()}</span>
      </div>
      
      <div class="metadata-item">
        <span class="label">Last Updated:</span>
        <span>{new Date(campaign.updatedAt).toLocaleString()}</span>
      </div>
    </div>
  </section>

  <!-- Ruleset & Tomes -->
  <section class="detail-section">
    <h2>Ruleset & Content</h2>
    
    <div class="ruleset-info">
      <div class="info-item">
        <span class="label">Ruleset:</span>
        <span>{ruleset.name} ({ruleset.version})</span>
      </div>
      
      <div class="info-item">
        <span class="label">Attached Tomes:</span>
        <ul class="tome-list">
          {#each ruleset.tomes as tome (tome)}
            <li>{tome}</li>
          {/each}
        </ul>
      </div>
    </div>
  </section>

  <!-- Seats -->
  <section class="detail-section">
    <div class="section-header">
      <h2>Seats</h2>
      <button class="btn btn--primary" onclick={handleCreateSeat}>
        ➕ Create Seat
      </button>
    </div>
    
    <div class="seats-grid">
      {#if seats.length === 0}
        <div class="empty-state">
          <p>No seats yet. Create a seat to allow players to join this campaign.</p>
        </div>
      {:else}
        {#each seats as seat (seat.id)}
          <button 
            class="seat-card"
            onclick={() => adminTree.navigateTo(seat.id)}
          >
            <div class="seat-header">
              <span class="seat-icon">
                {seat.role === 'gm' ? '👑' : seat.role === 'player' ? '👤' : '👁️'}
              </span>
              <span class="seat-name">{seat.displayName}</span>
            </div>
            <div class="seat-meta">
              <span class="seat-role">{seat.role.toUpperCase()}</span>
              <span class="seat-status" class:seat-status--active={seat.isActive}>
                {seat.isActive ? '● Active' : '○ Inactive'}
              </span>
            </div>
          </button>
        {/each}
      {/if}
    </div>
  </section>
  {/if}
</div>


<style>
  .campaign-detail {
    max-width: var(--admin-content-max-width);
  }

  .page-header {
    margin-bottom: var(--space-xl);
  }

  .detail-section h2 {
    margin: 0 0 var(--space-lg) 0;
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
  }

  .section-actions {
    display: flex;
    gap: var(--space-sm);
  }

  /* Name editing */
  .display-name {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .display-name span {
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
  }

  .edit-name {
    display: flex;
    gap: var(--space-sm);
    align-items: center;
  }

  .edit-name input {
    flex: 1;
    max-width: 400px;
    padding: var(--space-sm) var(--space-md);
    background-color: var(--color-bg-primary);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-sm);
    color: var(--color-text-primary);
    font-size: var(--font-size-md);
  }

  .edit-name input:focus {
    outline: none;
    border-color: var(--color-accent-primary);
  }

  /* Ruleset section */
  .ruleset-info {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .info-item {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .info-item .label {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-tertiary);
  }

  .info-item span {
    font-size: var(--font-size-md);
    color: var(--color-text-primary);
  }

  .tome-list {
    margin: 0;
    padding-left: var(--space-lg);
    list-style-type: disc;
  }

  .tome-list li {
    margin-bottom: var(--space-xs);
    font-size: var(--font-size-md);
    color: var(--color-text-primary);
  }

  /* Seats grid */
  .seats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: var(--space-md);
  }

  .seat-card {
    padding: var(--space-lg);
    background-color: var(--color-bg-tertiary);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all var(--transition-fast);
    text-align: left;
  }

  .seat-card:hover {
    border-color: var(--color-accent-primary);
    transform: translateY(-2px);
  }

  .seat-header {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin-bottom: var(--space-md);
  }

  .seat-icon {
    font-size: var(--font-size-xl);
  }

  .seat-name {
    flex: 1;
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
  }

  .seat-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .seat-role {
    padding: var(--space-xs) var(--space-sm);
    background-color: var(--color-bg-primary);
    border-radius: var(--radius-xs);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-secondary);
  }

  .seat-status {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
  }

  .seat-status--active {
    color: var(--color-success);
  }

  .seats-grid .empty-state {
    grid-column: 1 / -1;
  }
</style>
