<script lang="ts">
/**
 * LightEditor - Light source placement and configuration.
 * 
 * GM tool for placing and configuring dynamic lights.
 */
</script>

<div class="light-editor">
  <div class="component-label">
    <strong>LightEditor</strong>
  </div>
  <p class="component-description">
    Place and configure light sources
  </p>
  <div class="placeholder-content">
    <div class="tool-group">
      <button class="tool-button">💡 Point Light</button>
      <button class="tool-button">🔦 Spotlight</button>
      <button class="tool-button">🌙 Ambient Light</button>
      <button class="tool-button">🎨 Color Picker</button>
    </div>
  </div>
</div>

<style>
  .light-editor {
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
  }

  .tool-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .tool-button {
    padding: var(--space-sm) var(--space-md);
    background-color: var(--color-bg-tertiary);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-sm);
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    text-align: left;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .tool-button:hover {
    background-color: var(--color-bg-elevated);
    border-color: var(--color-accent-primary);
    color: var(--color-text-primary);
  }
</style>
