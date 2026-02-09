<script lang="ts">
/**
 * MainCanvas - WebGL rendering canvas wrapper.
 * 
 * Contains the <canvas> element that will be used by the WebGL renderer.
 * For now, displays a placeholder message. Future: bind to Renderer.
 */

import { onMount } from 'svelte';
import { renderer } from '../../render';

let canvasElement: HTMLCanvasElement;

onMount(() => {
  // Future: Initialize renderer with canvas
  // renderer.init(canvasElement);
  console.log('Canvas mounted', canvasElement, renderer);
  
  return () => {
    // Future: Cleanup renderer
    // renderer.dispose();
  };
});
</script>

<div class="main-canvas-container">
  <canvas bind:this={canvasElement} class="main-canvas"></canvas>
  <div class="canvas-overlay">
    <div class="canvas-placeholder">
      <div class="canvas-icon">🗺️</div>
      <h2>WebGL Canvas</h2>
      <p>Not Initialized</p>
      <p class="canvas-hint">Map, tokens, fog, and lighting will render here</p>
    </div>
  </div>
</div>

<style>
  .main-canvas-container {
    position: relative;
    width: 100%;
    height: 100%;
    background-color: var(--color-canvas-bg);
    overflow: hidden;
  }

  .main-canvas {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
  }

  .canvas-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }

  .canvas-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-2xl);
    background-color: var(--color-overlay-dark);
    border: 2px dashed var(--color-border-subtle);
    border-radius: var(--radius-lg);
    text-align: center;
  }

  .canvas-icon {
    font-size: 4rem;
  }

  .canvas-placeholder h2 {
    margin: 0;
    font-size: var(--font-size-2xl);
    font-weight: var(--font-weight-bold);
    color: var(--color-text-primary);
  }

  .canvas-placeholder p {
    margin: 0;
    font-size: var(--font-size-lg);
    color: var(--color-text-secondary);
  }

  .canvas-hint {
    font-size: var(--font-size-sm) !important;
    color: var(--color-text-tertiary) !important;
    max-width: 400px;
  }
</style>
