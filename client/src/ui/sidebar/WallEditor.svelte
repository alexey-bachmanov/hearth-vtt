<script lang="ts">
/**
 * WallEditor - Wall/door/window drawing and editing tool.
 * 
 * GM tool for creating obstructions and visibility barriers.
 */
</script>

<div class="wall-editor">
  <div class="component-label">
    <strong>WallEditor</strong>
  </div>
  <p class="component-description">
    Draw and edit walls, windows, doors
  </p>
  <div class="placeholder-content">
    <div class="tool-group">
      <button class="tool-button">🧱 Draw Wall</button>
      <button class="tool-button">🪟 Add Window</button>
      <button class="tool-button">🚪 Add Door</button>
      <button class="tool-button">✏️ Edit Mode</button>
    </div>
  </div>
</div>

<style>
  .wall-editor {
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
