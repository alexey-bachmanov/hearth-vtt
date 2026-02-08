<script lang="ts">
/**
 * InitiativeDrawer component.
 *
 * Turn order tracker with initiative list and controls.
 */
</script>

<div class="drawer-content">
  <div class="drawer-section">
    <div class="initiative-header">
      <h3 class="drawer-section__title">Initiative Order</h3>
      <button class="btn btn-sm">Start Combat</button>
    </div>
  </div>

  <div class="drawer-section">
    <div class="initiative-list">
      <p class="text-secondary">No combat active. Start combat to track initiative.</p>
    </div>
  </div>

  <div class="drawer-section">
    <button class="btn btn-sm">Add Combatant</button>
    <button class="btn btn-sm">Roll All Initiative</button>
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

  .initiative-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .initiative-list {
    min-height: 200px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .text-secondary {
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    text-align: center;
  }
</style>
