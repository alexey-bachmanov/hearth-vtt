<script lang="ts">
/**
 * SettingsDrawer component.
 *
 * Audio/video/UI preferences and configuration.
 */
</script>

<div class="drawer-content">
  <div class="drawer-section">
    <h3 class="drawer-section__title">Audio</h3>
    <label class="setting-label">
      <span>Master Volume</span>
      <input type="range" min="0" max="100" value="80" class="slider" />
    </label>
    <label class="setting-label checkbox-label">
      <input type="checkbox" checked />
      <span>Enable sound effects</span>
    </label>
  </div>

  <div class="drawer-section">
    <h3 class="drawer-section__title">Display</h3>
    <label class="setting-label checkbox-label">
      <input type="checkbox" checked />
      <span>Show grid</span>
    </label>
    <label class="setting-label checkbox-label">
      <input type="checkbox" />
      <span>Snap to grid</span>
    </label>
    <label class="setting-label checkbox-label">
      <input type="checkbox" checked />
      <span>Show token names</span>
    </label>
  </div>

  <div class="drawer-section">
    <h3 class="drawer-section__title">Accessibility</h3>
    <label class="setting-label checkbox-label">
      <input type="checkbox" />
      <span>High contrast mode</span>
    </label>
    <label class="setting-label checkbox-label">
      <input type="checkbox" />
      <span>Reduce animations</span>
    </label>
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
</style>
