<script lang="ts">
/**
 * InitiativeDrawer component.
 *
 * Turn order tracker with initiative list and controls.
 */
</script>

<div class="drawer__section-list">
  <div class="drawer__section">
    <div class="initiative-header">
      <h3 class="drawer__section-title">Initiative Order</h3>
      <button class="btn btn--sm">Start Combat</button>
    </div>
  </div>

  <div class="drawer__section">
    <div class="initiative-list">
      <p class="text--secondary">No combat active. Start combat to track initiative.</p>
    </div>
  </div>

  <div class="drawer__section">
    <button class="btn btn--sm">Add Combatant</button>
    <button class="btn btn--sm">Roll All Initiative</button>
  </div>
</div>

<style>
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
</style>
