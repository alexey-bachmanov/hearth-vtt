<script lang="ts">
/**
 * AnnotationDrawer component.
 *
 * Drawing tools for canvas annotations (shapes, arrows, text).
 */
</script>

<div class="drawer__section-list">
  <div class="drawer__section">
    <h3 class="drawer__section-title">Shape</h3>
    <div class="btn-group">
      <button class="btn btn--sm">Line</button>
      <button class="btn btn--sm">Arrow</button>
      <button class="btn btn--sm">Rectangle</button>
      <button class="btn btn--sm">Circle</button>
      <button class="btn btn--sm">Text</button>
    </div>
  </div>

  <div class="drawer__section">
    <h3 class="drawer__section-title">Color</h3>
    <div class="color-palette">
      <button class="color-swatch" style="background: #f44336;" aria-label="Red"></button>
      <button class="color-swatch" style="background: #4caf50;" aria-label="Green"></button>
      <button class="color-swatch" style="background: #2196f3;" aria-label="Blue"></button>
      <button class="color-swatch" style="background: #ffeb3b;" aria-label="Yellow"></button>
      <button class="color-swatch" style="background: #9c27b0;" aria-label="Purple"></button>
      <button class="color-swatch" style="background: #ffffff;" aria-label="White"></button>
    </div>
  </div>

  <div class="drawer__section">
    <h3 class="drawer__section-title">Stroke Width</h3>
    <input type="range" min="1" max="10" value="3" class="slider" />
  </div>

  <div class="drawer__section">
    <button class="btn btn--danger">Clear All Annotations</button>
  </div>
</div>

<style>
  .btn-group {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
  }

  .color-palette {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: var(--space-sm);
  }

  .color-swatch {
    width: 36px;
    height: 36px;
    border: 2px solid var(--color-border-default);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: transform var(--transition-fast);
  }

  .color-swatch:hover {
    transform: scale(1.1);
    border-color: var(--color-accent-primary);
  }

  .slider {
    width: 100%;
  }
</style>
