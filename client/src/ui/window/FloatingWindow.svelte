<script lang="ts">
/**
 * FloatingWindow - Generic draggable window shell.
 * 
 * Reusable window frame with title bar, close button, and content slot.
 */

interface Props {
  title: string;
  windowId: string;
  onClose?: () => void;
  children?: any;
}

let { title, windowId, onClose, children }: Props = $props();

// Dragging state
let isDragging = $state(false);
let position = $state({ x: 100, y: 100 });
let dragOffset = { x: 0, y: 0 };

function handleMouseDown(event: MouseEvent) {
  isDragging = true;
  dragOffset.x = event.clientX - position.x;
  dragOffset.y = event.clientY - position.y;
}

function handleMouseMove(event: MouseEvent) {
  if (isDragging) {
    position = {
      x: event.clientX - dragOffset.x,
      y: event.clientY - dragOffset.y,
    };
  }
}

function handleMouseUp() {
  isDragging = false;
}
</script>

<svelte:window 
  onmousemove={handleMouseMove} 
  onmouseup={handleMouseUp} 
/>

<div 
  class="floating-window" 
  class:dragging={isDragging}
  style="left: {position.x}px; top: {position.y}px;"
  data-window-id={windowId}
>
  <div class="window-header" role="button" tabindex="0" onmousedown={handleMouseDown}>
    <h4 class="window-title">{title}</h4>
    <button class="window-close" onclick={onClose}>✕</button>
  </div>
  
  <div class="window-body">
    {@render children?.()}
  </div>
</div>

<style>
  .floating-window {
    position: absolute;
    min-width: 320px;
    max-width: 600px;
    background-color: var(--color-bg-elevated);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-large);
    display: flex;
    flex-direction: column;
    pointer-events: auto;
  }

  .floating-window.dragging {
    cursor: move;
    user-select: none;
  }

  .window-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-sm) var(--space-md);
    background-color: var(--color-bg-tertiary);
    border-bottom: 1px solid var(--color-border-default);
    border-radius: var(--radius-md) var(--radius-md) 0 0;
    cursor: move;
  }

  .window-title {
    margin: 0;
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
  }

  .window-close {
    background: none;
    border: none;
    color: var(--color-text-tertiary);
    font-size: var(--font-size-lg);
    cursor: pointer;
    padding: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    transition: all var(--transition-fast);
  }

  .window-close:hover {
    background-color: var(--color-danger);
    color: white;
  }

  .window-body {
    padding: var(--space-md);
    overflow-y: auto;
    max-height: 600px;
  }
</style>
