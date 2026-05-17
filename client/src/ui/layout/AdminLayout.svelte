<script lang="ts">
/**
 * AdminLayout - Campaign management interface.
 *
 * Tree-based navigation: Server → Campaigns → Seats
 * Left panel: AdminTree for hierarchical navigation
 * Main area: Detail component based on selected node type
 *
 * Security:
 * - Checks authentication on mount
 * - Redirects to /admin/setup if server needs setup
 * - Redirects to /admin/login if not authenticated
 */

import { onMount } from 'svelte';
import { navigate } from '../../app/routes';
import { adminAuth, adminFetch } from '../../state/admin.svelte';
import AdminTree from '../admin/AdminTree.svelte';
import ServerSettings from '../admin/ServerSettings.svelte';
import CampaignDetail from '../admin/CampaignDetail.svelte';
import SeatSettings from '../admin/SeatSettings.svelte';

// Selected node state
type NodeType = 'server' | 'campaign' | 'seat';

let selectedNodeId = $state<string>('server');
let selectedNodeType = $state<NodeType>('server');
let isCheckingAuth = $state(true);
let isAuthenticated = $state(false);

/**
 * Check if user is authenticated and if setup is needed.
 * Redirects to setup or login page if necessary.
 */
async function checkAuth() {
  try {
    const response = await fetch('/api/admin/check-auth', {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      // Network error or server issue - throw an error to trigger catch block
      throw new Error(`Server responded with status ${response.status}`);
    }

    const data = await response.json();

    if (data.needsSetup) {
      // Server needs initial setup
      navigate('/admin/setup');
      return;
    }

    if (!data.authenticated) {
      // User not authenticated
      navigate('/admin/login');
      return;
    }

    // User is authenticated, show admin UI
    isAuthenticated = true;
  } catch {
    // Network error - redirect to error page
    navigate('/admin/error');
  } finally {
    isCheckingAuth = false;
  }
}

function handleSelectNode(nodeId: string, nodeType: NodeType) {
  selectedNodeId = nodeId;
  selectedNodeType = nodeType;
}

function handleSelectCampaignFromServer(campaignId: string) {
  handleSelectNode(campaignId, 'campaign');
}

function handleSelectSeatFromCampaign(seatId: string) {
  handleSelectNode(seatId, 'seat');
}

function handleBackToServer() {
  handleSelectNode('server', 'server');
}

function handleBackToCampaign(campaignId: string) {
  handleSelectNode(campaignId, 'campaign');
}

/**
 * Logout user by calling logout API and redirecting to login page.
 */
async function handleLogout() {
  try {
    await adminFetch('/api/admin/logout', {
      method: 'POST',
    });
  } catch (error) {
    // Even if logout fails, redirect to login
    console.error('Logout request failed:', error);
  } finally {
    // Clear CSRF token and redirect to login
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
        <h2 class="sidebar-title">Admin Panel</h2>
        <button class="logout-button" onclick={handleLogout} title="Logout">
          <span class="logout-icon">↪</span>
          <span>Logout</span>
        </button>
      </div>
      <AdminTree {selectedNodeId} onSelectNode={handleSelectNode} />
    </aside>

    <main class="admin-content">
      {#if selectedNodeType === 'server'}
        <ServerSettings onSelectCampaign={handleSelectCampaignFromServer} />
      {:else if selectedNodeType === 'campaign'}
        <CampaignDetail
          campaignId={selectedNodeId}
          onBack={handleBackToServer}
          onSelectSeat={handleSelectSeatFromCampaign}
        />
      {:else if selectedNodeType === 'seat'}
        <SeatSettings
          seatId={selectedNodeId}
          onBack={() => handleBackToCampaign('campaign-1')}
        />
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
  background-color: var(--color-bg-primary);
  color: var(--color-text-secondary);
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
}

.sidebar-title {
  margin: 0;
  font-size: var(--font-size-lg);
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
</style>
