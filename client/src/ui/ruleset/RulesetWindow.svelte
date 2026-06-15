<script lang="ts">
  /**
   * RulesetWindow — floating window wrapper for HearthML panels.
   *
   * Renders a TabbedWindow containing a PanelRenderer for a ruleset-defined
   * panel in the 'window' slot.
   */

  import type { PanelDef } from '@hearth-vtt/shared';
  import { uiState } from '../../state/ui.svelte';
  import PanelRenderer from './PanelRenderer.svelte';
  import type { BindingContext } from './bindings';

  interface Props {
    panel: PanelDef;
    ctx?: BindingContext;
  }

  let { panel, ctx = { scope: {} } }: Props = $props();

  function handleClose() {
    uiState.closeTab(panel.id);
  }
</script>

<div class="ruleset-window" role="dialog" aria-label={panel.title}>
  <div class="ruleset-window__header">
    <span class="ruleset-window__title">{panel.title}</span>
    <button class="ruleset-window__close" onclick={handleClose} aria-label="Close">
      &times;
    </button>
  </div>
  <div class="ruleset-window__body">
    <PanelRenderer node={panel.content} {ctx} />
  </div>
</div>

<style>
  .ruleset-window {
    display: flex;
    flex-direction: column;
    background: var(--color-bg-surface);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-md);
    min-width: 200px;
    min-height: 100px;
  }
  .ruleset-window__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-sm) var(--space-md);
    border-bottom: 1px solid var(--color-border-subtle);
    cursor: grab;
  }
  .ruleset-window__title {
    font-size: var(--font-size-body);
    font-weight: 600;
  }
  .ruleset-window__close {
    background: none;
    border: none;
    font-size: 1.2em;
    cursor: pointer;
    color: var(--color-text-muted);
    padding: 0;
    line-height: 1;
  }
  .ruleset-window__close:hover {
    color: var(--color-text-default);
  }
  .ruleset-window__body {
    padding: var(--space-md);
    overflow-y: auto;
    flex: 1;
  }
</style>
