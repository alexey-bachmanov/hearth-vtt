<script lang="ts">
/**
 * ObstructionDrawer component (GM only).
 *
 * Wall, door, and window placement tools for line-of-sight.
 */
</script>

<div class="drawer__section-list">
  <div class="drawer__section">
    <h3 class="drawer__section-title">Obstruction Type</h3>
    <div class="btn-group">
      <button class="btn btn--sm btn--primary">Wall</button>
      <button class="btn btn--sm">Door</button>
      <button class="btn btn--sm">Window</button>
    </div>
  </div>

  <div class="drawer__section">
    <h3 class="drawer__section-title">Properties</h3>
    <label class="setting-label checkbox-label">
      <input type="checkbox" checked />
      <span>Blocks movement</span>
    </label>
    <label class="setting-label checkbox-label">
      <input type="checkbox" checked />
      <span>Blocks light</span>
    </label>
    <label class="setting-label checkbox-label">
      <input type="checkbox" checked />
      <span>Blocks vision</span>
    </label>
  </div>

  <div class="drawer__section">
    <p class="help-text">
      Click to place wall segments. Double-click to finish. Right-click existing
      walls to edit or delete.
    </p>
  </div>

  <div class="drawer__section">
    <button class="btn btn--danger">Clear All Walls</button>
  </div>
</div>

<style>
  .btn-group {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
  }

  .setting-label {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    color: var(--color-text-primary);
  }

  .checkbox-label {
    cursor: pointer;
  }

  .help-text {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    line-height: var(--line-height-relaxed);
  }
</style>
