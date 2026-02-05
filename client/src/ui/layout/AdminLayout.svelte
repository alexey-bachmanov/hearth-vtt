<script lang="ts">
/**
 * AdminLayout - Campaign management interface.
 * 
 * Simpler layout than PlayLayout: navigation sidebar + main content area.
 * No canvas or complex zones - just admin tools.
 */

import AdminNav from '../admin/AdminNav.svelte';
import CampaignList from '../admin/CampaignList.svelte';
import CampaignDetail from '../admin/CampaignDetail.svelte';
import SeatManager from '../admin/SeatManager.svelte';
import InviteManager from '../admin/InviteManager.svelte';
import SessionAudit from '../admin/SessionAudit.svelte';

// Active admin section
let activeSection = $state<'campaigns' | 'campaign-detail' | 'seats' | 'invites' | 'sessions'>('campaigns');
let selectedCampaignId = $state<string | null>(null);

function handleNavigation(section: typeof activeSection, campaignId?: string) {
  activeSection = section;
  selectedCampaignId = campaignId || null;
}
</script>

<div class="admin-layout">
  <aside class="admin-sidebar">
    <AdminNav {activeSection} onNavigate={handleNavigation} />
  </aside>
  
  <main class="admin-content">
    {#if activeSection === 'campaigns'}
      <CampaignList onSelectCampaign={(id) => handleNavigation('campaign-detail', id)} />
    {:else if activeSection === 'campaign-detail' && selectedCampaignId}
      <CampaignDetail campaignId={selectedCampaignId} onBack={() => handleNavigation('campaigns')} />
    {:else if activeSection === 'seats'}
      <SeatManager />
    {:else if activeSection === 'invites'}
      <InviteManager />
    {:else if activeSection === 'sessions'}
      <SessionAudit />
    {/if}
  </main>
</div>

<style>
  .admin-layout {
    display: grid;
    grid-template-columns: var(--sidebar-left-width) 1fr;
    height: 100vh;
    background-color: var(--color-bg-primary);
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
