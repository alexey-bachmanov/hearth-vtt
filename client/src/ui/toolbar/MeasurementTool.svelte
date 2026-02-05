<script lang="ts">
/**
 * MeasurementTool - Distance measurement tool.
 * 
 * Toggle ruler mode for measuring distances on canvas.
 */

let isActive = $state<boolean>(false);

function toggleMeasurement() {
  isActive = !isActive;
  // TODO: Wire to renderer.setTool('ruler')
  console.log('Measurement tool:', isActive ? 'active' : 'inactive');
}
</script>

<button 
  class="measurement-button" 
  class:active={isActive}
  onclick={toggleMeasurement}
>
  📏 Measure
</button>

<style>
  .measurement-button {
    padding: var(--space-xs) var(--space-md);
    background-color: var(--color-bg-tertiary);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-sm);
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .measurement-button:hover {
    background-color: var(--color-bg-elevated);
    border-color: var(--color-accent-primary);
    color: var(--color-text-primary);
  }

  .measurement-button.active {
    background-color: var(--color-accent-primary);
    border-color: var(--color-accent-primary);
    color: white;
  }
</style>
