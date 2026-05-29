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

async function checkAuth() {
  try {
    const response = await fetch('/api/admin/check-auth', {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`Server responded with status ${response.status}`);
    }

    const data = await response.json();

    if (data.needsSetup) {
      navigate('/admin/setup');
      return;
    }

    if (!data.authenticated) {
      navigate('/admin/login');
      return;
    }

    isAuthenticated = true;
  } catch {
    navigate('/admin/error');
  } finally {
    isCheckingAuth = false;
  }
}

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

onMount(() => {
  checkAuth();
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
      {#if selectedType === 'settings' || selectedId === 'settings'}
        <ServerSettings />
      {:else if selectedType === 'campaign' && selectedId !== 'campaigns'}
        <CampaignDetail campaignId={selectedId} />
      {:else if selectedType === 'seat'}
        <SeatSettings seatId={selectedId} />
      {:else if selectedType === 'account' && selectedId !== 'accounts'}
        <AccountDetail accountId={selectedId} />
      {:else}
        <!-- Branch node selected (Campaigns / Accounts root) — show a hint -->
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
</style>
