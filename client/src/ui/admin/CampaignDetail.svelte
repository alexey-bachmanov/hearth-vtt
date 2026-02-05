<script lang="ts">
/**
 * CampaignDetail - View and edit single campaign settings.
 * 
 * TODO: Implement campaign detail view.
 */

interface Props {
  campaignId: string;
  onBack: () => void;
}

let { campaignId, onBack }: Props = $props();
</script>

<div class="campaign-detail">
  <div class="page-header">
    <button class="back-button" onclick={onBack}>← Back to Campaigns</button>
  </div>

  <div class="detail-card">
    <h1>Campaign Detail</h1>
    <p>Campaign ID: {campaignId}</p>
  </div>
</div>

<style>
  .campaign-detail {
    max-width: 1000px;
  }

  .page-header {
    margin-bottom: var(--space-lg);
  }

  .back-button {
    padding: var(--space-sm) var(--space-md);
    background-color: transparent;
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-sm);
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .back-button:hover {
    background-color: var(--color-bg-tertiary);
    color: var(--color-text-primary);
  }

  .detail-card {
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-md);
    padding: var(--space-xl);
  }

  .detail-card h1 {
    margin: 0 0 var(--space-md) 0;
    font-size: var(--font-size-2xl);
    font-weight: var(--font-weight-bold);
    color: var(--color-text-primary);
  }

  .detail-card p {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--color-text-tertiary);
  }
</style>
