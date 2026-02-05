<script lang="ts">
/**
 * JukeboxDrawer - Music and ambient sound controls.
 * 
 * Play background music and ambient audio tracks.
 */
</script>

<div class="jukebox-drawer">
  <div class="component-label">
    <strong>JukeboxDrawer</strong>
  </div>
  <p class="component-description">
    Background music and ambient audio
  </p>
  <div class="placeholder-content">
    <div class="now-playing">
      <div class="track-info">
        <div class="track-title">🎵 Tavern Ambience</div>
        <div class="track-progress">
          <div class="progress-bar" style="width: 45%"></div>
        </div>
      </div>
      <div class="playback-controls">
        <button>⏮️</button>
        <button>⏸️</button>
        <button>⏭️</button>
      </div>
    </div>
    
    <div class="track-list">
      <div class="track-item">🎵 Combat Theme</div>
      <div class="track-item">🎵 Dungeon Ambience</div>
      <div class="track-item">🎵 Forest Sounds</div>
      <div class="track-item">🎵 Boss Battle</div>
    </div>
  </div>
</div>

<style>
  .jukebox-drawer {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .component-label strong {
    color: var(--color-text-primary);
    font-size: var(--font-size-md);
  }

  .component-description {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--color-text-tertiary);
  }

  .placeholder-content {
    margin-top: var(--space-md);
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .now-playing {
    padding: var(--space-md);
    background-color: var(--color-bg-tertiary);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-sm);
  }

  .track-info {
    margin-bottom: var(--space-sm);
  }

  .track-title {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-primary);
    margin-bottom: var(--space-xs);
  }

  .track-progress {
    height: 4px;
    background-color: var(--color-bg-primary);
    border-radius: 2px;
    overflow: hidden;
  }

  .progress-bar {
    height: 100%;
    background-color: var(--color-accent-primary);
    transition: width var(--transition-normal);
  }

  .playback-controls {
    display: flex;
    gap: var(--space-sm);
    justify-content: center;
  }

  .playback-controls button {
    padding: var(--space-xs) var(--space-sm);
    background-color: var(--color-bg-primary);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-sm);
    color: var(--color-text-secondary);
    font-size: var(--font-size-md);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .playback-controls button:hover {
    background-color: var(--color-bg-elevated);
    border-color: var(--color-accent-primary);
  }

  .track-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .track-item {
    padding: var(--space-sm);
    background-color: var(--color-bg-tertiary);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .track-item:hover {
    background-color: var(--color-bg-elevated);
    border-color: var(--color-accent-primary);
    color: var(--color-text-primary);
  }
</style>
