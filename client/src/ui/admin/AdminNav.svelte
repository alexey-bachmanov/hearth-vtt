<script lang="ts">
/**
 * AdminNav - Navigation sidebar for admin sections.
 * 
 * Provides links to campaigns, seats, invites, and session management.
 */

interface Props {
  activeSection: 'campaigns' | 'campaign-detail' | 'seats' | 'invites' | 'sessions';
  onNavigate: (section: 'campaigns' | 'seats' | 'invites' | 'sessions') => void;
}

let { activeSection, onNavigate }: Props = $props();
</script>

<nav class="admin-nav">
  <div class="nav-header">
    <h2>HearthVTT Admin</h2>
  </div>
  
  <div class="nav-section">
    <h3>Campaign Management</h3>
    <button 
      class="nav-button" 
      class:active={activeSection === 'campaigns' || activeSection === 'campaign-detail'}
      onclick={() => onNavigate('campaigns')}
    >
      📁 Campaigns
    </button>
  </div>
  
  <div class="nav-section">
    <h3>Access Control</h3>
    <button 
      class="nav-button" 
      class:active={activeSection === 'seats'}
      onclick={() => onNavigate('seats')}
    >
      👥 Seats
    </button>
    <button 
      class="nav-button" 
      class:active={activeSection === 'invites'}
      onclick={() => onNavigate('invites')}
    >
      🎫 Invites
    </button>
    <button 
      class="nav-button" 
      class:active={activeSection === 'sessions'}
      onclick={() => onNavigate('sessions')}
    >
      🔐 Sessions
    </button>
  </div>
</nav>

<style>
  .admin-nav {
    display: flex;
    flex-direction: column;
    padding: var(--space-lg);
    gap: var(--space-lg);
  }

  .nav-header {
    padding-bottom: var(--space-md);
    border-bottom: 2px solid var(--color-border-default);
  }

  .nav-header h2 {
    margin: 0;
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-bold);
    color: var(--color-accent-primary);
  }

  .nav-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .nav-section h3 {
    margin: 0 0 var(--space-sm) 0;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .nav-button {
    width: 100%;
    padding: var(--space-sm) var(--space-md);
    background-color: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    text-align: left;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .nav-button:hover {
    background-color: var(--color-bg-tertiary);
    color: var(--color-text-primary);
  }

  .nav-button.active {
    background-color: var(--color-accent-primary);
    border-color: var(--color-accent-primary);
    color: white;
  }
</style>
