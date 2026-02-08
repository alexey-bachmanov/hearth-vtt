<script lang="ts">
/**
 * CampaignPrepDrawer component (GM only).
 *
 * Encounter setup and NPC staging area.
 */
</script>

<div class="drawer-content">
  <div class="drawer-section">
    <h3 class="drawer-section__title">Encounter Builder</h3>
    <p class="help-text">Prepare encounters before adding them to the active scene.</p>
  </div>

  <div class="drawer-section">
    <h3 class="drawer-section__title">Staging Area</h3>
    <p class="text-secondary">No actors in staging. Drag actors here to prepare encounters.</p>
  </div>

  <div class="drawer-section">
    <button class="btn btn-primary">Add to Scene</button>
    <button class="btn btn-sm">Clear Staging</button>
  </div>

  <div class="drawer-section">
    <h3 class="drawer-section__title">Quick Add</h3>
    <div class="btn-group">
      <button class="btn btn-sm">Random Encounter</button>
      <button class="btn btn-sm">Saved Encounter</button>
    </div>
  </div>
</div>

<style>
  .drawer-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .drawer-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .drawer-section__title {
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
    margin: 0;
  }

  .help-text {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    line-height: var(--line-height-relaxed);
  }

  .text-secondary {
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    font-style: italic;
  }

  .btn-group {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
  }
</style>
