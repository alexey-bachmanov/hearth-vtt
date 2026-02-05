<script lang="ts">
/**
 * CampaignList - List, create, and delete campaigns.
 * 
 * Shows all campaigns with actions to open details or delete.
 */

interface Props {
  onSelectCampaign: (campaignId: string) => void;
}

let { onSelectCampaign }: Props = $props();

// Mock campaign data - TODO: Wire to API
const campaigns = [
  { id: 'camp-1', name: 'Dragon Heist', playerCount: 4, createdAt: '2026-01-15' },
  { id: 'camp-2', name: 'Tomb of Annihilation', playerCount: 5, createdAt: '2026-02-01' },
  { id: 'camp-3', name: 'Test Campaign', playerCount: 1, createdAt: '2026-02-04' },
];

let showCreateForm = $state(false);
let newCampaignName = $state('');

function handleCreate() {
  console.log('Create campaign:', newCampaignName);
  // TODO: Call POST /api/campaigns
  showCreateForm = false;
  newCampaignName = '';
}

function handleCancel() {
  showCreateForm = false;
  newCampaignName = '';
}

function handleDelete(campaignId: string) {
  console.log('Delete campaign:', campaignId);
  // TODO: Call DELETE /api/campaigns/:id
}
</script>

<div class="campaign-list">
  <div class="page-header">
    <h1>Campaigns</h1>
  </div>

  <div class="campaigns-grid">
    {#each campaigns as campaign (campaign.id)}
      <div class="campaign-card">
        <div class="campaign-info">
          <h3>{campaign.name}</h3>
          <div class="campaign-meta">
            <span>👥 {campaign.playerCount} players</span>
            <span>📅 {campaign.createdAt}</span>
          </div>
        </div>
        <div class="campaign-actions">
          <button class="action-button" onclick={() => onSelectCampaign(campaign.id)}>
            Open
          </button>
          <button class="action-button danger" onclick={() => handleDelete(campaign.id)}>
            Delete
          </button>
        </div>
      </div>
    {/each}

    <div class="create-card" class:expanded={showCreateForm}>
      {#if showCreateForm}
        <h3>Create New Campaign</h3>
        <input 
          type="text" 
          placeholder="Campaign name" 
          bind:value={newCampaignName}
        />
        <div class="create-actions">
          <button class="action-button" onclick={handleCancel}>Cancel</button>
          <button class="action-button primary" onclick={handleCreate}>Create</button>
        </div>
      {:else}
        <button class="create-button" onclick={() => showCreateForm = true}>
          ➕ Create Campaign
        </button>
      {/if}
    </div>
  </div>
</div>

<style>
  .campaign-list {
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

  .campaigns-grid {
    display: grid;
    gap: var(--space-md);
  }

  .campaign-card {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-lg);
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-md);
    transition: all var(--transition-fast);
  }

  .campaign-card:hover {
    border-color: var(--color-accent-primary);
    box-shadow: var(--shadow-medium);
  }

  .campaign-info h3 {
    margin: 0 0 var(--space-xs) 0;
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
  }

  .campaign-meta {
    display: flex;
    gap: var(--space-md);
    font-size: var(--font-size-sm);
    color: var(--color-text-tertiary);
  }

  .campaign-actions {
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

  .create-card {
    display: flex;
    flex-direction: column;
    padding: var(--space-lg);
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-md);
    transition: all var(--transition-fast);
  }

  .create-card.expanded {
    border-color: var(--color-accent-primary);
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

  .create-card h3 {
    margin: 0 0 var(--space-md) 0;
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
  }

  .create-card input {
    width: 100%;
    padding: var(--space-sm);
    background-color: var(--color-bg-primary);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-sm);
    color: var(--color-text-primary);
    font-size: var(--font-size-sm);
    margin-bottom: var(--space-md);
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
