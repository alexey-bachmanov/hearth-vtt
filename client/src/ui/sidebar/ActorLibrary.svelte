<script lang="ts">
/**
 * ActorLibrary - Campaign monsters, NPCs, and templates.
 * 
 * GM tool for browsing and dragging actors/monsters onto the map.
 */
</script>

<div class="actor-library">
  <div class="component-label">
    <strong>ActorLibrary</strong>
  </div>
  <p class="component-description">
    Campaign monsters, NPCs — drag to map
  </p>
  <div class="placeholder-content">
    <div class="actor-list">
      <div class="actor-item">🐲 Ancient Red Dragon</div>
      <div class="actor-item">⚔️ Goblin Warrior</div>
      <div class="actor-item">🧙 Wizard NPC</div>
      <div class="actor-item">🐺 Dire Wolf</div>
      <div class="actor-item">👤 Generic Guard</div>
    </div>
  </div>
</div>

<style>
  .actor-library {
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
  }

  .actor-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .actor-item {
    padding: var(--space-sm);
    background-color: var(--color-bg-tertiary);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    cursor: move;
    transition: all var(--transition-fast);
  }

  .actor-item:hover {
    background-color: var(--color-bg-elevated);
    border-color: var(--color-accent-primary);
    color: var(--color-text-primary);
  }
</style>
