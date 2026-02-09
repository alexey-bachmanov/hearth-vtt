<script lang="ts">
/**
 * MeasurementDrawer component.
 *
 * Distance measurement tool with mode selector and visibility toggle.
 */
</script>

<div class="drawer__section-list">
  <div class="drawer__section">
    <h3 class="drawer__section-title">Measurement Mode</h3>
    <div class="btn-group">
      <button class="btn btn--sm btn--primary">Straight Line</button>
      <button class="btn btn--sm">Path</button>
      <button class="btn btn--sm">Area</button>
    </div>
  </div>

  <div class="drawer__section">
    <h3 class="drawer__section-title">Visibility</h3>
    <label class="checkbox-label">
      <input type="checkbox" />
      <span>Show to all players</span>
    </label>
  </div>

  <div class="drawer__section">
    <h3 class="drawer__section-title">Units</h3>
    <select class="form-select">
      <option>Feet</option>
      <option>Meters</option>
      <option>Miles</option>
      <option>Grid Squares</option>
    </select>
  </div>

  <div class="drawer__section">
    <p class="help-text">
      Click on the canvas to start measuring. Click again to add waypoints,
      double-click to finish.
    </p>
  </div>
</div>

<style>
  .btn-group {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    cursor: pointer;
  }

  .help-text {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    line-height: var(--line-height-relaxed);
  }
</style>
