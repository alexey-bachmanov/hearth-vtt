<script lang="ts">
/**
 * SettingsDrawer component.
 *
 * Audio/video/UI preferences and configuration.
 */
</script>

<div class="drawer__section-list">
  <div class="drawer__section">
    <h3 class="drawer__section-title">Audio</h3>
    <label class="setting-label">
      <span>Master Volume</span>
      <input type="range" min="0" max="100" value="80" class="slider" />
    </label>
    <label class="setting-label checkbox-label">
      <input type="checkbox" checked />
      <span>Enable sound effects</span>
    </label>
  </div>

  <div class="drawer__section">
    <h3 class="drawer__section-title">Display</h3>
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

  <div class="drawer__section">
    <h3 class="drawer__section-title">Accessibility</h3>
    <label class="setting-label checkbox-label">
      <input type="checkbox" />
      <span>High contrast mode</span>
    </label>
    <label class="setting-label checkbox-label">
      <input type="checkbox" />
      <span>Reduce animations</span>
    </label>
  </div>

  <div class="drawer__section">
    <h3 class="drawer__section-title">Account</h3>
    <a
      href="/play/account"
      target="_blank"
      rel="noopener noreferrer"
      class="account-settings-link"
    >
      Account Settings ↗
    </a>
  </div>
</div>

<style>
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

  .account-settings-link {
    display: inline-block;
    color: var(--color-text-primary);
    text-decoration: underline;
    font-size: var(--font-size-sm, 0.875rem);
  }

  .account-settings-link:hover {
    color: var(--color-accent, #7c6fff);
  }
</style>
