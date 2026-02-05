<script lang="ts">
/**
 * BottomToolbar - Horizontal tool palette.
 * 
 * Contains dice roller, initiative tracker, and canvas tools.
 */

import DiceRoller from './DiceRoller.svelte';
import InitiativeTracker from './InitiativeTracker.svelte';
import DrawingTools from './DrawingTools.svelte';
import MeasurementTool from './MeasurementTool.svelte';
import PingTool from './PingTool.svelte';
</script>

<div class="bottom-toolbar">
  <div class="toolbar-section">
    <DiceRoller />
  </div>
  
  <div class="toolbar-divider"></div>
  
  <div class="toolbar-section">
    <InitiativeTracker />
  </div>
  
  <div class="toolbar-divider"></div>
  
  <div class="toolbar-section">
    <DrawingTools />
  </div>
  
  <div class="toolbar-divider"></div>
  
  <div class="toolbar-section">
    <MeasurementTool />
  </div>
  
  <div class="toolbar-divider"></div>
  
  <div class="toolbar-section">
    <PingTool />
  </div>
</div>

<style>
  .bottom-toolbar {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    background-color: var(--color-bg-secondary);
    border-top: 1px solid var(--color-border-default);
    height: var(--toolbar-height);
  }

  .toolbar-section {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .toolbar-divider {
    width: 1px;
    height: 32px;
    background-color: var(--color-border-subtle);
  }
</style>
