<script lang="ts">
/**
 * TokenLibraryDrawer component (GM only).
 *
 * Actor browser for dragging tokens to the map.
 */

import { campaignState } from '../../../state';

const actors = $derived(Array.from(campaignState.actors.values()));
const playerActors = $derived(actors.filter((a) => a.type === 'pc'));
const npcActors = $derived(actors.filter((a) => a.type === 'npc'));
const monsterActors = $derived(actors.filter((a) => a.type === 'monster'));
</script>

<div class="drawer-content">
  <div class="drawer-section">
    <input
      type="search"
      class="form-input"
      placeholder="Search actors..."
      aria-label="Search actors"
    />
  </div>

  <div class="drawer-section">
    <h3 class="drawer-section__title">Player Characters ({playerActors.length})</h3>
    <div class="actor-list">
      {#each playerActors as actor}
        <button class="actor-item" draggable="true">
          <span class="actor-item__icon">🧙</span>
          <div class="actor-item__info">
            <span class="actor-item__name">{actor.name}</span>
            <span class="actor-item__meta">{actor.class} {actor.level}</span>
          </div>
        </button>
      {/each}
    </div>
  </div>

  <div class="drawer-section">
    <h3 class="drawer-section__title">NPCs ({npcActors.length})</h3>
    <div class="actor-list">
      {#each npcActors as actor}
        <button class="actor-item" draggable="true">
          <span class="actor-item__icon">👤</span>
          <div class="actor-item__info">
            <span class="actor-item__name">{actor.name}</span>
            <span class="actor-item__meta">{actor.class || 'NPC'} {actor.level || ''}</span>
          </div>
        </button>
      {/each}
    </div>
  </div>

  <div class="drawer-section">
    <h3 class="drawer-section__title">Monsters ({monsterActors.length})</h3>
    <div class="actor-list">
      {#each monsterActors as actor}
        <button class="actor-item" draggable="true">
          <span class="actor-item__icon">👹</span>
          <div class="actor-item__info">
            <span class="actor-item__name">{actor.name}</span>
            <span class="actor-item__meta">HP: {actor.hp.current}/{actor.hp.max}</span>
          </div>
        </button>
      {/each}
    </div>
  </div>

  <div class="drawer-section">
    <button class="btn btn-primary">New Actor</button>
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

  .actor-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .actor-item {
    display: flex;
    gap: var(--space-sm);
    padding: var(--space-sm);
    background: transparent;
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-sm);
    text-align: left;
    cursor: grab;
    transition: all var(--transition-fast);
  }

  .actor-item:hover {
    background-color: var(--color-bg-hover);
    border-color: var(--color-border-hover);
  }

  .actor-item:active {
    cursor: grabbing;
  }

  .actor-item__icon {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: var(--color-bg-tertiary);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-xl);
  }

  .actor-item__info {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .actor-item__name {
    font-weight: var(--font-weight-medium);
    color: var(--color-text-primary);
  }

  .actor-item__meta {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }
</style>
