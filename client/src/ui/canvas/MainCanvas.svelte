<script lang="ts">
/**
 * MainCanvas — PixiJS canvas wrapper.
 *
 * Owns the <canvas> element and bridges reactive Svelte state → the imperative
 * PixiJS renderer via $effect blocks. This is the only place in the codebase
 * that couples Svelte runes to renderer calls.
 *
 * Rendering state flow:
 *   campaignState / viewportState ($effect) → renderer.setScene / updateTokens / setViewport
 *   selectionState ($effect) → renderer.setSelection / setHover
 *
 * Input state flow:
 *   canvas pointer/wheel events → CanvasInputController → viewportState / campaignState / selectionState
 *   canvas keydown (Escape) → selectionState.clear
 */

import { onMount } from 'svelte';
import { createRenderer, type Renderer } from '../../render';
import { CanvasInputController } from '../../app/canvas-input-controller';
import { campaignState } from '../../state/campaign.svelte';
import { viewportState } from '../../state/viewport.svelte';
import { uiState } from '../../state/ui.svelte';
import { seatPermissions } from '../../state/seatPermissions.svelte';
import { selectionState } from '../../state/selection.svelte';

let canvasElement: HTMLCanvasElement;
let containerElement: HTMLDivElement;
let renderer: Renderer | null = $state(null);

onMount(() => {
  let detach: (() => void) | null = null;

  (async () => {
    renderer = await createRenderer();
    await renderer.init(canvasElement);

    const ctl = new CanvasInputController({
      viewportState,
      campaignState,
      renderer,
      onContextMenu: (target) => uiState.openContextMenu(target),
      canDragToken: (tokenId) => seatPermissions.canDragToken(tokenId),
    });
    detach = ctl.attach(canvasElement);

    // Focus the container so keyboard shortcuts work immediately after load.
    containerElement.focus();
  })();

  return () => {
    detach?.();
    renderer?.dispose();
    renderer = null;
  };
});

function handleKeyDown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    selectionState.clear();
  }
}

// ---- Reactive bridges (state → renderer) ------------------------------------
// Each $effect re-runs whenever its reactive dependencies change.
// The renderer queues calls internally if it isn't ready yet.

$effect(() => {
  renderer?.setScene(campaignState.getActiveScene());
});

$effect(() => {
  renderer?.updateTokens(campaignState.getActiveSceneTokens());
});

$effect(() => {
  renderer?.setViewport({
    zoom: viewportState.zoom,
    panOffset: viewportState.panOffset,
  });
});

$effect(() => {
  renderer?.setSelection([...selectionState.selectedTokenIds]);
});

$effect(() => {
  renderer?.setHover(selectionState.hoveredTokenId);
});
</script>

<div
  class="main-canvas-container"
  tabindex="0"
  role="region"
  aria-label="Game canvas"
  bind:this={containerElement}
  onkeydown={handleKeyDown}
>
  <canvas bind:this={canvasElement} class="main-canvas"></canvas>
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
    display: block;
  }
</style>
