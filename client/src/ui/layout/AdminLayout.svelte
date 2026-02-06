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
      // Network error or server issue - redirect to login
      navigate('/admin/login');
      return;
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
  } catch (error) {
    // Network error - redirect to login
    navigate('/admin/login');
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
      <AdminTree 
        {selectedNodeId} 
        onSelectNode={handleSelectNode}
      />
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

  .spinner {
    width: 40px;
    height: 40px;
    margin-bottom: var(--space-md);
    border: 3px solid var(--color-border-default);
    border-top-color: var(--color-accent-primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .loading-overlay p {
    margin: 0;
    font-size: var(--font-size-md);
  }

  .admin-sidebar {
    background-color: var(--color-bg-secondary);
    border-right: 1px solid var(--color-border-default);
    overflow-y: auto;
  }

  .admin-content {
    overflow-y: auto;
    padding: var(--space-xl);
  }
</style>
