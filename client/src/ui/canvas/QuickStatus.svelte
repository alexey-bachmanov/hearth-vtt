<script lang="ts">
  /**
   * QuickStatus - Canvas overlay showing viewport and connection status.
   *
   * Positioned top-left of canvas. Two display modes:
   * - Compact (default): Low opacity, shows map name + zoom % + connection dot
   * - Hover: Full opacity, expands to show zoom slider, grid config, connection details
   */

  import { viewportState } from '../../state/viewport.svelte';
  import { connectionState } from '../../state/connection.svelte';

  let isHovered = $state(false);

  /**
   * Format zoom level as percentage.
   */
  function formatZoom(zoom: number): string {
    return `${Math.round(zoom * 100)}%`;
  }

  /**
   * Get connection status color.
   */
  function getConnectionColor(status: typeof connectionState.status): string {
    switch (status) {
      case 'connected':
        return 'var(--color-success)';
      case 'connecting':
      case 'reconnecting':
        return 'var(--color-warning)';
      case 'disconnected':
        return 'var(--color-danger)';
    }
  }

  /**
   * Get connection status text.
   */
  function getConnectionText(status: typeof connectionState.status): string {
    switch (status) {
      case 'connected':
        return 'Connected';
      case 'connecting':
        return 'Connecting...';
      case 'reconnecting':
        return `Reconnecting (${connectionState.reconnectAttempts})...`;
      case 'disconnected':
        return 'Disconnected';
    }
  }

  /**
   * Handle zoom slider change.
   */
  function handleZoomChange(event: Event) {
    const input = event.target as HTMLInputElement;
    viewportState.setZoom(parseFloat(input.value));
  }

  /**
   * Handle grid spacing change.
   */
  function handleGridSizeChange(event: Event) {
    const input = event.target as HTMLInputElement;
    viewportState.setGridSize(parseInt(input.value, 10));
  }

  /**
   * Toggle snap-to-grid.
   */
  function toggleSnapToGrid() {
    viewportState.toggleSnapToGrid();
  }
</script>

<div
  class="quick-status"
  class:quick-status--expanded={isHovered}
  onmouseenter={() => (isHovered = true)}
  onmouseleave={() => (isHovered = false)}
  role="status"
  aria-label="Viewport and connection status"
>
  <!-- Compact View (always visible) -->
  <div class="quick-status__compact">
    <!-- Connection Indicator -->
    <div
      class="connection-dot"
      style:background-color={getConnectionColor(connectionState.status)}
      title={getConnectionText(connectionState.status)}
    ></div>

    <!-- Map Name -->
    <span class="map-name">
      {viewportState.mapName || 'No Map'}
    </span>

    <!-- Zoom Level -->
    <span class="zoom-level">{formatZoom(viewportState.zoom)}</span>
  </div>

  <!-- Expanded View (on hover) -->
  {#if isHovered}
    <div class="quick-status__expanded">
      <!-- Connection Status -->
      <div class="status-row">
        <span class="status-label">Connection:</span>
        <span class="status-value">{getConnectionText(connectionState.status)}</span>
      </div>

      <!-- Zoom Slider -->
      <div class="status-row">
        <span class="status-label">Zoom:</span>
        <input
          type="range"
          min="0.1"
          max="5.0"
          step="0.1"
          value={viewportState.zoom}
          oninput={handleZoomChange}
          class="zoom-slider"
        />
        <span class="status-value">{formatZoom(viewportState.zoom)}</span>
      </div>

      <!-- Grid Spacing -->
      <div class="status-row">
        <span class="status-label">Grid:</span>
        <input
          type="number"
          min="10"
          max="200"
          step="5"
          value={viewportState.gridSize}
          oninput={handleGridSizeChange}
          class="grid-input"
        />
        <span class="status-value">px ({viewportState.gridScale})</span>
      </div>

      <!-- Snap to Grid Toggle -->
      <div class="status-row">
        <span class="status-label">Snap:</span>
        <button
          class="snap-toggle"
          class:snap-toggle--active={viewportState.snapToGrid}
          onclick={toggleSnapToGrid}
        >
          {viewportState.snapToGrid ? 'On' : 'Off'}
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .quick-status {
    position: relative;
    padding: var(--space-sm) var(--space-md);
    background-color: var(--color-bg-elevated);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md);
    transition:
      opacity var(--transition-fast),
      background-color var(--transition-fast);
    opacity: 0.6;
    pointer-events: auto;
    align-self: flex-start;
  }

  .quick-status:hover {
    opacity: 1;
  }

  /* Compact View */
  .quick-status__compact {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    font-size: var(--font-size-sm);
  }

  .connection-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .map-name {
    color: var(--color-text-primary);
    font-weight: var(--font-weight-medium);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 200px;
  }

  .zoom-level {
    color: var(--color-text-secondary);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
    font-variant-numeric: tabular-nums;
  }

  /* Expanded View */
  .quick-status__expanded {
    margin-top: var(--space-md);
    padding-top: var(--space-md);
    border-top: 1px solid var(--color-border-default);
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .status-row {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    font-size: var(--font-size-sm);
  }

  .status-label {
    min-width: 80px;
    color: var(--color-text-secondary);
    font-weight: var(--font-weight-medium);
  }

  .status-value {
    color: var(--color-text-primary);
    font-variant-numeric: tabular-nums;
  }

  /* Zoom Slider */
  .zoom-slider {
    flex: 1;
    height: 4px;
    background: var(--color-bg-tertiary);
    border-radius: var(--radius-full);
    outline: none;
    cursor: pointer;
  }

  .zoom-slider::-webkit-slider-thumb {
    appearance: none;
    width: 16px;
    height: 16px;
    background: var(--color-accent-primary);
    border-radius: 50%;
    cursor: pointer;
    transition: background-color var(--transition-fast);
  }

  .zoom-slider::-webkit-slider-thumb:hover {
    background: var(--color-accent-hover);
  }

  .zoom-slider::-moz-range-thumb {
    width: 16px;
    height: 16px;
    background: var(--color-accent-primary);
    border: none;
    border-radius: 50%;
    cursor: pointer;
    transition: background-color var(--transition-fast);
  }

  .zoom-slider::-moz-range-thumb:hover {
    background: var(--color-accent-hover);
  }

  /* Grid Input */
  .grid-input {
    width: 60px;
    padding: var(--space-xs);
    background-color: var(--color-bg-tertiary);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-sm);
    color: var(--color-text-primary);
    font-size: var(--font-size-sm);
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  .grid-input:focus {
    outline: none;
    border-color: var(--color-accent-primary);
  }

  /* Snap Toggle Button */
  .snap-toggle {
    padding: var(--space-xs) var(--space-sm);
    background-color: var(--color-bg-tertiary);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-sm);
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition:
      background-color var(--transition-fast),
      border-color var(--transition-fast),
      color var(--transition-fast);
    min-width: 48px;
  }

  .snap-toggle:hover {
    background-color: var(--color-bg-hover);
    border-color: var(--color-border-hover);
  }

  .snap-toggle--active {
    background-color: var(--color-accent-primary);
    border-color: var(--color-accent-primary);
    color: white;
  }

  .snap-toggle--active:hover {
    background-color: var(--color-accent-hover);
    border-color: var(--color-accent-hover);
  }
</style>
