<script lang="ts">
/**
 * SettingsDrawer - Campaign and user settings.
 * 
 * Configure audio, video, UI preferences, and game rules.
 */
</script>

<div class="settings-drawer">
  <div class="component-label">
    <strong>SettingsDrawer</strong>
  </div>
  <p class="component-description">
    Audio, video, UI, and game settings
  </p>
  <div class="placeholder-content">
    <div class="settings-group">
      <h4>Audio</h4>
      <label>
        <input type="checkbox" checked /> Enable sound effects
      </label>
      <label>
        <input type="checkbox" checked /> Enable music
      </label>
    </div>
    
    <div class="settings-group">
      <h4>Video</h4>
      <label>
        <input type="checkbox" checked /> Enable animations
      </label>
      <label>
        <input type="checkbox" /> High quality lighting
      </label>
    </div>
    
    <div class="settings-group">
      <h4>UI</h4>
      <label>
        <input type="checkbox" checked /> Show grid
      </label>
      <label>
        <input type="checkbox" /> Compact mode
      </label>
    </div>
  </div>
</div>

<style>
  .settings-drawer {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .component-label strong {
    color: var(--color-text-primary);
    font-size: var(--font-size-md);
  }

  .component-description {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--color-text-tertiary);
  }

  .placeholder-content {
    margin-top: var(--space-md);
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .settings-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .settings-group h4 {
    margin: 0;
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
    border-bottom: 1px solid var(--color-border-subtle);
    padding-bottom: var(--space-xs);
  }

  label {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    cursor: pointer;
  }

  label:hover {
    color: var(--color-text-primary);
  }

  input[type="checkbox"] {
    width: 16px;
    height: 16px;
    cursor: pointer;
  }
</style>
