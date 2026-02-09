<script lang="ts">
/**
 * LightingDrawer component (GM only).
 *
 * Light source placement and editing tools.
 */
</script>

<div class="drawer__section-list">
  <div class="drawer__section">
    <h3 class="drawer__section-title">Light Sources</h3>
    <p class="help-text">Click tokens to toggle light emission, or place ambient lights on the map.</p>
  </div>

  <div class="drawer__section">
    <h3 class="drawer__section-title">Light Types</h3>
    <div class="btn-group">
      <button class="btn btn--sm">Torch</button>
      <button class="btn btn--sm">Lantern</button>
      <button class="btn btn--sm">Candle</button>
      <button class="btn btn--sm">Daylight</button>
    </div>
  </div>

  <div class="drawer__section">
    <h3 class="drawer__section-title">Ambient Light</h3>
    <label class="setting-label">
      <span>Brightness</span>
      <input type="range" min="0" max="100" value="50" class="slider" />
    </label>
    <label class="setting-label">
      <span>Color</span>
      <input type="color" value="#ffffff" style="width: 100%; height: 36px;" />
    </label>
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

  .setting-label {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    color: var(--color-text-primary);
  }

  .slider {
    width: 100%;
  }
</style>
