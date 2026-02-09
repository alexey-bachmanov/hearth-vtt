<script lang="ts">
/**
 * JukeboxDrawer component.
 *
 * Audio player with playlist, transport controls, and volume.
 */
</script>

<div class="drawer__section-list">
  <div class="drawer__section">
    <h3 class="drawer__section-title">Now Playing</h3>
    <div class="now-playing">
      <p class="text--secondary">No track playing</p>
    </div>
  </div>

  <div class="drawer__section">
    <div class="transport-controls">
      <button class="btn btn--sm" aria-label="Previous">⏮</button>
      <button class="btn btn--sm btn--primary" aria-label="Play">▶</button>
      <button class="btn btn--sm" aria-label="Next">⏭</button>
    </div>
  </div>

  <div class="drawer__section">
    <h3 class="drawer__section-title">Volume</h3>
    <input type="range" min="0" max="100" value="70" class="slider" aria-label="Volume" />
  </div>

  <div class="drawer__section">
    <h3 class="drawer__section-title">Playlist</h3>
    <p class="text--secondary">No tracks in playlist</p>
  </div>
</div>

<style>
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

  .slider {
    width: 100%;
  }
</style>
