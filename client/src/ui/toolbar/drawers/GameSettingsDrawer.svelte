<script lang="ts">
/**
 * GameSettingsDrawer component (GM only).
 *
 * Campaign-level game settings and rules configuration.
 */
</script>

<div class="drawer-content">
  <div class="drawer-section">
    <h3 class="drawer-section__title">Game Rules</h3>
    <label class="setting-label">
      <span>Game System</span>
      <select class="form-select">
        <option>D&D 5e</option>
        <option>Pathfinder 2e</option>
        <option>Call of Cthulhu</option>
        <option>Custom</option>
      </select>
    </label>
  </div>

  <div class="drawer-section">
    <h3 class="drawer-section__title">House Rules</h3>
    <label class="setting-label checkbox-label">
      <input type="checkbox" />
      <span>Critical hit house rules</span>
    </label>
    <label class="setting-label checkbox-label">
      <input type="checkbox" checked />
      <span>Flanking advantage</span>
    </label>
    <label class="setting-label checkbox-label">
      <input type="checkbox" />
      <span>Death saves public</span>
    </label>
  </div>

  <div class="drawer-section">
    <h3 class="drawer-section__title">Difficulty</h3>
    <label class="setting-label">
      <span>Encounter Difficulty Multiplier</span>
      <input type="range" min="50" max="200" value="100" class="slider" />
      <span class="slider-value">100%</span>
    </label>
  </div>

  <div class="drawer-section">
    <button class="btn btn-primary">Save Settings</button>
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
    gap: var(--space-md);
  }

  .drawer-section__title {
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
    margin: 0;
  }

  .setting-label {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    color: var(--color-text-primary);
  }

  .checkbox-label {
    flex-direction: row;
    align-items: center;
    cursor: pointer;
  }

  .slider {
    width: 100%;
  }

  .slider-value {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }
</style>
