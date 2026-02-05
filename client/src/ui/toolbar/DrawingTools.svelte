<script lang="ts">
/**
 * DrawingTools - Freehand drawing controls.
 * 
 * Brush, eraser, shapes for canvas annotations.
 */

let activeTool = $state<'brush' | 'eraser' | 'rectangle' | 'circle' | null>(null);

function selectTool(tool: typeof activeTool) {
  activeTool = activeTool === tool ? null : tool;
}
</script>

<div class="drawing-tools">
  <button 
    class="tool-button" 
    class:active={activeTool === 'brush'}
    onclick={() => selectTool('brush')}
  >
    ✏️
  </button>
  <button 
    class="tool-button" 
    class:active={activeTool === 'eraser'}
    onclick={() => selectTool('eraser')}
  >
    🧹
  </button>
  <button 
    class="tool-button" 
    class:active={activeTool === 'rectangle'}
    onclick={() => selectTool('rectangle')}
  >
    ▭
  </button>
  <button 
    class="tool-button" 
    class:active={activeTool === 'circle'}
    onclick={() => selectTool('circle')}
  >
    ○
  </button>
</div>

<style>
  .drawing-tools {
    display: flex;
    gap: var(--space-xs);
  }

  .tool-button {
    padding: var(--space-xs) var(--space-sm);
    background-color: var(--color-bg-tertiary);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-sm);
    color: var(--color-text-secondary);
    font-size: var(--font-size-md);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .tool-button:hover {
    background-color: var(--color-bg-elevated);
    border-color: var(--color-accent-primary);
  }

  .tool-button.active {
    background-color: var(--color-accent-primary);
    border-color: var(--color-accent-primary);
    color: white;
  }
</style>
