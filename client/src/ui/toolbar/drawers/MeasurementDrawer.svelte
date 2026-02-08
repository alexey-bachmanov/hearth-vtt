<script lang="ts">
/**
 * MeasurementDrawer component.
 *
 * Distance measurement tool with mode selector and visibility toggle.
 */
</script>

<div class="drawer-content">
  <div class="drawer-section">
    <h3 class="drawer-section__title">Measurement Mode</h3>
    <div class="btn-group">
      <button class="btn btn-sm btn-primary">Straight Line</button>
      <button class="btn btn-sm">Path</button>
      <button class="btn btn-sm">Area</button>
    </div>
  </div>

  <div class="drawer-section">
    <h3 class="drawer-section__title">Visibility</h3>
    <label class="checkbox-label">
      <input type="checkbox" />
      <span>Show to all players</span>
    </label>
  </div>

  <div class="drawer-section">
    <h3 class="drawer-section__title">Units</h3>
    <select class="form-select">
      <option>Feet</option>
      <option>Meters</option>
      <option>Miles</option>
      <option>Grid Squares</option>
    </select>
  </div>

  <div class="drawer-section">
    <p class="help-text">
      Click on the canvas to start measuring. Click again to add waypoints,
      double-click to finish.
    </p>
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
