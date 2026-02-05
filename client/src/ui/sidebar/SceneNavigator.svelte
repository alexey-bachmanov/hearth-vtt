<script lang="ts">
/**
 * SceneNavigator - Scene/map directory tree and player movement controls.
 * 
 * GM tool for managing scenes and moving players between maps.
 */
</script>

<div class="scene-navigator">
  <div class="component-label">
    <strong>SceneNavigator</strong>
  </div>
  <p class="component-description">
    Scene directory tree, player movement controls
  </p>
  <div class="placeholder-content">
    <div class="scene-tree">
      <div class="scene-item">📁 Campaign Scenes</div>
      <div class="scene-item scene-child">🗺️ Tavern (Active)</div>
      <div class="scene-item scene-child">🗺️ Forest Path</div>
      <div class="scene-item scene-child">🗺️ Dragon's Lair</div>
    </div>
  </div>
</div>

<style>
  .scene-navigator {
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

  .scene-tree {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .scene-item {
    padding: var(--space-sm);
    background-color: var(--color-bg-tertiary);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .scene-child {
    margin-left: var(--space-lg);
  }
</style>
