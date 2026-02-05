<script lang="ts">
  import { onMount } from 'svelte';

  interface Campaign {
    id: string;
    name: string;
    createdAt: number;
    updatedAt: number;
  }

  let connectionStatus = 'Connecting...';
  let serverVersion = '';
  let campaigns: Campaign[] = [];
  let newCampaignName = '';
  let loading = false;
  let error = '';

  async function loadCampaigns() {
    try {
      loading = true;
      error = '';
      const response = await fetch('/api/campaigns');
      if (!response.ok) {
        throw new Error('Failed to load campaigns');
      }
      const data = await response.json();
      campaigns = data.campaigns;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load campaigns';
      console.error('Failed to load campaigns:', e);
    } finally {
      loading = false;
    }
  }

  async function createCampaign() {
    if (!newCampaignName.trim()) return;

    try {
      loading = true;
      error = '';
      const response = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCampaignName.trim() }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to create campaign');
      }

      newCampaignName = '';
      await loadCampaigns();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to create campaign';
      console.error('Failed to create campaign:', e);
    } finally {
      loading = false;
    }
  }

  async function deleteCampaign(id: string) {
    if (!confirm('Are you sure you want to delete this campaign?')) {
      return;
    }

    try {
      loading = true;
      error = '';
      const response = await fetch(`/api/campaigns/${id}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete campaign');
      }

      await loadCampaigns();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to delete campaign';
      console.error('Failed to delete campaign:', e);
    } finally {
      loading = false;
    }
  }

  function formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleString();
  }

  onMount(() => {
    // WebSocket connection for realtime updates
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onopen = () => {
      connectionStatus = 'Connected';
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'welcome') {
          serverVersion = message.payload.version;
        }
      } catch (e) {
        console.error('Failed to parse message:', e);
      }
    };

    ws.onclose = () => {
      connectionStatus = 'Disconnected';
    };

    ws.onerror = () => {
      connectionStatus = 'Error';
    };

    // Load campaigns on mount
    loadCampaigns();

    return () => {
      ws.close();
    };
  });
</script>

<main>
  <div class="container">
    <h1>🔥 HearthVTT</h1>
    <p class="success">It worked!</p>
    
    <div class="status">
      <p>Connection: <span class="status-value">{connectionStatus}</span></p>
      {#if serverVersion}
        <p>Server version: <span class="status-value">{serverVersion}</span></p>
      {/if}
    </div>

    <div class="campaigns-section">
      <h2>Campaigns</h2>
      
      {#if error}
        <div class="error">{error}</div>
      {/if}

      <div class="create-campaign">
        <input
          type="text"
          bind:value={newCampaignName}
          placeholder="Campaign name"
          disabled={loading}
          on:keypress={(e) => e.key === 'Enter' && createCampaign()}
        />
        <button on:click={createCampaign} disabled={loading || !newCampaignName.trim()}>
          Create
        </button>
      </div>

      {#if loading && campaigns.length === 0}
        <p class="loading">Loading...</p>
      {:else if campaigns.length === 0}
        <p class="empty">No campaigns yet. Create one to get started!</p>
      {:else}
        <div class="campaigns-list">
          {#each campaigns as campaign}
            <div class="campaign-item">
              <div class="campaign-info">
                <h3>{campaign.name}</h3>
                <p class="campaign-meta">Created {formatDate(campaign.createdAt)}</p>
              </div>
              <button 
                class="delete-btn"
                on:click={() => deleteCampaign(campaign.id)}
                disabled={loading}
              >
                Delete
              </button>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</main>

<style>
  :global(body) {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen,
      Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
    background: #1a202c;
    color: #e2e8f0;
    min-height: 100vh;
  }

  main {
    padding: 2rem;
    max-width: 1200px;
    margin: 0 auto;
  }

  .container {
    text-align: center;
  }

  h1 {
    font-size: 3rem;
    margin-bottom: 1rem;
  }

  h2 {
    font-size: 1.8rem;
    margin: 2rem 0 1rem;
    color: #ed8936;
  }

  .success {
    font-size: 1.5rem;
    color: #68d391;
    margin-bottom: 2rem;
  }

  .status {
    background: #2d3748;
    padding: 1rem 2rem;
    border-radius: 8px;
    display: inline-block;
    margin-bottom: 2rem;
  }

  .status p {
    margin: 0.5rem 0;
  }

  .status-value {
    color: #ed8936;
    font-weight: bold;
  }

  .campaigns-section {
    background: #2d3748;
    padding: 2rem;
    border-radius: 8px;
    margin-top: 2rem;
  }

  .error {
    background: #fc8181;
    color: #1a202c;
    padding: 0.75rem;
    border-radius: 4px;
    margin-bottom: 1rem;
    font-weight: 500;
  }

  .create-campaign {
    display: flex;
    gap: 0.5rem;
    justify-content: center;
    margin-bottom: 2rem;
  }

  .create-campaign input {
    padding: 0.75rem 1rem;
    border: 2px solid #4a5568;
    border-radius: 4px;
    background: #1a202c;
    color: #e2e8f0;
    font-size: 1rem;
    min-width: 300px;
  }

  .create-campaign input:focus {
    outline: none;
    border-color: #ed8936;
  }

  .create-campaign input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .create-campaign button {
    padding: 0.75rem 2rem;
    background: #ed8936;
    color: #1a202c;
    border: none;
    border-radius: 4px;
    font-size: 1rem;
    font-weight: bold;
    cursor: pointer;
    transition: background 0.2s;
  }

  .create-campaign button:hover:not(:disabled) {
    background: #dd6b20;
  }

  .create-campaign button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .loading,
  .empty {
    color: #a0aec0;
    font-style: italic;
    padding: 2rem;
  }

  .campaigns-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .campaign-item {
    background: #1a202c;
    padding: 1.5rem;
    border-radius: 8px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    text-align: left;
  }

  .campaign-info h3 {
    margin: 0 0 0.5rem 0;
    color: #e2e8f0;
    font-size: 1.25rem;
  }

  .campaign-meta {
    margin: 0;
    color: #a0aec0;
    font-size: 0.875rem;
  }

  .delete-btn {
    padding: 0.5rem 1.5rem;
    background: #fc8181;
    color: #1a202c;
    border: none;
    border-radius: 4px;
    font-weight: bold;
    cursor: pointer;
    transition: background 0.2s;
  }

  .delete-btn:hover:not(:disabled) {
    background: #f56565;
  }

  .delete-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
