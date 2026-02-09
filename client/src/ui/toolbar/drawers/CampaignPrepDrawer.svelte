<script lang="ts">
/**
 * CampaignPrepDrawer component (GM only).
 *
 * Encounter setup and NPC staging area.
 */
</script>

<div class="drawer__section-list">
  <div class="drawer__section">
    <h3 class="drawer__section-title">Encounter Builder</h3>
    <p class="help-text">Prepare encounters before adding them to the active scene.</p>
  </div>

  <div class="drawer__section">
    <h3 class="drawer__section-title">Staging Area</h3>
    <p class="text--secondary">No actors in staging. Drag actors here to prepare encounters.</p>
  </div>

  <div class="drawer__section">
    <button class="btn btn--primary">Add to Scene</button>
    <button class="btn btn--sm">Clear Staging</button>
  </div>

  <div class="drawer__section">
    <h3 class="drawer__section-title">Quick Add</h3>
    <div class="btn-group">
      <button class="btn btn--sm">Random Encounter</button>
      <button class="btn btn--sm">Saved Encounter</button>
    </div>
  </div>
</div>

<style>
  .help-text {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    line-height: var(--line-height-relaxed);
  }

  .btn-group {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
  }
</style>
