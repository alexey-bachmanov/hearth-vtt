<script lang="ts">
/**
 * AdminLayout - Campaign management interface.
 *
 * Tree-based navigation: Settings | Campaigns → Seats | Accounts
 * Left panel: AdminTree for hierarchical navigation
 * Main area: Detail panel based on selected node
 *
 * Tree state (selected node, expanded nodes) lives in `adminTree`
 * (client/src/state/admin.svelte.ts). All navigation — including
 * cross-links between branches — goes through `adminTree.navigateTo()`.
 *
 * Security:
 * - Checks authentication on mount
 * - Redirects to /admin/setup if server needs setup
 * - Redirects to /admin/login if not authenticated
 */

import { onMount } from 'svelte';
import { navigate } from '../../app/routes';
import { adminAuth, adminTree, adminFetch } from '../../state/admin.svelte';
import { api } from '../../api/http.js';
import AdminTree from '../admin/AdminTree.svelte';
import ServerSettings from '../admin/ServerSettings.svelte';
import CampaignDetail from '../admin/CampaignDetail.svelte';
import SeatSettings from '../admin/SeatSettings.svelte';
import AccountDetail from '../admin/AccountDetail.svelte';
import '../../styles/components-admin.css';

let isCheckingAuth = $state(true);
let isAuthenticated = $state(false);

// Derive selected node info reactively from the store
let selectedId = $derived(adminTree.selectedId);
let selectedType = $derived(adminTree.selectedNodeType);

async function handleLogout() {
  try {
    await adminFetch('/api/admin/logout', { method: 'POST' });
  } catch (error) {
    console.error('Logout request failed:', error);
  } finally {
    adminAuth.clearCsrfToken();
    navigate('/admin/login');
  }
}

onMount(async () => {
  try {
    const data = await api.adminAuth.checkAuth();
    if (data.needsSetup) { navigate('/admin/setup'); return; }
    if (!data.authenticated) { navigate('/admin/login'); return; }
    if (data.csrfToken) adminAuth.setCsrfToken(data.csrfToken);
    isAuthenticated = true;
    await adminTree.load();
  } catch {
    navigate('/admin/error');
  } finally {
    isCheckingAuth = false;
  }
});
</script>

<div class="admin-layout">
  {#if isCheckingAuth}
    <div class="loading-overlay">
      <div class="spinner"></div>
      <p>Checking authentication...</p>
    </div>
  {:else if isAuthenticated}
    <aside class="admin-sidebar">
      <div class="sidebar-header">
        <h2 class="sidebar-title">HearthVTT Admin</h2>
        <button class="logout-button" onclick={handleLogout} title="Logout">
          <span class="logout-icon">↪</span>
          <span>Logout</span>
        </button>
      </div>
      <AdminTree />
    </aside>

    <main class="admin-content">
      {#if adminTree.loading}
        <div class="content-loading">
          <div class="spinner"></div>
          <p>Loading admin data…</p>
        </div>
      {:else if adminTree.error}
        <div class="content-error" role="alert">
          <p>⚠️ {adminTree.error}</p>
          <button class="btn btn--secondary" onclick={() => adminTree.load()}>Retry</button>
        </div>
      {:else if selectedType === 'settings' || selectedId === 'settings'}
        <ServerSettings />
      {:else if selectedType === 'campaign' && selectedId !== 'campaigns'}
        <CampaignDetail campaignId={selectedId} />
      {:else if selectedType === 'seat'}
        <SeatSettings seatId={selectedId} />
      {:else if selectedType === 'account' && selectedId !== 'accounts'}
        <AccountDetail accountId={selectedId} />
      {:else if selectedId === 'accounts'}
        <div class="accounts-list-panel">
          <header class="settings-header">
            <h1>Player Accounts</h1>
          </header>
          {#if adminTree.accounts.length === 0}
            <p class="branch-hint-text">No player accounts yet.</p>
          {:else}
            <ul class="account-list">
              {#each adminTree.accounts as account (account.id)}
                <li>
                  <button
                    class="account-list-btn"
                    onclick={() => adminTree.navigateTo(account.id)}
                  >
                    <span>👤 {account.username}</span>
                    <span class="text-muted">{account.seatCount} seat{account.seatCount !== 1 ? 's' : ''}</span>
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      {:else}
        <!-- Other branch nodes (Campaigns root) -->
        <div class="branch-hint">
          <p>Select an item in the tree to view details.</p>
        </div>
      {/if}
    </main>
  {/if}
</div>

<style>
.admin-layout {
  display: grid;
  grid-template-columns: var(--sidebar-left-width) 1fr;
  height: 100vh;
  background-color: var(--color-bg-primary);
}

.loading-overlay {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  grid-column: 1 / -1;
  background-color: var(--color-bg-primary);
  color: var(--color-text-secondary);
  gap: var(--space-md);
}

.loading-overlay p {
  margin: 0;
  font-size: var(--font-size-md);
}

.admin-sidebar {
  background-color: var(--color-bg-secondary);
  border-right: 1px solid var(--color-border-default);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-md) var(--space-lg);
  border-bottom: 1px solid var(--color-border-default);
  background-color: var(--color-bg-tertiary);
  flex-shrink: 0;
}

.sidebar-title {
  margin: 0;
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.logout-button {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-xs) var(--space-sm);
  background-color: transparent;
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition: var(--transition-fast);
}

.logout-button:hover {
  background-color: var(--color-bg-hover);
  border-color: var(--color-border-hover);
  color: var(--color-text-primary);
}

.logout-icon {
  font-size: var(--font-size-md);
}

.admin-content {
  overflow-y: auto;
  padding: var(--space-xl);
}

.branch-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--color-text-tertiary);
  font-size: var(--font-size-md);
}

.content-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: var(--space-md);
  color: var(--color-text-secondary);
}

.content-loading p {
  margin: 0;
}

.content-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: var(--space-md);
  color: var(--color-text-secondary);
}

.content-error p {
  margin: 0;
}

.accounts-list-panel {
  max-width: var(--admin-content-max-width);
}

.settings-header h1 {
  margin: 0 0 var(--space-xl) 0;
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.account-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.account-list-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: var(--space-md) var(--space-lg);
  background-color: var(--color-bg-secondary);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-md);
  color: var(--color-text-primary);
  font-size: var(--font-size-md);
  cursor: pointer;
  text-align: left;
  transition: var(--transition-fast);
}

.account-list-btn:hover {
  background-color: var(--color-bg-hover);
  border-color: var(--color-border-hover);
}

.branch-hint-text {
  color: var(--color-text-tertiary);
  margin: 0;
}
</style>
