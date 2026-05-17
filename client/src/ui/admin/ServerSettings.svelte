<script lang="ts">
/**
 * ServerSettings - Server-level admin interface.
 * 
 * Displays:
 * - Server information (version, data directory)
 * - Campaign list with create/delete/import/export actions
 * - Admin password change form
 */

interface Campaign {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  onSelectCampaign: (campaignId: string) => void;
}

let { onSelectCampaign }: Props = $props();

// Mock server info - in real app, loaded from API
let serverInfo = $state({
  version: '0.1.0',
  dataDir: './data',
  uptime: '2 hours 34 minutes',
});

// Mock campaigns - in real app, loaded from API
let campaigns = $state<Campaign[]>([
  {
    id: 'campaign-1',
    name: 'Lost Mines of Phandelver',
    createdAt: '2026-01-15T10:00:00Z',
    updatedAt: '2026-02-01T14:30:00Z',
  },
  {
    id: 'campaign-2',
    name: 'Curse of Strahd',
    createdAt: '2026-01-20T09:00:00Z',
    updatedAt: '2026-02-03T16:45:00Z',
  },
]);

// Password change form
let passwordForm = $state({
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
  showForm: false,
});

function handleCreateCampaign() {
  const name = prompt('Enter campaign name:');
  if (name) {
    console.log('Creating campaign:', name);
    // TODO: Call API to create campaign
  }
}

function handleDeleteCampaign(campaign: Campaign) {
  if (confirm(`Delete campaign "${campaign.name}"? This cannot be undone.`)) {
    console.log('Deleting campaign:', campaign.id);
    // TODO: Call API to delete campaign
  }
}

function handleImportCampaign() {
  console.log('Import campaign dialog');
  // TODO: Show file picker and import
}

function handleExportCampaign(campaign: Campaign) {
  console.log('Exporting campaign:', campaign.id);
  // TODO: Trigger campaign export download
}

function handleChangePassword() {
  if (passwordForm.newPassword !== passwordForm.confirmPassword) {
    alert('New passwords do not match');
    return;
  }
  
  if (passwordForm.newPassword.length < 8) {
    alert('Password must be at least 8 characters');
    return;
  }
  
  console.log('Changing password');
  // TODO: Call API to change password
  
  // Reset form
  passwordForm.currentPassword = '';
  passwordForm.newPassword = '';
  passwordForm.confirmPassword = '';
  passwordForm.showForm = false;
}
</script>

<div class="server-settings">
  <header class="settings-header">
    <h1>Server Settings</h1>
  </header>
  
  <!-- Server Information -->
  <section class="settings-section">
    <h2>Server Information</h2>
    <div class="info-grid">
      <div class="info-item">
        <span class="info-label">Version:</span>
        <span class="info-value">{serverInfo.version}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Data Directory:</span>
        <span class="info-value">{serverInfo.dataDir}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Uptime:</span>
        <span class="info-value">{serverInfo.uptime}</span>
      </div>
    </div>
  </section>
  
  <!-- Campaign Management -->
  <section class="settings-section">
    <div class="section-header">
      <h2>Campaigns</h2>
      <div class="section-actions">
        <button class="btn btn--secondary" onclick={handleImportCampaign}>
          📥 Import
        </button>
        <button class="btn btn--primary" onclick={handleCreateCampaign}>
          ➕ Create Campaign
        </button>
      </div>
    </div>
    
    <div class="campaign-list">
      {#if campaigns.length === 0}
        <div class="empty-state">
          <p>No campaigns yet. Create your first campaign to get started.</p>
        </div>
      {:else}
        {#each campaigns as campaign (campaign.id)}
          <div class="campaign-card">
            <button 
              class="campaign-name"
              onclick={() => onSelectCampaign(campaign.id)}
            >
              📁 {campaign.name}
            </button>
            <div class="campaign-meta">
              <span>Created: {new Date(campaign.createdAt).toLocaleDateString()}</span>
              <span>Updated: {new Date(campaign.updatedAt).toLocaleDateString()}</span>
            </div>
            <div class="campaign-actions">
              <button 
                class="btn btn--sm btn--secondary"
                onclick={() => handleExportCampaign(campaign)}
              >
                📤 Export
              </button>
              <button 
                class="btn btn--sm btn--danger"
                onclick={() => handleDeleteCampaign(campaign)}
              >
                🗑️ Delete
              </button>
            </div>
          </div>
        {/each}
      {/if}
    </div>
  </section>
  
  <!-- Admin Password Management -->
  <section class="settings-section">
    <h2>Admin Password</h2>
    
    {#if !passwordForm.showForm}
      <button 
        class="btn btn--secondary"
        onclick={() => passwordForm.showForm = true}
      >
        🔒 Change Password
      </button>
    {:else}
      <form class="password-form" onsubmit={(e) => { e.preventDefault(); handleChangePassword(); }}>
        <div class="form-group">
          <label for="current-password">Current Password</label>
          <input 
            id="current-password"
            type="password" 
            bind:value={passwordForm.currentPassword}
            placeholder="Enter current password"
            required
          />
        </div>
        
        <div class="form-group">
          <label for="new-password">New Password</label>
          <input 
            id="new-password"
            type="password" 
            bind:value={passwordForm.newPassword}
            placeholder="Enter new password (min 8 characters)"
            required
            minlength="8"
          />
        </div>
        
        <div class="form-group">
          <label for="confirm-password">Confirm New Password</label>
          <input 
            id="confirm-password"
            type="password" 
            bind:value={passwordForm.confirmPassword}
            placeholder="Confirm new password"
            required
          />
        </div>
        
        <div class="form-actions">
          <button type="submit" class="btn btn--primary">
            Update Password
          </button>
          <button 
            type="button" 
            class="btn btn--secondary"
            onclick={() => {
              passwordForm.showForm = false;
              passwordForm.currentPassword = '';
              passwordForm.newPassword = '';
              passwordForm.confirmPassword = '';
            }}
          >
            Cancel
          </button>
        </div>
      </form>
    {/if}
  </section>
</div>


<style>
  .server-settings {
    max-width: var(--admin-content-max-width);
  }

  .settings-header {
    margin-bottom: var(--space-xl);
  }

  .settings-header h1 {
    margin: 0;
    font-size: var(--font-size-2xl);
    font-weight: var(--font-weight-bold);
    color: var(--color-text-primary);
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

  .section-actions {
    display: flex;
    gap: var(--space-sm);
  }

  /* Server Info Grid */
  .info-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: var(--space-md);
  }

  .info-item {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .info-label {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-tertiary);
  }

  .info-value {
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-primary);
    font-family: monospace;
  }

  /* Campaign List */
  .campaign-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .campaign-card {
    padding: var(--space-lg);
    background-color: var(--color-bg-tertiary);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-sm);
    transition: border-color var(--transition-fast);
  }

  .campaign-card:hover {
    border-color: var(--color-accent-primary);
  }

  .campaign-name {
    width: 100%;
    padding: 0;
    margin-bottom: var(--space-sm);
    background: none;
    border: none;
    color: var(--color-text-primary);
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
    text-align: left;
    cursor: pointer;
    transition: color var(--transition-fast);
  }

  .campaign-name:hover {
    color: var(--color-accent-primary);
  }

  .campaign-meta {
    display: flex;
    gap: var(--space-lg);
    margin-bottom: var(--space-md);
    font-size: var(--font-size-sm);
    color: var(--color-text-tertiary);
  }

  .campaign-actions {
    display: flex;
    gap: var(--space-sm);
  }

  /* Password Form */
  .password-form {
    max-width: 500px;
  }

  .form-actions {
    display: flex;
    gap: var(--space-sm);
  }
</style>
