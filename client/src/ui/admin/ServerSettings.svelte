<script lang="ts">
/**
 * ServerSettings - Server-level admin interface.
 *
 * Displays:
 * - Server information (version, data directory)
 * - Campaign list with create/import actions
 * - Admin password change form
 *
 * Navigation to campaigns happens via adminTree.navigateTo().
 *
 * TODO (Phase 5+): Load server info and campaigns from API.
 *   GET /api/admin/status  — server info
 *   GET /api/admin/campaigns — campaign list
 */

import { adminTree, adminAuth, adminFetch, type AdminCampaign } from '../../state/admin.svelte.js';
import { navigate } from '../../app/routes.js';

// Mock server info
let serverInfo = $state({
  version: '0.1.0',
  dataDir: './data',
  uptime: '2 hours 34 minutes',
});

// Use campaigns from the shared store so they stay in sync with the tree
let campaigns = $derived(adminTree.campaigns);

// Per-panel mutation state
let loading = $state(false);
let error = $state<string | null>(null);

// Password change form
let passwordForm = $state({
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
  showForm: false,
  error: '',
  submitting: false,
});

async function handleCreateCampaign() {
  const name = prompt('Enter campaign name:');
  if (!name?.trim()) return;
  loading = true;
  error = null;
  try {
    await adminTree.createCampaign(name.trim());
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to create campaign';
  } finally {
    loading = false;
  }
}

async function handleDeleteCampaign(campaign: AdminCampaign) {
  if (!confirm(`Delete campaign "${campaign.name}"? This cannot be undone.`)) return;
  loading = true;
  error = null;
  try {
    await adminTree.deleteCampaign(campaign.id);
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to delete campaign';
  } finally {
    loading = false;
  }
}

function handleImportCampaign() {
  console.log('Import campaign dialog');
  // TODO: Show file picker and import
}

function handleExportCampaign(campaign: AdminCampaign) {
  console.log('Exporting campaign:', campaign.id);
  // TODO: Trigger campaign export download
}

async function handleChangePassword() {
  passwordForm.error = '';

  if (passwordForm.newPassword !== passwordForm.confirmPassword) {
    passwordForm.error = 'New passwords do not match';
    return;
  }

  if (passwordForm.newPassword.length < 8) {
    passwordForm.error = 'Password must be at least 8 characters';
    return;
  }

  passwordForm.submitting = true;
  try {
    const res = await adminFetch('/api/admin/change-password', {
      method: 'POST',
      body: JSON.stringify({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    if (res.status === 204) {
      // All sessions revoked server-side; clear local state and force re-login.
      adminAuth.clearCsrfToken();
      navigate('/admin/login');
      return;
    }

    const data = await res.json();
    passwordForm.error = data?.error?.message ?? 'Password change failed';
  } catch {
    passwordForm.error = 'Network error. Please try again.';
  } finally {
    passwordForm.submitting = false;
    passwordForm.currentPassword = '';
    passwordForm.newPassword = '';
    passwordForm.confirmPassword = '';
  }
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
        <button class="btn btn--secondary" onclick={handleImportCampaign} disabled={loading}>
          📥 Import
        </button>
        <button class="btn btn--primary" onclick={handleCreateCampaign} disabled={loading}>
          ➕ Create Campaign
        </button>
      </div>
    </div>
    {#if error}
      <p class="error-message" role="alert">{error}</p>
    {/if}
    
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
              onclick={() => adminTree.navigateTo(campaign.id)}
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
                disabled={loading}
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
          {#if passwordForm.error}
            <p class="form-error" role="alert">{passwordForm.error}</p>
          {/if}
          <button type="submit" class="btn btn--primary" disabled={passwordForm.submitting}>
            {passwordForm.submitting ? 'Updating…' : 'Update Password'}
          </button>
          <button 
            type="button" 
            class="btn btn--secondary"
            disabled={passwordForm.submitting}
            onclick={() => {
              passwordForm.showForm = false;
              passwordForm.currentPassword = '';
              passwordForm.newPassword = '';
              passwordForm.confirmPassword = '';
              passwordForm.error = '';
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
