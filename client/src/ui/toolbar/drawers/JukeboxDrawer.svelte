<script lang="ts">
/**
 * JukeboxDrawer component.
 *
 * Audio player with playlist, transport controls, and volume.
 */
</script>

<div class="drawer-content">
  <div class="drawer-section">
    <h3 class="drawer-section__title">Now Playing</h3>
    <div class="now-playing">
      <p class="text-secondary">No track playing</p>
    </div>
  </div>

  <div class="drawer-section">
    <div class="transport-controls">
      <button class="btn btn-sm" aria-label="Previous">⏮</button>
      <button class="btn btn-sm btn-primary" aria-label="Play">▶</button>
      <button class="btn btn-sm" aria-label="Next">⏭</button>
    </div>
  </div>

  <div class="drawer-section">
    <h3 class="drawer-section__title">Volume</h3>
    <input type="range" min="0" max="100" value="70" class="slider" aria-label="Volume" />
  </div>

  <div class="drawer-section">
    <h3 class="drawer-section__title">Playlist</h3>
    <p class="text-secondary">No tracks in playlist</p>
  </div>
</div>

<style>
  .drawer-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .drawer-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .drawer-section__title {
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
    margin: 0;
  }

  .now-playing {
    padding: var(--space-md);
    background-color: var(--color-bg-tertiary);
    border-radius: var(--radius-sm);
    text-align: center;
  }

  .transport-controls {
    display: flex;
    justify-content: center;
    gap: var(--space-sm);
  }

  .text-secondary {
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
  }

  .slider {
    width: 100%;
  }
</style>
