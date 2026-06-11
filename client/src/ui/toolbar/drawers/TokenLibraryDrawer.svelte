<script lang="ts">
/**
 * TokenLibraryDrawer component (GM only).
 *
 * Actor browser for dragging tokens to the map.
 *
 * NOTE: D&D-specific filtering (type == 'pc'/'npc'/'monster') and stat
 * displays (HP, class/level) were removed in Engine v0.2 Schema
 * De-D&D-ification. All actors are now shown in a flat list with name only.
 * Ruleset-defined category logic will replace this when designed.
 */

import { campaignState } from '../../../state';

const actors = $derived(Array.from(campaignState.actors.values()));
</script>

<div class="drawer__section-list">
  <div class="drawer__section">
    <input
      type="search"
      class="form-input"
      placeholder="Search actors..."
      aria-label="Search actors"
    />
  </div>

  <div class="drawer__section">
    <h3 class="drawer__section-title">All Actors ({actors.length})</h3>
    <div class="actor-list">
      {#each actors as actor (actor.id)}
        <button class="actor-item" draggable="true">
          <span class="actor-item__icon">🧙</span>
          <div class="actor-item__info">
            <span class="actor-item__name">{actor.name}</span>
          </div>
        </button>
      {/each}
    </div>
  </div>

  <div class="drawer__section">
    <button class="btn btn--primary">New Actor</button>
  </div>
</div>

<style>
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
